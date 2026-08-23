import { describe, expect, it } from 'vitest'
import { buildMissionDecisionSummary } from '../src/modules/action-engine/decision-summary.js'

const base = {
  headline: 'Criar funil e nutrição comercial', planRevision: 1, planHash: 'a'.repeat(64), manifestHash: 'b'.repeat(64),
  sourceIds: ['knowledge-1'], existingContacts: 0, futureEligibleContacts: true, channels: ['email'],
  estimatedCostBrl: '340', maximumCostBrl: '500', estimatedHumanMinutes: 45,
  artifacts: [
    { id: 'pipeline', entityType: 'pipeline', operation: 'create', quantity: 1, label: '1 funil comercial', version: 1 },
    { id: 'stages', entityType: 'stage', operation: 'create', quantity: 4, label: '4 etapas', version: 1 },
    { id: 'emails', entityType: 'email', operation: 'create', quantity: 4, label: '4 e-mails', version: 3, providerTarget: 'yux-email' },
  ],
  capabilityManifest: [
    { key: 'crm.pipeline.create', version: 1, definitionHash: 'c'.repeat(64), effect: 'internal' as const, recoveryKind: 'compensatable' as const },
    { key: 'email.message.queue', version: 1, definitionHash: 'd'.repeat(64), effect: 'external' as const, recoveryKind: 'irreversible' as const },
  ],
  assumptions: [{ key: 'tone', value: 'consultivo', source: 'company_context' as const }],
  attributionPolicy: { version: 1, hash: 'e'.repeat(64) },
}

describe('Mission decision summary', () => {
  it('states concrete quantities, contact impact, economics and irreversible effects', () => {
    const summary = buildMissionDecisionSummary(base)
    expect(summary.changes).toEqual(expect.arrayContaining([
      expect.objectContaining({ quantity: 1, label: '1 funil comercial' }),
      expect.objectContaining({ quantity: 4, label: '4 etapas' }),
      expect.objectContaining({ quantity: 4, label: '4 e-mails' }),
    ]))
    expect(summary.contactImpact).toEqual({ existingContacts: 0, futureEligibleContacts: true, channels: ['email'] })
    expect(summary.economics).toEqual({ estimatedCostBrl: '340', maximumCostBrl: '500', estimatedHumanMinutes: 45 })
    expect(summary.irreversibleEffects[0]?.capabilityKey).toBe('email.message.queue')
  })

  it('is stable and invalidates every authority-bearing change', () => {
    const original = buildMissionDecisionSummary(base).decisionSubjectHash
    expect(buildMissionDecisionSummary(structuredClone(base)).decisionSubjectHash).toBe(original)
    const mutations: Array<(value: typeof base) => void> = [
      value => { value.artifacts[2]!.version = 4 },
      value => { value.existingContacts = 10 },
      value => { value.maximumCostBrl = '501' },
      value => { value.artifacts[2]!.providerTarget = 'other-provider' },
      value => { value.capabilityManifest[0]!.definitionHash = 'f'.repeat(64) },
      value => { value.capabilityManifest[0]!.recoveryKind = 'irreversible' },
    ]
    for (const mutate of mutations) {
      const changed = structuredClone(base); mutate(changed)
      expect(buildMissionDecisionSummary(changed).decisionSubjectHash).not.toBe(original)
    }
  })

  it('rejects unversioned artifacts and missing maximum economics', () => {
    const artifact = structuredClone(base); (artifact.artifacts[0] as { version: string | number }).version = ''
    expect(() => buildMissionDecisionSummary(artifact)).toThrowError('mission_decision_artifact_unversioned')
    expect(() => buildMissionDecisionSummary({ ...base, maximumCostBrl: '' })).toThrowError('mission_decision_economics_invalid')
  })
})
