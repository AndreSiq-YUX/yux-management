import { describe, expect, it } from 'vitest'
import { resolveCapabilityDecision } from '../src/modules/action-engine/capability-policy.js'

const base = {
  capability: { approval: 'risk_based' as const, effect: 'internal' as const },
  policy: { id: 'policy-1', enabled: true, killSwitch: false },
  globalKillSwitch: false, requiredConnectionsHealthy: true, legalOrConsentAllowed: true,
  budgetAvailable: true, missionMode: 'assisted' as const,
}

describe('Action Engine capability policy precedence', () => {
  it('lets kill switches and explicit disables override lower-precedence allows', () => {
    expect(resolveCapabilityDecision({ ...base, globalKillSwitch: true })).toMatchObject({ outcome: 'deny', reason: 'action_engine_kill_switch_active' })
    expect(resolveCapabilityDecision({ ...base, policy: { ...base.policy, enabled: false } })).toMatchObject({ outcome: 'deny', reason: 'capability_disabled' })
  })

  it('does not let approval override consent or budget denials', () => {
    expect(resolveCapabilityDecision({ ...base, legalOrConsentAllowed: false, policy: { ...base.policy, approvalOverride: 'always' } })).toMatchObject({ outcome: 'deny', requiresApproval: false, reason: 'legal_or_consent_denied' })
    expect(resolveCapabilityDecision({ ...base, budgetAvailable: false })).toMatchObject({ outcome: 'deny', reason: 'mission_budget_exceeded' })
  })

  it('distinguishes unavailable infrastructure from a policy deny', () => {
    expect(resolveCapabilityDecision({ ...base, requiredConnectionsHealthy: false })).toMatchObject({ outcome: 'unavailable', reason: 'capability_connection_unavailable' })
    expect(resolveCapabilityDecision({ ...base, capability: undefined })).toMatchObject({ outcome: 'unavailable', reason: 'capability_not_registered' })
  })

  it('requires approval for explicit always and every external effect in assisted mode', () => {
    expect(resolveCapabilityDecision({ ...base, policy: { ...base.policy, approvalOverride: 'always' } })).toMatchObject({ outcome: 'allow', requiresApproval: true })
    expect(resolveCapabilityDecision({ ...base, capability: { approval: 'never', effect: 'external' } })).toMatchObject({ outcome: 'allow', requiresApproval: true })
  })
})
