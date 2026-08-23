import { describe, expect, it } from 'vitest'
import {
  attributeMissionValue,
  hashAttributionPolicy,
  type AttributionEvent,
  type AttributionPolicy,
} from '../src/modules/action-engine/metrics/attribution.js'

const policy: AttributionPolicy = {
  version: 1, model: 'last_touch', windowDays: 30, eligibleEventTypes: ['email_sent','human_follow_up'],
  identityResolution: 'exact_lead', currency: 'BRL', lateEvents: 'reopen_evaluation',
}
const start = '2026-08-01T00:00:00.000Z'
const touches: AttributionEvent[] = [
  { id: 'touch-1', eventType: 'email_sent', occurredAt: '2026-08-02T00:00:00.000Z', leadId: 'lead-1' },
  { id: 'touch-2', eventType: 'human_follow_up', occurredAt: '2026-08-03T00:00:00.000Z', leadId: 'lead-1' },
]
const revenue: AttributionEvent[] = [
  { id: 'sale-1', eventType: 'sale_won', occurredAt: '2026-08-04T00:00:00.000Z', observedAt: '2026-08-05T00:00:00.000Z', leadId: 'lead-1', amount: '900', currency: 'BRL' },
]

describe('immutable mission value attribution', () => {
  it('selects first, last and linear touch evidence deterministically', () => {
    expect(attributeMissionValue({ policy: { ...policy, model: 'first_touch' }, missionStartedAt: start, evaluatedAt: '2026-08-06T00:00:00Z', touches, revenueEvents: revenue }))
      .toMatchObject({ metric: { kind: 'known', value: '900' }, credits: [{ touchEventId: 'touch-1', amountBrl: '900' }] })
    expect(attributeMissionValue({ policy, missionStartedAt: start, evaluatedAt: '2026-08-06T00:00:00Z', touches, revenueEvents: revenue }).credits)
      .toEqual([{ touchEventId: 'touch-2', revenueEventId: 'sale-1', amountBrl: '900' }])
    expect(attributeMissionValue({ policy: { ...policy, model: 'linear' }, missionStartedAt: start, evaluatedAt: '2026-08-06T00:00:00Z', touches, revenueEvents: revenue }).credits)
      .toEqual([
        { touchEventId: 'touch-1', revenueEventId: 'sale-1', amountBrl: '450' },
        { touchEventId: 'touch-2', revenueEventId: 'sale-1', amountBrl: '450' },
      ])
  })

  it('deduplicates events, enforces window and late-event policy', () => {
    const outside = { ...touches[0]!, id: 'outside', occurredAt: '2026-09-15T00:00:00.000Z' }
    const duplicateRevenue = [...revenue, structuredClone(revenue[0]!)]
    const result = attributeMissionValue({ policy, missionStartedAt: start, evaluatedAt: '2026-08-04T12:00:00Z', touches: [...touches, outside], revenueEvents: duplicateRevenue })
    expect(result.metric).toMatchObject({ kind: 'known', value: '900' })
    expect(result.eventIds).toEqual(['touch-2','sale-1'])
    expect(attributeMissionValue({ policy: { ...policy, lateEvents: 'ignore' }, missionStartedAt: start, evaluatedAt: '2026-08-04T12:00:00Z', touches, revenueEvents: revenue }).metric)
      .toMatchObject({ kind: 'known', value: '0' })
  })

  it('returns unknown for missing policy, unresolved identity or currency mismatch', () => {
    expect(attributeMissionValue({ policy: undefined, missionStartedAt: start, evaluatedAt: start, touches, revenueEvents: revenue }).metric)
      .toMatchObject({ kind: 'unknown', reason: 'attribution_policy_missing' })
    expect(attributeMissionValue({ policy, missionStartedAt: start, evaluatedAt: start, touches, revenueEvents: [{ ...revenue[0]!, leadId: undefined }] }).metric)
      .toMatchObject({ kind: 'unknown', reason: 'attribution_identity_unresolved' })
    expect(attributeMissionValue({ policy, missionStartedAt: start, evaluatedAt: start, touches, revenueEvents: [{ ...revenue[0]!, currency: 'USD' }] }).metric)
      .toMatchObject({ kind: 'unknown', reason: 'attribution_currency_mismatch' })
  })

  it('changes the policy hash for any material policy change', () => {
    expect(hashAttributionPolicy(policy)).toMatch(/^[a-f0-9]{64}$/)
    expect(hashAttributionPolicy({ ...policy, windowDays: 60 })).not.toBe(hashAttributionPolicy(policy))
  })
})
