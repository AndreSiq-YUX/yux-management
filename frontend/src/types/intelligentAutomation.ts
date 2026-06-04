export type AutomationModule =
  | 'crm'
  | 'omnichannel'
  | 'landing_pages'
  | 'proposals'
  | 'projects'
  | 'finance'
  | 'campaigns'
  | 'reports'
  | 'support'

export type AutomationKind = 'flow' | 'sequence'
export type AutomationBuilderMode = 'guided' | 'technical'
export type AutomationRiskLevel = 'low' | 'medium' | 'high'
export type AutomationPublishStatus = 'draft' | 'active' | 'paused' | 'error' | 'archived'

export interface AutomationCatalogTrigger {
  key: string
  module: AutomationModule
  label: string
  payloadSchema: Record<string, string>
}

export interface AutomationValidationResult {
  ok: boolean
  reason?: string
}

export interface AutomationRiskAssessment {
  level: AutomationRiskLevel
  requiresHumanApproval: boolean
  reasons: string[]
}

export interface IntelligentAutomationAction {
  actionType: string
  orderIndex: number
  payload: Record<string, unknown>
}
