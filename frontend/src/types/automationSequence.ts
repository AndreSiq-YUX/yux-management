export type AutomationSequenceChannel = 'email' | 'whatsapp' | 'mixed'
export type AutomationSequenceStatus = 'draft' | 'active' | 'paused' | 'archived'
export type AutomationSequenceStepKind = 'message' | 'delay' | 'task' | 'ai' | 'webhook'

export interface SequenceEnrollmentEligibilityInput {
  channel: AutomationSequenceChannel
  email?: string
  whatsappPhone?: string
  emailOptIn?: boolean
  whatsappOptIn?: boolean
}

export interface AutomationSequenceStep {
  id: string
  sequenceId: string
  orderIndex: number
  stepKind: AutomationSequenceStepKind
  channel?: Exclude<AutomationSequenceChannel, 'mixed'>
  subject?: string
  body?: string
  delayMinutes: number
  templateId?: string
  requiresHumanApproval: boolean
  isActive: boolean
}

export interface AutomationSequence {
  id: string
  organizationId: string
  name: string
  description?: string
  channel: AutomationSequenceChannel
  status: AutomationSequenceStatus
  sectorTemplateKey?: string
  conversionGoal?: string
  activeEnrollmentCount: number
  convertedEnrollmentCount: number
  steps: AutomationSequenceStep[]
}
