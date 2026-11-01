export interface QualificationField {
  key: string
  label: string
  type: string
  options: Array<{ value: string; label: string }>
  recordTypeId: string | null
}
export interface QualificationRule {
  id?: string
  name: string
  kind: 'profile' | 'activity'
  dimension: 'fit' | 'intent'
  fieldKey: string
  recordTypeId: string | null
  operator:
    | 'exists'
    | 'equals'
    | 'not_equals'
    | 'contains'
    | 'not_contains'
    | 'greater_than'
    | 'less_than'
    | 'at_least'
    | 'at_most'
  comparisonValue?: string | number | boolean | null
  points: number
  bands: Array<{ min: number | null; max: number | null; points: number }>
  eventType?: string
  maxContribution: number
}
export interface QualificationSummary {
  leadId: string
  score: number
  fitScore: number
  intentScore: number
  temperature: 'cold' | 'warm' | 'hot'
  contributions: Array<{
    ruleId: string
    name: string
    dimension: string
    points: number
  }>
}
export const qualificationEvents = [
  ['lead.task_completed', 'Tarefa concluída'],
  ['lead.stage_changed', 'Mudança de etapa'],
  [
    'lead.interaction_recorded',
    'Interação registrada (inclui resposta de e-mail manual)',
  ],
  ['email.opened', 'E-mail aberto'],
  ['email.clicked', 'Link de e-mail clicado'],
  ['lead.response_received', 'Resposta recebida por WhatsApp'],
] as const
export const temperatureLabels = { cold: 'Frio', warm: 'Morno', hot: 'Quente' }
