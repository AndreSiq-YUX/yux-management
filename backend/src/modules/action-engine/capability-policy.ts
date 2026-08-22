import type { CapabilityMetadata } from './capability-registry.js'

export type CapabilityDecision =
  | { outcome: 'allow'; requiresApproval: boolean; policyId?: string; reason: string }
  | { outcome: 'deny'; requiresApproval: false; policyId?: string; reason: string }
  | { outcome: 'unavailable'; requiresApproval: false; reason: string }

export type CapabilityPolicyInput = {
  capability?: Pick<CapabilityMetadata, 'approval' | 'effect'>
  policy?: { id?: string; enabled: boolean; killSwitch: boolean; approvalOverride?: 'never' | 'risk_based' | 'always' | null }
  globalKillSwitch: boolean
  requiredConnectionsHealthy: boolean
  legalOrConsentAllowed: boolean
  budgetAvailable: boolean
  missionMode: 'shadow' | 'prepare' | 'assisted'
}

export function resolveCapabilityDecision(input: CapabilityPolicyInput): CapabilityDecision {
  if (!input.capability) return { outcome: 'unavailable', requiresApproval: false, reason: 'capability_not_registered' }
  if (!input.requiredConnectionsHealthy) return { outcome: 'unavailable', requiresApproval: false, reason: 'capability_connection_unavailable' }
  if (input.globalKillSwitch) return { outcome: 'deny', requiresApproval: false, reason: 'action_engine_kill_switch_active' }
  if (input.policy?.killSwitch) return { outcome: 'deny', requiresApproval: false, policyId: input.policy.id, reason: 'capability_kill_switch_active' }
  if (input.policy && !input.policy.enabled) return { outcome: 'deny', requiresApproval: false, policyId: input.policy.id, reason: 'capability_disabled' }
  if (!input.legalOrConsentAllowed) return { outcome: 'deny', requiresApproval: false, policyId: input.policy?.id, reason: 'legal_or_consent_denied' }
  if (!input.budgetAvailable) return { outcome: 'deny', requiresApproval: false, policyId: input.policy?.id, reason: 'mission_budget_exceeded' }

  const approval = input.policy?.approvalOverride ?? input.capability.approval
  const externalEffect = input.capability.effect === 'external'
  const requiresApproval = externalEffect || approval === 'always' || (approval === 'risk_based' && input.missionMode === 'assisted')
  return {
    outcome: 'allow',
    requiresApproval,
    ...(input.policy?.id ? { policyId: input.policy.id } : {}),
    reason: requiresApproval ? 'capability_allowed_with_approval' : 'capability_allowed',
  }
}
