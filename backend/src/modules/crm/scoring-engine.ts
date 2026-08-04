import { recordDomainEvent } from '../events/repository.js'
import type { DomainEventEnvelope } from '../events/types.js'
import {
  getActiveScoringModel,
  listActiveScoringRules,
  type ScoringRule,
} from './scoring-repository.js'

type Queryable = {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>
}
type ScoringPool = { connect: () => Promise<Queryable & { release: () => void | Promise<void> }> }

export type ScoringResult = {
  eventId: string
  eventType: string
  leadId?: string
  appliedRules: number
  appliedRuleIds: string[]
  fitScore: number
  intentScore: number
  combinedScore: number
  previousFitScore: number
  previousIntentScore: number
  previousCombinedScore: number
  changed: boolean
  derivedEventIds: string[]
}

type LeadRow = {
  id: string
  organization_id: string
  crm_instance_id: string | null
  fit_score: number | null
  intent_score: number | null
  score: number | null
  name?: string | null
  email?: string | null
  phone?: string | null
  company?: string | null
  source?: string | null
  stage?: string | null
  status?: string | null
  attribution_context?: Record<string, unknown> | null
}

type InsertedScoreEvent = { id: string }
type ExistingThresholdEvent = { id: string }

export function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)))
}

export function combinedScore(fit: number, intent: number, fitWeight: number, intentWeight: number): number {
  return clampScore((fit * fitWeight + intent * intentWeight) / 100)
}

export function matchesScoringRule(rule: ScoringRule, context: Record<string, unknown>): boolean {
  if (rule.fieldPath && !isSafeFieldPath(rule.fieldPath)) return false
  if (!rule.operator) return true

  const value = rule.fieldPath ? readFieldPath(context, rule.fieldPath) : undefined
  const comparison = rule.comparisonValue

  switch (rule.operator) {
    case 'exists':
      return value !== undefined && value !== null && value !== ''
    case 'equals':
      return deepEqual(value, comparison)
    case 'not_equals':
      return !deepEqual(value, comparison)
    case 'contains':
      if (typeof value === 'string') return value.toLocaleLowerCase().includes(String(comparison ?? '').toLocaleLowerCase())
      if (Array.isArray(value)) return value.some((item) => deepEqual(item, comparison))
      return false
    case 'greater_than':
      return numericComparison(value, comparison, (left, right) => left > right)
    case 'less_than':
      return numericComparison(value, comparison, (left, right) => left < right)
    default:
      return false
  }
}

export async function applyLeadScoringEvent(
  pool: ScoringPool,
  event: DomainEventEnvelope,
): Promise<ScoringResult> {
  const empty = emptyResult(event)
  if (!event.leadId || !event.crmInstanceId || isDerivedScoreEvent(event.eventType)) return empty

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const leadResult = await client.query<LeadRow>(
      `SELECT id, organization_id, crm_instance_id, fit_score, intent_score, score,
              name, email, phone, company, source, stage, status, attribution_context
       FROM public.leads
       WHERE id = $1 AND crm_instance_id = $2
       FOR UPDATE`,
      [event.leadId, event.crmInstanceId],
    )
    const lead = leadResult.rows[0]
    if (!lead) {
      await client.query('COMMIT')
      return empty
    }

    const model = await getActiveScoringModel(client, event.crmInstanceId)
    if (!model) {
      await client.query('COMMIT')
      return empty
    }
    const rules = await listActiveScoringRules(client, model.id, event.eventType)
    const context = buildScoringContext(event, lead)
    const previousFitScore = clampScore(lead.fit_score ?? 0)
    const previousIntentScore = clampScore(lead.intent_score ?? 0)
    const previousCombinedScore = combinedScore(previousFitScore, previousIntentScore, model.fitWeight, model.intentWeight)
    let fitScore = previousFitScore
    let intentScore = previousIntentScore
    const appliedRuleIds: string[] = []

    for (const rule of rules) {
      if (!matchesScoringRule(rule, context)) continue
      const before = rule.dimension === 'fit' ? fitScore : intentScore
      const after = clampScore(before + rule.points)
      const inserted = await client.query<InsertedScoreEvent>(
        `INSERT INTO public.lead_score_events (
           organization_id, crm_instance_id, lead_id, rule_id, event_key,
           event_type, dimension, points, previous_score, resulting_score,
           context, occurred_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         ON CONFLICT (rule_id, event_key) DO NOTHING
         RETURNING id`,
        [
          lead.organization_id,
          event.crmInstanceId,
          lead.id,
          rule.id,
          event.eventId,
          event.eventType,
          rule.dimension,
          rule.points,
          before,
          after,
          { eventId: event.eventId, eventType: event.eventType, actor: event.actor, payload: event.payload },
          event.occurredAt,
        ],
      )
      if (!inserted.rows[0]) continue
      if (rule.dimension === 'fit') fitScore = after
      else intentScore = after
      appliedRuleIds.push(rule.id)
    }

    const nextCombinedScore = combinedScore(fitScore, intentScore, model.fitWeight, model.intentWeight)
    const changed = fitScore !== previousFitScore || intentScore !== previousIntentScore || nextCombinedScore !== previousCombinedScore
    const derivedEventIds: string[] = []

    if (changed) {
      await client.query(
        `UPDATE public.leads
         SET fit_score = $2, intent_score = $3, score = $4, updated_at = NOW()
         WHERE id = $1`,
        [lead.id, fitScore, intentScore, nextCombinedScore],
      )

      const scoreChanged = await recordDomainEvent(client, {
        eventType: 'lead.score_changed',
        organizationId: lead.organization_id,
        crmInstanceId: event.crmInstanceId,
        aggregateType: 'lead',
        aggregateId: lead.id,
        leadId: lead.id,
        actor: { type: 'system' },
        occurredAt: event.occurredAt,
        parent: event,
        payload: {
          previousFitScore,
          fitScore,
          previousIntentScore,
          intentScore,
          previousCombinedScore,
          combinedScore: nextCombinedScore,
          appliedRuleIds,
          sourceEventType: event.eventType,
          sourceEventId: event.eventId,
        },
      })
      derivedEventIds.push(scoreChanged.eventId)

      for (const threshold of model.thresholds) {
        const direction = thresholdDirection(previousCombinedScore, nextCombinedScore, threshold)
        if (!direction) continue
        const existing = await client.query<ExistingThresholdEvent>(
          `SELECT id
           FROM public.domain_events
           WHERE event_type = 'lead.score_threshold_reached'
             AND lead_id = $1
             AND payload->>'threshold' = $2
             AND payload->>'direction' = $3
           LIMIT 1`,
          [lead.id, String(threshold), direction],
        )
        if (existing.rows[0]) continue
        const thresholdEvent = await recordDomainEvent(client, {
          eventType: 'lead.score_threshold_reached',
          organizationId: lead.organization_id,
          crmInstanceId: event.crmInstanceId,
          aggregateType: 'lead',
          aggregateId: lead.id,
          leadId: lead.id,
          actor: { type: 'system' },
          occurredAt: event.occurredAt,
          parent: scoreChanged,
          payload: {
            threshold,
            direction,
            previousCombinedScore,
            combinedScore: nextCombinedScore,
            sourceEventId: event.eventId,
          },
        })
        derivedEventIds.push(thresholdEvent.eventId)
      }
    }

    await client.query('COMMIT')
    return {
      eventId: event.eventId,
      eventType: event.eventType,
      leadId: lead.id,
      appliedRules: appliedRuleIds.length,
      appliedRuleIds,
      fitScore,
      intentScore,
      combinedScore: nextCombinedScore,
      previousFitScore,
      previousIntentScore,
      previousCombinedScore,
      changed,
      derivedEventIds,
    }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    await client.release()
  }
}

