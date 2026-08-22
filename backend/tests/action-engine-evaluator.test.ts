import { describe, expect, it } from 'vitest'
import { decideMissionConclusion } from '../src/modules/action-engine/evaluator.js'

const base = {
  targetRevenueBrl: '10000', signedRevenue: { kind: 'known' as const, value: '5000' as const, unit: 'BRL' },
  deadlineAt: '2026-09-30T00:00:00.000Z', now: '2026-09-01T00:00:00.000Z',
  criticalGuardrailBreached: false, killSwitchActive: false, minimumSampleReached: false, offTrack: false,
  requiredMetricUnknownIsBlocking: true,
}

describe('Action Engine deterministic evaluator', () => {
  it('prioritizes guardrails and kill switches above outcome', () => {
    expect(decideMissionConclusion({ ...base, signedRevenue: { kind: 'known', value: '15000', unit: 'BRL' }, criticalGuardrailBreached: true }).conclusion).toBe('pause')
    expect(decideMissionConclusion({ ...base, killSwitchActive: true }).reasons).toContain('kill_switch_active')
  })

  it('succeeds on target and expires after the deadline', () => {
    expect(decideMissionConclusion({ ...base, signedRevenue: { kind: 'known', value: '10000', unit: 'BRL' } }).conclusion).toBe('succeed')
    expect(decideMissionConclusion({ ...base, now: '2026-10-01T00:00:00.000Z' }).conclusion).toBe('expire')
  })

  it('blocks unknown critical metrics and proposes replan only after minimum sample', () => {
    expect(decideMissionConclusion({ ...base, signedRevenue: { kind: 'unknown', reason: 'missing_source', unit: 'BRL' } }).conclusion).toBe('block')
    expect(decideMissionConclusion({ ...base, minimumSampleReached: true, offTrack: true }).conclusion).toBe('propose_replan')
    expect(decideMissionConclusion({ ...base, offTrack: true }).conclusion).toBe('continue')
  })
})
