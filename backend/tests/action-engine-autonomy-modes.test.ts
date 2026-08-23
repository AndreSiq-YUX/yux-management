import { describe, expect, it } from 'vitest'
import { resolveCapabilityDecision, resolveExecutionMode } from '../src/modules/action-engine/capability-policy.js'
import { createActionEngineCapabilityRegistry } from '../src/modules/action-engine/capabilities/index.js'
import { evaluateCapabilityReadiness } from '../src/modules/action-engine/readiness.js'

const effects = ['none', 'draft', 'internal', 'external', 'destructive'] as const

describe('Mission autonomy mode matrix', () => {
  it('simulates every potential effect in shadow mode', () => {
    for (const effect of effects) {
      expect(resolveExecutionMode('shadow', effect)).toMatchObject({ outcome: 'allow', dryRun: true, requiresApproval: false })
    }
  })

  it('only materializes drafts in prepare mode', () => {
    expect(resolveExecutionMode('prepare', 'none')).toMatchObject({ outcome: 'allow', dryRun: false })
    expect(resolveExecutionMode('prepare', 'draft')).toMatchObject({ outcome: 'allow', dryRun: false })
    for (const effect of ['internal', 'external', 'destructive'] as const) {
      expect(resolveExecutionMode('prepare', effect)).toMatchObject({ outcome: 'allow', dryRun: true, requiresApproval: false })
    }
  })

  it('requires approval for real external and destructive effects in assisted mode', () => {
    for (const effect of ['none', 'draft', 'internal'] as const) {
      expect(resolveExecutionMode('assisted', effect)).toMatchObject({ outcome: 'allow', dryRun: false, requiresApproval: false })
    }
    for (const effect of ['external', 'destructive'] as const) {
      expect(resolveExecutionMode('assisted', effect)).toMatchObject({ outcome: 'allow', dryRun: false, requiresApproval: true })
    }
  })

  it('allows autonomous effects but never makes destructive effects approval-free', () => {
    expect(resolveExecutionMode('autonomous', 'external')).toMatchObject({ outcome: 'allow', dryRun: false, requiresApproval: false })
    expect(resolveExecutionMode('autonomous', 'destructive')).toMatchObject({ outcome: 'allow', dryRun: false, requiresApproval: true })
  })

  it('rechecks paused missions, expired envelopes, permissions, modes and kill switches', () => {
    const base = {
      capability: { approval: 'never' as const, effect: 'external' as const, supportsModes: ['autonomous'] as const,
        requiredPermissions: ['campaign.write'] },
      policy: { enabled: true, killSwitch: false }, globalKillSwitch: false,
      requiredConnectionsHealthy: true, legalOrConsentAllowed: true, budgetAvailable: true,
      missionMode: 'autonomous' as const, missionActive: true, envelopeExpiresAt: '2099-01-01T00:00:00.000Z',
      now: new Date('2026-08-22T00:00:00.000Z'), actorPermissions: ['campaign.write'], capabilityAllowedByEnvelope: true,
    }
    expect(resolveCapabilityDecision(base)).toMatchObject({ outcome: 'allow', dryRun: false })
    expect(resolveCapabilityDecision({ ...base, missionActive: false })).toMatchObject({ outcome: 'deny', reason: 'mission_not_active' })
    expect(resolveCapabilityDecision({ ...base, envelopeExpiresAt: '2020-01-01T00:00:00.000Z' })).toMatchObject({ outcome: 'deny', reason: 'mission_autonomy_envelope_expired' })
    expect(resolveCapabilityDecision({ ...base, actorPermissions: [] })).toMatchObject({ outcome: 'deny', reason: 'capability_permission_denied' })
    expect(resolveCapabilityDecision({ ...base, capabilityAllowedByEnvelope: false })).toMatchObject({ outcome: 'deny', reason: 'capability_outside_autonomy_envelope' })
    expect(resolveCapabilityDecision({ ...base, missionMode: 'assisted' })).toMatchObject({ outcome: 'unavailable', reason: 'capability_mode_unsupported' })
    expect(resolveCapabilityDecision({ ...base, capabilityKillSwitch: true })).toMatchObject({ outcome: 'deny', reason: 'capability_kill_switch_active' })
  })

  it('returns actionable readiness blockers for missing modules and connections', async () => {
    const checks = await evaluateCapabilityReadiness(createActionEngineCapabilityRegistry(), {
      organizationId: 'org-1', missionId: 'mission-1', mode: 'assisted', allowedModules: ['crm'],
      capabilityKey: 'email.message.queue', capabilityVersion: 1, capabilityInput: {}, healthyConnections: [],
    })
    expect(checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'capability_module_unavailable', fixHref: '/platform/contracts' }),
      expect.objectContaining({ code: 'capability_connection_unavailable', fixHref: '/integrations' }),
    ]))
  })
})
