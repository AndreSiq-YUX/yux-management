export type AutomationFlowStatus = 'draft' | 'published' | 'paused' | 'archived' | 'failed'
export type AutomationRunStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'skipped'
export type AutomationTriggerType =
  | 'lead.created'
  | 'lead.stage_changed'
  | 'lead.status_changed'
  | 'conversation.created'
  | 'conversation.handoff'
  | 'ticket.created'
  | string
export type AutomationConditionOperator = 'equals' | 'not_equals' | 'contains' | 'greater_than' | 'less_than' | 'exists'
export type AutomationActionType =
  | 'create_task'
  | 'change_stage'
  | 'assign_owner'
  | 'send_whatsapp'
  | 'create_ticket'
  | 'update_field'
  | 'register_activity'
  | string

export interface AutomationTrigger {
  id: string
  triggerType: AutomationTriggerType
  config: Record<string, unknown>
}

export interface AutomationCondition {
  id?: string
  field: string
  operator: AutomationConditionOperator
  value?: unknown
}

export interface AutomationAction {
  id: string
  actionType: AutomationActionType
  orderIndex: number
  payload: Record<string, unknown>
}

export interface AutomationExecutionRun {
  id: string
  status: AutomationRunStatus
  eventType?: string
  leadId?: string
  lastError?: string
  startedAt?: string
  completedAt?: string
}

export interface AutomationFlow {
  id: string
  organizationId: string
  name: string
  description?: string
  status: AutomationFlowStatus
  isEnabled: boolean
  sectorTemplateKey?: string
  lastError?: string
  triggers: AutomationTrigger[]
  conditions: AutomationCondition[]
  actions: AutomationAction[]
  executionRuns: AutomationExecutionRun[]
  createdAt: string
  updatedAt: string
}

export interface AutomationEvent {
  type: string
  organizationId?: string
  leadId?: string
  conversationId?: string
  ticketId?: string
  stageId?: string
  previousStageId?: string
  status?: string
  source?: string
  payload?: Record<string, unknown>
  [key: string]: unknown
}

export interface AutomationFlowInput {
  organizationId: string
  name: string
  description?: string
  sectorTemplateKey?: string
  status?: AutomationFlowStatus
  isEnabled?: boolean
}
