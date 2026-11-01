import type { AuthUser } from '../../auth/routes.js'
import {
  getLeadProfile,
  getProfileConfiguration,
  type ProfileDb,
  profileError,
} from './record-profile.js'
import {
  qualificationRuleSchema,
  evaluateProfileRule,
  matchesQualification,
  ruleContribution,
  scoreTemperature,
} from './qualification.js'
import { recordDomainEvent } from '../events/repository.js'
import type { DomainEventEnvelope } from '../events/types.js'

export type QualificationDb = ProfileDb
type ModelRow = {
  id: string
  calculation_mode: string
  warm_threshold: number
  hot_threshold: number
}
type LeadRow = {
  id: string
  organization_id: string
  crm_instance_id: string
  record_type_id: string | null
  score: number
  score_model_id: string|null
  fit_score: number
  intent_score: number
  company: string | null
  source: string | null
  value: string | null
  stage_id: string
  deleted_at?: string | null
}
export async function scoringAccess(
  db: QualificationDb,
  user: AuthUser,
  instanceId: string,
  write = false,
) {
  const configuration = await getProfileConfiguration(db, user, instanceId)
  if (write && !['yux_admin', 'yux_operator'].includes(user.role)) {
    const membership = await db.query<{ id: string }>(
      `SELECT id FROM public.crm_instance_members WHERE crm_instance_id=$1 AND user_id=$2 AND status='active' AND role IN ('client_admin','manager','yux_admin')`,
      [instanceId, user.id],
    )
    if (!membership.rows[0])
      throw profileError(
        403,
        'Somente administradores e gestores autorizados podem configurar a pontuação.',
      )
  }
  return configuration
}
export async function qualificationFields(
  db: QualificationDb,
  user: AuthUser,
  instanceId: string,
) {
  const config = await scoringAccess(db, user, instanceId)
  return [
    {
      key: 'recordTypeId',
      label: 'Tipo de cliente',
      type: 'select',
      options: config.recordTypes
        .filter((t) => t.isActive)
        .map((t) => ({ value: t.id, label: t.name })),
      recordTypeId: null,
    },
    ...[
      ['lead.company', 'Empresa', 'text'],
      ['lead.source', 'Origem', 'text'],
      ['lead.value', 'Valor estimado', 'number'],
      ['lead.stage_id', 'Etapa do funil', 'stage'],
    ].map(([key, label, type]) => ({
      key,
      label,
      type,
      options: [] as { value: string; label: string }[],
      recordTypeId: null,
    })),
    ...config.fields
      .filter((f) => f.isActive)
      .map((f) => ({
        key: `custom:${f.stableKey}`,
        label: f.label,
        type: f.fieldType,
        options: f.options.map((value) => ({ value, label: value })),
        recordTypeId: f.recordTypeId,
      })),
  ]
}
export async function loadQualificationRules(
  db: QualificationDb,
  modelId: string,
) {
  const result = await db.query<{ id: string; definition: unknown }>(
    `SELECT id,definition FROM public.crm_qualification_rules WHERE model_id=$1 AND is_active ORDER BY created_at,id`,
    [modelId],
  )
  return result.rows.map((row) => ({
    id: row.id,
    ...qualificationRuleSchema.parse(row.definition),
  }))
}
export async function qualificationContext(db: QualificationDb, lead: LeadRow) {
  const values = await db.query<{ field_key: string; value: unknown }>(
    `SELECT v.field_key,v.value FROM public.lead_custom_field_values v
    JOIN LATERAL (SELECT * FROM public.crm_custom_field_definitions WHERE crm_instance_id=$2 AND stable_key=v.field_key ORDER BY version_number DESC LIMIT 1) d ON d.is_active AND (d.record_type_id IS NULL OR d.record_type_id=$3)
    WHERE v.lead_id=$1 AND v.organization_id=$4`,
    [lead.id, lead.crm_instance_id, lead.record_type_id, lead.organization_id],
  )
  return {
    recordTypeId: lead.record_type_id,
    'lead.company': lead.company,
    'lead.source': lead.source,
    'lead.value': lead.value === null ? null : Number(lead.value),
    'lead.stage_id': lead.stage_id,
    ...Object.fromEntries(
      values.rows.map((v) => [`custom:${v.field_key}`, v.value]),
    ),
  } as Record<string, unknown>
}
export async function reconcileQualification(
  db: QualificationDb,
  leadId: string,
  event?: DomainEventEnvelope,
  preview = false,
) {
  const found = await db.query<LeadRow>(
    `SELECT * FROM public.leads WHERE id=$1 FOR UPDATE`,
    [leadId],
  )
  const lead = found.rows[0]
  if (!lead || lead.deleted_at) return null
  const models = await db.query<ModelRow>(
    `SELECT id,calculation_mode,warm_threshold,hot_threshold FROM public.lead_scoring_models WHERE crm_instance_id=$1 AND is_active`,
    [lead.crm_instance_id],
  )
  const model = models.rows[0]
  if (!model || model.calculation_mode !== 'sum') return null
  const previousScore = lead.score_model_id === model.id ? lead.score : 0
  const rules = await loadQualificationRules(db, model.id),
    context = await qualificationContext(db, lead)
  const ledger = await db.query<{
    rule_id: string
    source_key: string
    points: number
    activity_context: Record<string, unknown>
  }>(
    `SELECT rule_id,source_key,points,activity_context FROM public.crm_score_contributions WHERE lead_id=$1 ORDER BY created_at,id`,
    [leadId],
  )
  const contributions: Array<{
    ruleId: string
    name: string
    dimension: string
    points: number
  }> = []
  for (const rule of rules) {
    let points = 0
    if (rule.kind === 'profile') {
      points = evaluateProfileRule(rule, context)
      if (!preview)
        await db.query(
          `INSERT INTO public.crm_score_contributions(organization_id,lead_id,rule_id,source_key,points) VALUES($1,$2,$3,'profile',$4)
        ON CONFLICT(lead_id,rule_id,source_key) DO UPDATE SET points=EXCLUDED.points`,
          [lead.organization_id, leadId, rule.id, points],
        )
    } else {
      const occurrences = ledger.rows.filter(
        (c) => c.rule_id === rule.id && c.source_key !== 'profile',
      )
      if (
        event &&
        event.organizationId === lead.organization_id &&
        event.crmInstanceId === lead.crm_instance_id &&
        event.eventType === rule.eventType
      ) {
        const objectKey =
          event.payload.messageId ||
          event.payload.taskId ||
          event.payload.interactionId ||
          event.eventId
        const sourceKey = `${event.eventType}:${String(objectKey)}`
        if (!occurrences.some((c) => c.source_key === sourceKey)) {
          const activityContext: Record<string, unknown> = {
            'activity.eventType': event.eventType,
            'activity.channel':
              typeof event.payload.channel === 'string'
                ? event.payload.channel
                : null,
            'activity.text':
              typeof event.payload.text === 'string'
                ? event.payload.text.slice(0, 10000)
                : null,
            'activity.stageId':
              typeof event.payload.stageId === 'string'
                ? event.payload.stageId
                : null,
            'activity.interactionType':
              typeof event.payload.type === 'string'
                ? event.payload.type
                : null,
          }
          occurrences.push({
            rule_id: rule.id,
            source_key: sourceKey,
            points: 0,
            activity_context: activityContext,
          })
          if (!preview)
            await db.query(
              `INSERT INTO public.crm_score_contributions(organization_id,lead_id,rule_id,source_key,points,activity_context) VALUES($1,$2,$3,$4,0,$5::jsonb) ON CONFLICT DO NOTHING`,
              [
                lead.organization_id,
                leadId,
                rule.id,
                sourceKey,
                JSON.stringify(activityContext),
              ],
            )
        }
      }
      for (const occurrence of occurrences) {
        const activityContext = occurrence.activity_context || {}
        const sameEvent =
          activityContext['activity.eventType'] === rule.eventType
        const delta =
          sameEvent &&
          matchesQualification(rule, { ...context, ...activityContext })
            ? ruleContribution(points, rule.points, rule.maxContribution)
            : 0
        points += delta
        if (!preview && delta !== occurrence.points)
          await db.query(
            `UPDATE public.crm_score_contributions SET points=$4 WHERE lead_id=$1 AND rule_id=$2 AND source_key=$3`,
            [leadId, rule.id, occurrence.source_key, delta],
          )
      }
    }

    if (points)
      contributions.push({
        ruleId: rule.id,
        name: rule.name,
        dimension: rule.dimension,
        points,
      })
  }
  const total = (dimension: string) =>
    contributions
      .filter((c) => c.dimension === dimension)
      .reduce((sum, c) => sum + c.points, 0)
  const fit = total('fit'),
    intent = total('intent'),
    score = Math.max(0, Math.min(100, fit + intent))
  const summary = {
    leadId,
    score,
    fitScore: fit,
    intentScore: intent,
    temperature: scoreTemperature(
      score,
      model.warm_threshold,
      model.hot_threshold,
    ),
    contributions,
  }
  if (!preview) {
    await db.query(
      `UPDATE public.leads SET score=$2,fit_score=$3,intent_score=$4,score_model_id=$5,updated_at=CASE WHEN score IS DISTINCT FROM $2 THEN now() ELSE updated_at END WHERE id=$1`,
      [
        leadId,
        score,
        Math.max(0, Math.min(100, fit)),
        Math.max(0, Math.min(100, intent)),
        model.id,
      ],
    )
    if (score !== previousScore) {
      const changed = await recordDomainEvent(db as never, {
        eventType: 'lead.score_changed',
        organizationId: lead.organization_id,
        crmInstanceId: lead.crm_instance_id,
        leadId,
        aggregateType: 'lead',
        aggregateId: leadId,
        actor: { type: 'system' },
        ...(event ? { parent: event } : {}),
        payload: { previousCombinedScore: previousScore, combinedScore: score },
      })
      for (const threshold of [model.warm_threshold, model.hot_threshold])
        if (
          (previousScore < threshold && score >= threshold) ||
          (previousScore >= threshold && score < threshold)
        )
          await recordDomainEvent(db as never, {
            eventType: 'lead.score_threshold_reached',
            organizationId: lead.organization_id,
            crmInstanceId: lead.crm_instance_id,
            leadId,
            aggregateType: 'lead',
            aggregateId: leadId,
            actor: { type: 'system' },
            parent: changed,
            payload: {
              threshold,
              direction: score >= threshold ? 'up' : 'down',
              combinedScore: score,
              previousCombinedScore: previousScore,
            },
          })
    }
  }
  return summary
}
export async function getQualificationSummary(
  db: QualificationDb,
  user: AuthUser,
  leadId: string,
) {
  await getLeadProfile(db, user, leadId)
  return reconcileQualification(db, leadId, undefined, true)
}
