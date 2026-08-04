export type ScoringDimension = 'fit' | 'intent'
export type ScoringOperator = 'equals' | 'not_equals' | 'contains' | 'greater_than' | 'less_than' | 'exists'

export type ScoringModel = {
  id: string
  crmInstanceId: string
  name: string
  fitWeight: number
  intentWeight: number
  thresholds: number[]
  isActive: boolean
  createdBy: string | null
  createdAt: string
  updatedAt: string
}

export type ScoringRule = {
  id: string
  modelId: string
  name: string
  dimension: ScoringDimension
  eventType: string
  fieldPath: string | null
  operator: ScoringOperator | null
  comparisonValue: unknown
  points: number
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export type LeadScoreEvent = {
  id: string
  organizationId: string
  crmInstanceId: string
  leadId: string
  ruleId: string | null
  eventKey: string
  eventType: string
  dimension: ScoringDimension
  points: number
  previousScore: number
  resultingScore: number
  context: Record<string, unknown>
  createdBy: string | null
  occurredAt: string
}

type Queryable = {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>
}

type ModelRow = {
  id: string
  crm_instance_id: string
  name: string
  fit_weight: number
  intent_weight: number
  thresholds: unknown
  is_active: boolean
  created_by: string | null
  created_at: string | Date
  updated_at: string | Date
}

type RuleRow = {
  id: string
  model_id: string
  name: string
  dimension: ScoringDimension
  event_type: string
  field_path: string | null
  operator: ScoringOperator | null
  comparison_value: unknown
  points: number
  is_active: boolean
  created_at: string | Date
  updated_at: string | Date
}

type ScoreEventRow = {
  id: string
  organization_id: string
  crm_instance_id: string
  lead_id: string
  rule_id: string | null
  event_key: string
  event_type: string
  dimension: ScoringDimension
  points: number
  previous_score: number
  resulting_score: number
  context: Record<string, unknown>
  created_by: string | null
  occurred_at: string | Date
}

const MODEL_COLUMNS = `
  id, crm_instance_id, name, fit_weight, intent_weight, thresholds,
  is_active, created_by, created_at, updated_at
`

const RULE_COLUMNS = `
  id, model_id, name, dimension, event_type, field_path, operator,
  comparison_value, points, is_active, created_at, updated_at
`

const SCORE_EVENT_COLUMNS = `
  id, organization_id, crm_instance_id, lead_id, rule_id, event_key,
  event_type, dimension, points, previous_score, resulting_score,
  context, created_by, occurred_at
`

export async function getActiveScoringModel(
  client: Queryable,
  crmInstanceId: string,
): Promise<ScoringModel | null> {
  const result = await client.query<ModelRow>(
    `SELECT ${MODEL_COLUMNS}
     FROM public.lead_scoring_models
     WHERE crm_instance_id = $1 AND is_active = TRUE
     ORDER BY updated_at DESC, id DESC
     LIMIT 1`,
    [crmInstanceId],
  )
  return result.rows[0] ? mapModel(result.rows[0]) : null
}

export async function getScoringModelById(client: Queryable, modelId: string): Promise<ScoringModel | null> {
  const result = await client.query<ModelRow>(
    `SELECT ${MODEL_COLUMNS} FROM public.lead_scoring_models WHERE id = $1 LIMIT 1`,
    [modelId],
  )
  return result.rows[0] ? mapModel(result.rows[0]) : null
}

export async function updateScoringModel(
  client: Queryable,
  modelId: string,
  input: { name?: string; fitWeight?: number; intentWeight?: number; thresholds?: number[] },
): Promise<ScoringModel> {
  const current = await getScoringModelById(client, modelId)
  if (!current) throw new Error('lead_scoring_model_not_found')
  const fitWeight = input.fitWeight ?? current.fitWeight
  const intentWeight = input.intentWeight ?? current.intentWeight
  validateWeights(fitWeight, intentWeight)
  const result = await client.query<ModelRow>(
    `UPDATE public.lead_scoring_models
     SET name = COALESCE($2, name), fit_weight = $3, intent_weight = $4,
         thresholds = COALESCE($5, thresholds), updated_at = NOW()
     WHERE id = $1
     RETURNING ${MODEL_COLUMNS}`,
    [modelId, input.name?.trim(), fitWeight, intentWeight, input.thresholds ?? null],
  )
  if (!result.rows[0]) throw new Error('lead_scoring_model_update_failed')
  return mapModel(result.rows[0])
}

export async function listActiveScoringRules(
  client: Queryable,
  modelId: string,
  eventType?: string,
): Promise<ScoringRule[]> {
  const result = await client.query<RuleRow>(
    `SELECT ${RULE_COLUMNS}
     FROM public.lead_scoring_rules
     WHERE model_id = $1
       AND is_active = TRUE
       AND ($2::TEXT IS NULL OR event_type = $2)
     ORDER BY created_at ASC, id ASC`,
    [modelId, eventType ?? null],
  )
  return result.rows.map(mapRule)
}

export async function listLeadScoreEvents(
  client: Queryable,
  leadId: string,
  limit = 100,
): Promise<LeadScoreEvent[]> {
  const safeLimit = Math.max(1, Math.min(500, Math.floor(limit)))
  const result = await client.query<ScoreEventRow>(
    `SELECT ${SCORE_EVENT_COLUMNS}
     FROM public.lead_score_events
     WHERE lead_id = $1
     ORDER BY occurred_at DESC, id DESC
     LIMIT $2`,
    [leadId, safeLimit],
  )
  return result.rows.map(mapScoreEvent)
}

export async function createScoringModel(
  client: Queryable,
  input: {
    crmInstanceId: string
    name: string
    fitWeight: number
    intentWeight: number
    thresholds?: number[]
    createdBy?: string | null
  },
): Promise<ScoringModel> {
  validateWeights(input.fitWeight, input.intentWeight)
  await client.query(
    `UPDATE public.lead_scoring_models
     SET is_active = FALSE, updated_at = NOW()
     WHERE crm_instance_id = $1 AND is_active = TRUE`,
    [input.crmInstanceId],
  )
  const result = await client.query<ModelRow>(
    `INSERT INTO public.lead_scoring_models (
       crm_instance_id, name, fit_weight, intent_weight, thresholds, created_by
     ) VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING ${MODEL_COLUMNS}`,
    [
      input.crmInstanceId,
      input.name.trim(),
      input.fitWeight,
      input.intentWeight,
      input.thresholds ?? [],
      input.createdBy ?? null,
    ],
  )
  if (!result.rows[0]) throw new Error('lead_scoring_model_create_failed')
  return mapModel(result.rows[0])
}

export async function createScoringRule(
  client: Queryable,
  input: {
    modelId: string
    name: string
    dimension: ScoringDimension
    eventType: string
    fieldPath?: string | null
    operator?: ScoringOperator | null
    comparisonValue?: unknown
    points: number
  },
): Promise<ScoringRule> {
  validatePoints(input.points)
  const result = await client.query<RuleRow>(
    `INSERT INTO public.lead_scoring_rules (
       model_id, name, dimension, event_type, field_path, operator,
       comparison_value, points
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING ${RULE_COLUMNS}`,
    [
      input.modelId,
      input.name.trim(),
      input.dimension,
      input.eventType.trim(),
      input.fieldPath ?? null,
      input.operator ?? null,
      input.comparisonValue ?? null,
      input.points,
    ],
  )
  if (!result.rows[0]) throw new Error('lead_scoring_rule_create_failed')
  return mapRule(result.rows[0])
}

export async function updateScoringRule(
  client: Queryable,
  ruleId: string,
  input: Partial<Pick<ScoringRule, 'name' | 'dimension' | 'eventType' | 'fieldPath' | 'operator' | 'comparisonValue' | 'points' | 'isActive'>>,
): Promise<ScoringRule> {
  if (input.points !== undefined) validatePoints(input.points)
  const result = await client.query<RuleRow>(
    `UPDATE public.lead_scoring_rules
     SET name = COALESCE($2, name),
         dimension = COALESCE($3, dimension),
         event_type = COALESCE($4, event_type),
         field_path = COALESCE($5, field_path),
         operator = COALESCE($6, operator),
         comparison_value = COALESCE($7, comparison_value),
         points = COALESCE($8, points),
         is_active = COALESCE($9, is_active),
         updated_at = NOW()
     WHERE id = $1
     RETURNING ${RULE_COLUMNS}`,
    [
      ruleId,
      input.name?.trim(),
      input.dimension,
      input.eventType?.trim(),
      input.fieldPath,
      input.operator,
      input.comparisonValue,
      input.points,
      input.isActive,
    ],
  )
  if (!result.rows[0]) throw new Error('lead_scoring_rule_not_found')
  return mapRule(result.rows[0])
}

export async function deactivateScoringRule(client: Queryable, ruleId: string): Promise<void> {
  await client.query(
    `UPDATE public.lead_scoring_rules
     SET is_active = FALSE, updated_at = NOW()
     WHERE id = $1`,
    [ruleId],
  )
}

export function mapModel(row: ModelRow): ScoringModel {
  return {
    id: row.id,
    crmInstanceId: row.crm_instance_id,
    name: row.name,
    fitWeight: Number(row.fit_weight),
    intentWeight: Number(row.intent_weight),
    thresholds: normalizeThresholds(row.thresholds),
    isActive: row.is_active,
    createdBy: row.created_by,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  }
}

export function mapRule(row: RuleRow): ScoringRule {
  return {
    id: row.id,
    modelId: row.model_id,
    name: row.name,
    dimension: row.dimension,
    eventType: row.event_type,
    fieldPath: row.field_path,
    operator: row.operator,
    comparisonValue: row.comparison_value,
    points: Number(row.points),
    isActive: row.is_active,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  }
}

export function mapScoreEvent(row: ScoreEventRow): LeadScoreEvent {
  return {
    id: row.id,
    organizationId: row.organization_id,
    crmInstanceId: row.crm_instance_id,
    leadId: row.lead_id,
    ruleId: row.rule_id,
    eventKey: row.event_key,
    eventType: row.event_type,
    dimension: row.dimension,
    points: Number(row.points),
    previousScore: Number(row.previous_score),
    resultingScore: Number(row.resulting_score),
    context: row.context ?? {},
    createdBy: row.created_by,
    occurredAt: toIsoString(row.occurred_at),
  }
}

export function normalizeThresholds(value: unknown): number[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value
    .map((threshold) => typeof threshold === 'number' ? Math.round(threshold) : Number(threshold))
    .filter((threshold) => Number.isFinite(threshold) && threshold >= 0 && threshold <= 100))]
    .sort((left, right) => left - right)
}

function validateWeights(fitWeight: number, intentWeight: number): void {
  if (!Number.isInteger(fitWeight) || !Number.isInteger(intentWeight)
    || fitWeight < 0 || fitWeight > 100
    || intentWeight < 0 || intentWeight > 100
    || fitWeight + intentWeight !== 100) {
    throw new Error('lead_scoring_weights_must_sum_100')
  }
}

function validatePoints(points: number): void {
  if (!Number.isInteger(points) || points < -100 || points > 100 || points === 0) {
    throw new Error('lead_scoring_points_invalid')
  }
}

function toIsoString(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}
