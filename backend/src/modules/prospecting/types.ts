export type ProspectingChannel = 'email' | 'whatsapp' | 'phone' | 'task'
export type ProspectingPlanStatus = 'draft' | 'approved' | 'active' | 'paused' | 'blocked' | 'opted_out' | 'completed' | 'failed'
export type ChannelPermissionStatus = 'unknown' | 'granted' | 'revoked'

export type QuietHours = {
  timezone: string
  start: string
  end: string
}
export type ProspectingPolicySnapshot = {
  policyId?: string
  policyVersion: string
  enabled: boolean
  killSwitch: boolean
  requireHumanFirstContact: true
  requireWhatsappPermission: boolean
  requireTemplateOutsideWindow: boolean
  dailyLimit: number
  maxAttemptsPerLead: number
  quietHours: QuietHours
  legalReviewedAt?: string
}

export type ProspectingEligibility = {
  allowed: boolean
  blockedReasons: string[]
  normalizedAddress?: string
  policy: ProspectingPolicySnapshot
}

export type ProspectingPlan = {
  id: string
  organizationId: string
  crmInstanceId: string
  radarOpportunityId: string
  leadId?: string
  sequenceId?: string
  conversationId?: string
  primaryChannel: ProspectingChannel
  fallbackChannel?: ProspectingChannel
  status: ProspectingPlanStatus
  policySnapshot: ProspectingPolicySnapshot
  blockedReasons: string[]
  idempotencyKey: string
  approvedBy?: string
  approvedAt?: string
  startedAt?: string
  completedAt?: string
  createdAt: string
  updatedAt: string
}
