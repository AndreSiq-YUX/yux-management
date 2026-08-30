import type { AppEnv } from '../../config/env.js'

export type Queryable = {
  query: <T = any>(...args: any[]) => Promise<any>
}

export type DomainEventActor = {
  type: 'lead' | 'user' | 'system' | 'provider'
  id?: string
}

export type DomainEventEnvelope<TPayload extends Record<string, unknown> = Record<string, unknown>> = {
  eventId: string
  eventType: string
  schemaVersion: 1
  organizationId: string
  crmInstanceId?: string
  aggregateType: 'lead' | 'form_submission' | 'task' | 'sequence_enrollment' | 'email' | 'campaign' | 'mission' | 'mission_action' | 'action_run' | 'approval' | 'unknown'
  aggregateId: string
  leadId?: string
  correlationId: string
  causationId?: string
  depth: number
  actor: DomainEventActor
  occurredAt: string
  automationTrace: string[]
  payload: TPayload
}

export type LeadCommandContext = {
  organizationId: string
  crmInstanceId?: string
  leadId: string
  idempotencyKey: string
  correlationId: string
  causationId: string
  depth: number
  automationTrace: string[]
  actor: DomainEventActor
}

export type AutomationAction = {
  id?: string
  actionType: string
  orderIndex: number
  payload: Record<string, unknown>
}

export type AutomationCondition = {
  id?: string
  field: string
  operator: string
  value?: unknown
  orderIndex: number
}

export type AutomationTrigger = {
  id?: string
  triggerType: string
  config: Record<string, unknown>
}

export type AutomationFlowSnapshot = {
  triggers: AutomationTrigger[]
  conditions: AutomationCondition[]
  actions: AutomationAction[]
}

export type MatchedFlow = {
  id: string
  organizationId: string
  crmInstanceId?: string
  flowVersionId?: string
  dailyRunLimit: number
  allowReentry: boolean
  reentryCooldownMinutes: number
  snapshot: AutomationFlowSnapshot
}

export type AutomationRunJobData = {
  runId: string
  eventId: string
  flowId: string
}

export type AutomationJobQueue = {
  add(
    name: 'automation.executeRun',
    data: AutomationRunJobData,
    options?: { jobId?: string; attempts?: number; backoff?: { type: 'exponential'; delay: number } },
  ): Promise<unknown>
}

export type AutomationRuntimeOptions = {
  env?: AppEnv
  queue?: AutomationJobQueue
  now?: Date
  maxDepth?: number
  executeInline?: boolean
  commandServices?: import('./action-handlers.js').AutomationCommandServices
}

export type AutomationRuntimeResult = {
  eventId: string
  eventType: string
  organizationId: string
  matchedFlowIds: string[]
  runs: Array<{ flowId: string; runId?: string; status: string; reason?: string }>
  results: Array<{ flowId: string; runId?: string; status: string; reason?: string }>
}

export type RawAutomationEvent = Record<string, unknown> & {
  eventId?: string
  eventType?: string
  type?: string
  organizationId?: string
  crmInstanceId?: string
  leadId?: string
  correlationId?: string
  causationId?: string
  depth?: number
  automationTrace?: string[]
  payload?: Record<string, unknown>
}
