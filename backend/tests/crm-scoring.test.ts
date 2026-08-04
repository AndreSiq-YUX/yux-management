import { describe, expect, it } from 'vitest'
import { applyLeadScoringEvent, clampScore, combinedScore, matchesScoringRule } from '../src/modules/crm/scoring-engine.js'
import type { DomainEventEnvelope } from '../src/modules/events/types.js'
import type { ScoringRule } from '../src/modules/crm/scoring-repository.js'

const ids = {
  organization: '22222222-2222-4222-8222-222222222222',
  crmInstance: '33333333-3333-4333-8333-333333333333',
  lead: '44444444-4444-4444-8444-444444444444',
  event: '55555555-5555-4555-8555-555555555555',
  model: '66666666-6666-4666-8666-666666666666',
  fitRule: '77777777-7777-4777-8777-777777777777',
  intentRule: '88888888-8888-4888-8888-888888888888',
  fitScoreEvent: '99999999-9999-4999-8999-999999999999',
  intentScoreEvent: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  changedEvent: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
}

const event: DomainEventEnvelope = {
  eventId: ids.event,
  eventType: 'form.submitted',
  schemaVersion: 1,
  organizationId: ids.organization,
  crmInstanceId: ids.crmInstance,
  aggregateType: 'lead',
  aggregateId: ids.lead,
  leadId: ids.lead,
  correlationId: ids.event,
  depth: 0,
  actor: { type: 'lead', id: ids.lead },
  occurredAt: '2026-08-04T12:00:00.000Z',
  automationTrace: [],
  payload: { country: 'BR', intent: 'high' },
}

const modelRow = {
  id: ids.model,
  crm_instance_id: ids.crmInstance,
  name: 'Modelo padrão',
  fit_weight: 40,
  intent_weight: 60,
  thresholds: [],
  is_active: true,
  created_by: null,
  created_at: '2026-08-04T11:00:00.000Z',
  updated_at: '2026-08-04T11:00:00.000Z',
}

const rules: ScoringRule[] = [
  {
    id: ids.fitRule,
    modelId: ids.model,
    name: 'País BR',
    dimension: 'fit',
    eventType: 'form.submitted',
    fieldPath: 'country',
    operator: 'equals',
    comparisonValue: 'BR',
    points: 40,
    isActive: true,
    createdAt: modelRow.created_at,
    updatedAt: modelRow.updated_at,
  },
  {
    id: ids.intentRule,
    modelId: ids.model,
    name: 'Intenção alta',
    dimension: 'intent',
    eventType: 'form.submitted',
    fieldPath: 'intent',
    operator: 'equals',
    comparisonValue: 'high',
    points: 15,
    isActive: true,
    createdAt: modelRow.created_at,
    updatedAt: modelRow.updated_at,
  },
]

class FakeClient {
  calls: Array<{ sql: string; params?: unknown[] }> = []
  allDuplicates = false
  async query<T = Record<string, unknown>>(sql: string, params?: unknown[]) {
    this.calls.push({ sql, params })
    if (sql.includes('FROM public.leads')) return { rows: [{
      id: ids.lead,
      organization_id: ids.organization,
      crm_instance_id: ids.crmInstance,
      fit_score: 0,
      intent_score: 0,
      score: 0,
      name: 'Lead',
      email: 'lead@example.com',
      attribution_context: {},
    }] as T[] }
    if (sql.includes('FROM public.lead_scoring_models')) return { rows: [modelRow] as T[] }
    if (sql.includes('FROM public.lead_scoring_rules')) return { rows: rules.map((rule) => ({
      id: rule.id,
      model_id: rule.modelId,
      name: rule.name,
      dimension: rule.dimension,
      event_type: rule.eventType,
      field_path: rule.fieldPath,
      operator: rule.operator,
      comparison_value: rule.comparisonValue,
      points: rule.points,
      is_active: rule.isActive,
      created_at: rule.createdAt,
      updated_at: rule.updatedAt,
    })) as T[] }
    if (sql.includes('INSERT INTO public.lead_score_events')) {
      if (this.allDuplicates) return { rows: [] as T[] }
      return { rows: [{ id: this.calls.filter((call) => call.sql.includes('INSERT INTO public.lead_score_events')).length === 1 ? ids.fitScoreEvent : ids.intentScoreEvent }] as T[] }
    }
    if (sql.includes('INSERT INTO public.domain_events')) {
      return { rows: [{
        id: ids.changedEvent,
        organization_id: ids.organization,
        crm_instance_id: ids.crmInstance,
        event_type: 'lead.score_changed',
        schema_version: 1,
        aggregate_type: 'lead',
        aggregate_id: ids.lead,
        lead_id: ids.lead,
        correlation_id: ids.event,
        causation_id: ids.event,
        depth: 1,
        actor: { type: 'system' },
        occurred_at: event.occurredAt,
        automation_trace: [],
        payload: {},
      }] as T[] }
    }
    if (sql.includes('FROM public.domain_events')) return { rows: [] as T[] }
    return { rows: [] as T[] }
  }
  release() {}
}

function createPool(client: FakeClient) {
  return { async connect() { return client } }
}

describe('scoring pure functions', () => {
  it('clamps dimensions and combines the configured weights', () => {
    expect(clampScore(-10)).toBe(0)
    expect(clampScore(108)).toBe(100)
    expect(combinedScore(40, 15, 40, 60)).toBe(25)
  })

  it('matches safe nested attributes without evaluating expressions', () => {
    expect(matchesScoringRule(rules[0], { country: 'BR' })).toBe(true)
    expect(matchesScoringRule({ ...rules[0], fieldPath: 'payload.country' }, { payload: { country: 'BR' } })).toBe(true)
    expect(matchesScoringRule({ ...rules[0], fieldPath: 'payload[0]' }, { payload: ['BR'] })).toBe(false)
  })
})

describe('idempotent lead scoring engine', () => {
  it('applies fit and intent independently, persists one event per rule, and emits score_changed', async () => {
    const client = new FakeClient()
    const result = await applyLeadScoringEvent(createPool(client), event)

    expect(result).toMatchObject({
      appliedRules: 2,
      fitScore: 40,
      intentScore: 15,
      combinedScore: 25,
      changed: true,
    })
    expect(client.calls.filter((call) => call.sql.includes('INSERT INTO public.lead_score_events'))).toHaveLength(2)
    expect(client.calls.some((call) => call.sql.includes("eventType: 'lead.score_changed'"))).toBe(false)
    expect(client.calls.some((call) => call.sql.includes('INSERT INTO public.domain_events'))).toBe(true)
    expect(client.calls.some((call) => call.sql.includes('ON CONFLICT (rule_id, event_key) DO NOTHING'))).toBe(true)
  })

  it('does not apply a duplicate rule event twice', async () => {
    const client = new FakeClient()
    client.allDuplicates = true
    const result = await applyLeadScoringEvent(createPool(client), event)
    expect(result.appliedRules).toBe(0)
    expect(result.changed).toBe(false)
    expect(client.calls.some((call) => call.sql.includes('UPDATE public.leads'))).toBe(false)
  })
})
