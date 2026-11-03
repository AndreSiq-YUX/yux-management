import { z } from 'zod'

export const activityEvents = [
  'lead.task_completed',
  'lead.stage_changed',
  'lead.interaction_recorded',
  'email.opened',
  'email.clicked',
  'lead.response_received',
] as const
export const qualificationBandSchema = z
  .object({
    min: z.number().finite().nullable(),
    max: z.number().finite().nullable(),
    points: z.number().int().min(-100).max(100),
  })
  .strict()
export const qualificationOperatorSchema = z.enum([
  'exists', 'equals', 'not_equals', 'contains', 'not_contains',
  'greater_than', 'less_than', 'at_least', 'at_most',
])
export const qualificationComparisonSchema = z.union([
  z.string().max(500), z.number().finite(), z.boolean(), z.null(),
])

export function qualificationBandsError(bands: readonly z.infer<typeof qualificationBandSchema>[]) {
  for (const [index, current] of bands.entries()) {
    const previous = bands[index - 1]
    if (current.min !== null && current.max !== null && current.min >= current.max)
      return 'O início da faixa deve ser menor que o fim.'
    if (previous && (previous.max === null || current.min === null || current.min < previous.max))
      return 'As faixas devem estar ordenadas e não podem se sobrepor.'
  }
}
export const qualificationRuleSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    kind: z.enum(['profile', 'activity']),
    dimension: z.enum(['fit', 'intent']),
    fieldKey: z.string().max(160).default(''),
    recordTypeId: z.string().uuid().nullable().default(null),
    operator: qualificationOperatorSchema.default('exists'),
    comparisonValue: qualificationComparisonSchema.optional(),
    points: z.number().int().min(-100).max(100),
    bands: z.array(qualificationBandSchema).max(20).default([]),
    eventType: z.enum(activityEvents).optional(),
    maxContribution: z.number().int().min(1).max(100).default(100),
  })
  .strict()
  .superRefine((rule, ctx) => {
    const issue = (message: string) => ctx.addIssue({ code: 'custom', message })
    if (rule.kind === 'profile' && !rule.fieldKey) issue('Selecione um campo.')
    if (rule.kind === 'activity' && !rule.eventType)
      issue('Selecione uma atividade.')
    if (rule.kind === 'activity' && rule.bands.length)
      issue('Faixas são aplicáveis ao perfil.')
    const bandsError = qualificationBandsError(rule.bands)
    if (bandsError) issue(bandsError)
    if (!rule.bands.length && rule.points === 0)
      issue('Informe uma pontuação diferente de zero.')
  })
export type QualificationRule = z.infer<typeof qualificationRuleSchema>
export function matchesQualification(
  rule: Pick<QualificationRule, 'fieldKey' | 'operator' | 'comparisonValue' | 'recordTypeId'>,
  context: Record<string, unknown>,
) {
  if (rule.recordTypeId && context.recordTypeId !== rule.recordTypeId)
    return false
  if (!rule.fieldKey) return true
  const value = context[rule.fieldKey],
    comparison = rule.comparisonValue
  if (value === undefined || value === null || value === '') return false
  switch (rule.operator) {
    case 'exists':
      return true
    case 'equals':
      return value === comparison
    case 'not_equals':
      return value !== comparison
    case 'contains':
      return (
        typeof value === 'string' &&
        typeof comparison === 'string' &&
        value.toLocaleLowerCase().includes(comparison.toLocaleLowerCase())
      )
    case 'not_contains':
      return (
        typeof value === 'string' &&
        typeof comparison === 'string' &&
        !value.toLocaleLowerCase().includes(comparison.toLocaleLowerCase())
      )
    default: {
      if (typeof value !== 'number' || typeof comparison !== 'number')
        return false
      if (rule.operator === 'greater_than') return value > comparison
      if (rule.operator === 'less_than') return value < comparison
      if (rule.operator === 'at_least') return value >= comparison
      return value <= comparison
    }
  }
}
export function evaluateProfileRule(
  rule: Pick<QualificationRule, 'fieldKey' | 'operator' | 'comparisonValue' | 'recordTypeId' | 'bands' | 'points'>,
  context: Record<string, unknown>,
) {
  if (rule.recordTypeId && context.recordTypeId !== rule.recordTypeId) return 0
  const value = context[rule.fieldKey]
  if (rule.bands.length) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return 0
    return (
      rule.bands.find(
        (b) =>
          (b.min === null || value >= b.min) &&
          (b.max === null || value < b.max),
      )?.points ?? 0
    )
  }
  return matchesQualification(rule, context) ? rule.points : 0
}
export function scoreTemperature(score: number, warm = 40, hot = 70) {
  return score >= hot ? 'hot' : score >= warm ? 'warm' : 'cold'
}
export function ruleContribution(
  current: number,
  points: number,
  limit: number,
) {
  return points >= 0
    ? Math.max(0, Math.min(points, limit - current))
    : Math.min(0, Math.max(points, -limit - current))
}