function buildScoringContext(event: DomainEventEnvelope, lead: LeadRow): Record<string, unknown> {
  return {
    ...lead,
    ...(event.payload ?? {}),
    lead,
    payload: event.payload ?? {},
    event: {
      id: event.eventId,
      type: event.eventType,
      actor: event.actor,
      occurredAt: event.occurredAt,
    },
  }
}

function readFieldPath(context: Record<string, unknown>, fieldPath: string): unknown {
  return fieldPath.split('.').reduce<unknown>((current, segment) => {
    if (!current || typeof current !== 'object') return undefined
    return (current as Record<string, unknown>)[segment]
  }, context)
}

function isSafeFieldPath(fieldPath: string): boolean {
  return fieldPath.split('.').every((segment) => /^[A-Za-z0-9_]+$/.test(segment))
}

function numericComparison(value: unknown, comparison: unknown, predicate: (left: number, right: number) => boolean): boolean {
  const left = typeof value === 'number' ? value : Number(value)
  const right = typeof comparison === 'number' ? comparison : Number(comparison)
  return Number.isFinite(left) && Number.isFinite(right) && predicate(left, right)
}

function deepEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((item, index) => deepEqual(item, right[index]))
  }
  if (left && right && typeof left === 'object' && typeof right === 'object') {
    const leftEntries = Object.entries(left as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))
    const rightEntries = Object.entries(right as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))
    return leftEntries.length === rightEntries.length
      && leftEntries.every(([key, value], index) => key === rightEntries[index]?.[0] && deepEqual(value, rightEntries[index]?.[1]))
  }
  return false
}

function thresholdDirection(previous: number, next: number, threshold: number): 'up' | 'down' | null {
  if (previous < threshold && next >= threshold) return 'up'
  if (previous >= threshold && next < threshold) return 'down'
  return null
}

function isDerivedScoreEvent(eventType: string): boolean {
  return eventType === 'lead.score_changed' || eventType === 'lead.score_threshold_reached' || eventType === 'lead.score_manual_adjustment'
}

function emptyResult(event: DomainEventEnvelope): ScoringResult {
  return {
    eventId: event.eventId,
    eventType: event.eventType,
    leadId: event.leadId,
    appliedRules: 0,
    appliedRuleIds: [],
    fitScore: 0,
    intentScore: 0,
    combinedScore: 0,
    previousFitScore: 0,
    previousIntentScore: 0,
    previousCombinedScore: 0,
    changed: false,
    derivedEventIds: [],
  }
}
