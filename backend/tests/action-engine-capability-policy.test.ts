import { describe, expect, it } from 'vitest'
import { resolveCapabilityDecision } from '../src/modules/action-engine/capability-policy.js'

const base = {
  capability: { approval: 'never' as const, effect: 'internal' as const },
  policy: { enabled: true, killSwitch: false }, globalKillSwitch: false,
  organizationKillSwitch: false, packKillSwitch: false, capabilityKillSwitch: false,
  requiredConnectionsHealthy: true, legalOrConsentAllowed: true, budgetAvailable: true,
  missionMode: 'assisted' as const,
}

describe('granular Action Engine kill switches', () => {
  it('applies global, organization, pack then exact capability precedence', () => {
    expect(resolveCapabilityDecision({ ...base, globalKillSwitch: true }).reason).toBe('action_engine_kill_switch_active')
    expect(resolveCapabilityDecision({ ...base, organizationKillSwitch: true }).reason).toBe('organization_kill_switch_active')
    expect(resolveCapabilityDecision({ ...base, packKillSwitch: true }).reason).toBe('pack_kill_switch_active')
    expect(resolveCapabilityDecision({ ...base, capabilityKillSwitch: true }).reason).toBe('capability_kill_switch_active')
  })

  it('disables one exact capability without denying another', () => {
    expect(resolveCapabilityDecision({ ...base, capabilityKillSwitch: true })).toMatchObject({ outcome: 'deny' })
    expect(resolveCapabilityDecision({ ...base, capabilityKillSwitch: false, capability: { approval: 'never', effect: 'internal' } })).toMatchObject({ outcome: 'allow' })
  })
})
