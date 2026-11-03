export type PriorityOperator =
  | 'exists'
  | 'equals'
  | 'not_equals'
  | 'contains'
  | 'not_contains'
  | 'greater_than'
  | 'less_than'
  | 'at_least'
  | 'at_most'
export type PriorityChannel = 'whatsapp' | 'email' | 'call' | 'meeting' | 'crm'
export type ManualPriorityKind =
  | 'buyer_reply'
  | 'quote_requested'
  | 'meeting_booked'
  | 'meeting_completed'
  | 'purchase_window'
  | 'not_interested'
export type PrioritySignalKind = ManualPriorityKind | 'task_completed' | 'stage_changed'
export const prioritySignalLabels: Record<PrioritySignalKind, string> = {
  buyer_reply: 'Resposta do comprador',
  quote_requested: 'Pedido de orçamento',
  meeting_booked: 'Reunião agendada',
  meeting_completed: 'Reunião realizada',
  purchase_window: 'Previsão de compra',
  not_interested: 'Sem interesse no momento',
  task_completed: 'Tarefa concluída',
  stage_changed: 'Mudança de etapa',
}
export const priorityChannelLabels: Record<PriorityChannel, string> = {
  whatsapp: 'WhatsApp',
  email: 'E-mail',
  call: 'Telefone',
  meeting: 'Reunião',
  crm: 'Registro comercial',
}
export type PriorityField = {
  key: string
  label: string
  type: string
  recordTypeId: string | null
  options: { value: string; label: string }[]
}
export type PriorityCondition = {
  fieldKey: string
  recordTypeId: string | null
  operator: PriorityOperator
  comparisonValue?: string | number | boolean | null
}
export type PriorityRange = { min: number | null; max: number | null; points: number }
export type PriorityAlternative = PriorityCondition & {
  points: number
  estimated: boolean
  bands: PriorityRange[]
}
export type PrioritySignalRule = {
  kind: PrioritySignalKind
  channel?: PriorityChannel
  points: number
  validForDays?: number
  buyerRelevant: boolean
  purchaseBands: PriorityRange[]
}
export type PriorityBand = { id: string; label: string; min: number }
export type PriorityQueue = { id: string; label: string; recommendation?: string; taskDueDays?: number }
export type PriorityDefinition = {
  fitWeight: number
  temperatureWeight: number
  minimumCoverage: number
  historyDays: number
  timeZone: string
  fitGroups: {
    id: string
    label: string
    maxPoints: number
    recordTypeId: string | null
    alternatives: PriorityAlternative[]
  }[]
  interestGroups: {
    id: string
    label: string
    maxPoints: number
    strategy: 'max' | 'sumCapped'
    rules: PrioritySignalRule[]
  }[]
  penalties?: { maxPoints: number; rules: PrioritySignalRule[] }
  inactivity: { afterDays: number; points: number }[]
  exclusions: (PriorityCondition & { id: string; label: string })[]
  fitBands: PriorityBand[]
  temperatureBands: PriorityBand[]
  queues: PriorityQueue[]
  matrix: { fitBandId: string; temperatureBandId: string; queueId: string }[]
}
export type PriorityConfiguration = {
  revision: number
  draft: PriorityDefinition | null
  canEdit: boolean
  activeActivationId: string | null
  activeVersionId: string | null
  effectsEnabled: boolean
  versions: { id: string; revision: number; createdAt: string }[]
  fields?: PriorityField[]
  recordTypes?: { id: string; name: string }[]
}
export type PriorityState = 'ranked' | 'needs_data' | 'excluded' | 'pending'
export type PrioritySummary = {
  evaluatedAt?: string | null
  activationId: string
  versionId: string
  state: PriorityState
  fitScore: number | null
  temperatureScore: number | null
  priorityScore: number | null
  coveragePercent: number | null
  fitBandLabel: string | null
  temperatureBandLabel: string | null
  queueId: string | null
  queueLabel: string | null
  queueOrder: number | null
  recommendation: string | null
}
export type PriorityReason = {
  kind: 'criterion' | 'missing_data' | 'signal' | 'expired_signal' | 'penalty' | 'exclusion'
  id: string
  label: string
  points?: number
  estimated?: boolean
  fieldKeys?: string[]
  archivedFieldKeys?: string[]
  occurredAt?: string
}
export type LeadPriority = PrioritySummary & { reasons: PriorityReason[] }
export type PriorityTransition = {
  id: string
  occurredAt: string
  cause: 'baseline' | 'change' | 'time'
  before: { priorityScore: number | null } | null
  after: { priorityScore: number | null } | null
}
export type PriorityPreview = {
  revision: number
  runId: string
  nextCursor: string | null
  historyDays: number
  results: {
    leadId: string
    name: string
    state: PriorityState
    fitScore: number | null
    temperatureScore: number
    priorityScore: number | null
    coveragePercent: number
    queueId: string | null
    reasons: PriorityReason[]
    previousPriorityScore?: number | null
  }[]
  totals: {
    processed: number
    ranked: number
    needsData: number
    excluded: number
    byQueue: Record<string, number>
  }
}
export type LeadPrioritySignal = {
  id: string
  kind: PrioritySignalKind
  channel: PriorityChannel
  occurredAt: string
  targetDate: string | null
  revokedAt: string | null
  revokeReason: string | null
}
export type CreatePrioritySignal = {
  requestId: string
  kind: ManualPriorityKind
  channel: PriorityChannel
  occurredAt: string
  targetDate?: string
  sameAsSignalId?: string
}
