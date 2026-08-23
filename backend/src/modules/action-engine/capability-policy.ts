import type { CapabilityMetadata } from './capability-registry.js'
import type { Queryable } from './repository.js'

export type CapabilityDecision =
  | { outcome: 'allow'; requiresApproval: boolean; policyId?: string; reason: string }
  | { outcome: 'deny'; requiresApproval: false; policyId?: string; reason: string }
  | { outcome: 'unavailable'; requiresApproval: false; reason: string }

export type CapabilityPolicyInput = {
  capability?: Pick<CapabilityMetadata, 'approval' | 'effect'>
  policy?: { id?: string; enabled: boolean; killSwitch: boolean; approvalOverride?: 'never' | 'risk_based' | 'always' | null }
  globalKillSwitch: boolean
  organizationKillSwitch?: boolean
  packKillSwitch?: boolean
  capabilityKillSwitch?: boolean
  requiredConnectionsHealthy: boolean
  legalOrConsentAllowed: boolean
  budgetAvailable: boolean
  missionMode: 'shadow' | 'prepare' | 'assisted'
}

export function resolveCapabilityDecision(input: CapabilityPolicyInput): CapabilityDecision {
  if (!input.capability) return { outcome: 'unavailable', requiresApproval: false, reason: 'capability_not_registered' }
  if (!input.requiredConnectionsHealthy) return { outcome: 'unavailable', requiresApproval: false, reason: 'capability_connection_unavailable' }
  if (input.globalKillSwitch) return { outcome: 'deny', requiresApproval: false, reason: 'action_engine_kill_switch_active' }
  if (input.organizationKillSwitch) return { outcome: 'deny', requiresApproval: false, reason: 'organization_kill_switch_active' }
  if (input.packKillSwitch) return { outcome: 'deny', requiresApproval: false, reason: 'pack_kill_switch_active' }
  if (input.capabilityKillSwitch) return { outcome: 'deny', requiresApproval: false, policyId: input.policy?.id, reason: 'capability_kill_switch_active' }
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

export async function loadKillSwitchState(client: Queryable, input: {
  organizationId: string
  packKey: string
  packVersion: string
  capabilityKey: string
  capabilityVersion: number
}): Promise<{ global: boolean; organization: boolean; pack: boolean; capability: boolean }> {
  const result = await client.query<{ scope: 'global' | 'organization' | 'pack' | 'capability' }>(
    `SELECT scope FROM public.action_engine_kill_switches
     WHERE enabled = TRUE AND (expires_at IS NULL OR expires_at > NOW()) AND (
       (scope = 'global' AND organization_id IS NULL) OR
       (scope = 'organization' AND organization_id = $1) OR
       (scope = 'pack' AND organization_id = $1 AND pack_key = $2 AND pack_version = $3) OR
       (scope = 'capability' AND organization_id = $1 AND capability_key = $4 AND capability_version = $5)
     )
     UNION ALL
     SELECT 'capability' AS scope FROM public.action_capability_policies
     WHERE organization_id = $1 AND capability_key = $4 AND capability_version = $5
       AND (kill_switch = TRUE OR enabled = FALSE)`,
    [input.organizationId, input.packKey, input.packVersion, input.capabilityKey, input.capabilityVersion],
  )
  const scopes = new Set(result.rows.map((row) => row.scope))
  return {
    global: scopes.has('global'), organization: scopes.has('organization'),
    pack: scopes.has('pack'), capability: scopes.has('capability'),
  }
}
