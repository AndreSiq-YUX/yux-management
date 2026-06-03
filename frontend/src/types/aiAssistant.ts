export type AiAssistantStatus = 'draft' | 'active' | 'paused' | 'archived'
export type AiAssistantObjectiveType = 'lead_qualification' | 'support_triage' | 'scheduling' | 'sales_conversion' | 'retention'
export type AiAssistantHandoffRuleType = 'human_request' | 'sentiment_intent' | 'low_confidence' | 'missing_required_field' | 'safety'
export type AiAssistantSafetySeverity = 'low' | 'medium' | 'high'

export interface AiAssistantObjective {
  id: string
  objectiveType: AiAssistantObjectiveType | string
  label: string
  instructions?: string
  priority?: number
}

export interface AiAssistantRequiredField {
  id: string
  fieldKey: string
  label: string
  source?: 'contact' | 'lead' | 'conversation' | 'custom' | string
  isRequired?: boolean
  orderIndex?: number
}

export interface AiAssistantHandoffRule {
  id: string
  name: string
  ruleType: AiAssistantHandoffRuleType | string
  conditions: Record<string, unknown>
  minConfidence?: number
  isEnabled: boolean
}

export interface AiAssistantSafetyRule {
  id: string
  name: string
  ruleType: string
  instructions: string
  severity: AiAssistantSafetySeverity | string
  isEnabled: boolean
}

export interface AiAssistantKnowledgeLink {
  id: string
  knowledgeEntryId?: string
  title: string
  status: string
}

export interface AiAssistantSettings {
  id: string
  organizationId: string
  clientId?: string
  contractId?: string
  name: string
  tone: string
  status: AiAssistantStatus
  summaryEnabled: boolean
  classificationEnabled: boolean
  objectives: AiAssistantObjective[]
  requiredFields: AiAssistantRequiredField[]
  handoffRules: AiAssistantHandoffRule[]
  safetyRules: AiAssistantSafetyRule[]
  knowledgeLinks: AiAssistantKnowledgeLink[]
  createdAt: string
  updatedAt: string
}

export interface AiAssistantInput {
  organizationId: string
  clientId?: string
  contractId?: string
  name: string
  tone: string
  status?: AiAssistantStatus
  summaryEnabled?: boolean
  classificationEnabled?: boolean
}

export interface AiAssistantDecisionContext {
  sentiment?: string
  intent?: string
  confidence?: number
  humanRequested?: boolean
  missingFields?: string[]
  safetyTriggered?: boolean
}
