import type { CapabilityEffect, CapabilityMetadata } from './capability-registry.js'
import type { Queryable } from './repository.js'
import type { MissionMode } from './types.js'

export type CapabilityDecision =
  | { outcome: 'allow'; dryRun: boolean; allowedEffect: CapabilityEffect | 'none'; requiresApproval: boolean; policyId?: string; reason: string }
  | { outcome: 'deny'; dryRun: false; allowedEffect: 'none'; requiresApproval: false; policyId?: string; reason: string }
  | { outcome: 'unavailable'; dryRun: false; allowedEffect: 'none'; requiresApproval: false; reason: string }

export type CapabilityPolicyInput = {
  capability?: Pick<CapabilityMetadata, 'approval' | 'effect'> & {
    key?: string
    supportsModes?: readonly MissionMode[]
    requiredPermissions?: readonly string[]
  }
  policy?: { id?: string; enabled: boolean; killSwitch: boolean; approvalOverride?: 'never' | 'risk_based' | 'always' | null }
  globalKillSwitch: boolean
  organizationKillSwitch?: boolean
  packKillSwitch?: boolean
  capabilityKillSwitch?: boolean
  requiredConnectionsHealthy: boolean
  legalOrConsentAllowed: boolean
  budgetAvailable: boolean
  missionMode: MissionMode
  missionActive?: boolean
  envelopeExpiresAt?: string
  now?: Date
  actorPermissions?: readonly string[]
  capabilityAllowedByEnvelope?: boolean
  alwaysRequireApprovalFor?: readonly string[]
}

export function resolveCapabilityDecision(input: CapabilityPolicyInput): CapabilityDecision {
  if (!input.capability) return unavailable('capability_not_registered')
  if (!input.requiredConnectionsHealthy) return unavailable('capability_connection_unavailable')
  if (input.globalKillSwitch) return deny('action_engine_kill_switch_active')
  if (input.organizationKillSwitch) return deny('organization_kill_switch_active')
  if (input.packKillSwitch) return deny('pack_kill_switch_active')
  if (input.capabilityKillSwitch) return deny('capability_kill_switch_active', input.policy?.id)
  if (input.policy?.killSwitch) return deny('capability_kill_switch_active', input.policy.id)
  if (input.policy && !input.policy.enabled) return deny('capability_disabled', input.policy.id)
  if (input.missionActive === false) return deny('mission_not_active')
  if (input.envelopeExpiresAt) {
    const expiresAt = Date.parse(input.envelopeExpiresAt)
    if (!Number.isFinite(expiresAt) || expiresAt <= (input.now ?? new Date()).getTime()) return deny('mission_autonomy_envelope_expired')
  }
  if (input.capabilityAllowedByEnvelope === false) return deny('capability_outside_autonomy_envelope')
  if (input.capability.supportsModes && !input.capability.supportsModes.includes(input.missionMode)) {
    return unavailable('capability_mode_unsupported')
  }
  const requiredPermissions = input.capability.requiredPermissions ?? []
  const actorPermissions = new Set(input.actorPermissions ?? [])
  if (requiredPermissions.some((permission) => !actorPermissions.has(permission))) return deny('capability_permission_denied')
  if (!input.legalOrConsentAllowed) return deny('legal_or_consent_denied', input.policy?.id)
  if (!input.budgetAvailable) return deny('mission_budget_exceeded', input.policy?.id)

  const mode = resolveExecutionMode(input.missionMode, input.capability.effect)
  const approval = input.policy?.approvalOverride ?? input.capability.approval
  const explicitApproval = approval === 'always' || (approval === 'risk_based' && input.missionMode === 'assisted')
  const envelopeApproval = (input.alwaysRequireApprovalFor ?? []).some(
    (item) => item === input.capability!.effect || item === input.capability!.key,
  )
  const requiresApproval = mode.dryRun ? false : mode.requiresApproval || explicitApproval || envelopeApproval
  return {
    outcome: 'allow',
    dryRun: mode.dryRun,
    allowedEffect: mode.allowedEffect,
    requiresApproval,
    ...(input.policy?.id ? { policyId: input.policy.id } : {}),
    reason: requiresApproval ? 'capability_allowed_with_approval' : 'capability_allowed',
  }
}

export function resolveExecutionMode(
  mode: MissionMode,
  effect: CapabilityEffect,
): Extract<CapabilityDecision, { outcome: 'allow' }> {
  if (mode === 'shadow') {
    return { outcome: 'allow', dryRun: true, allowedEffect: 'none', requiresApproval: false, reason: 'capability_shadow_simulation' }
  }
  if (mode === 'prepare' && !['none','draft'].includes(effect)) {
    return { outcome: 'allow', dryRun: true, allowedEffect: 'none', requiresApproval: false, reason: 'capability_prepare_simulation' }
  }
  const requiresApproval = (mode === 'assisted' && (effect === 'external' || effect === 'destructive'))
    || (mode === 'autonomous' && effect === 'destructive')
  return {
    outcome: 'allow', dryRun: false, allowedEffect: effect, requiresApproval,
    reason: requiresApproval ? 'capability_allowed_with_approval' : 'capability_allowed',
  }
}

function deny(reason: string, policyId?: string): Extract<CapabilityDecision, { outcome: 'deny' }> {
  return { outcome: 'deny', dryRun: false, allowedEffect: 'none', requiresApproval: false, ...(policyId ? { policyId } : {}), reason }
}

function unavailable(reason: string): Extract<CapabilityDecision, { outcome: 'unavailable' }> {
  return { outcome: 'unavailable', dryRun: false, allowedEffect: 'none', requiresApproval: false, reason }
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
