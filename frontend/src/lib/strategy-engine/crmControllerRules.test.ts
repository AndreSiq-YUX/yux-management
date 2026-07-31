import { describe, expect, it } from 'vitest'
import {
  buildCrmControllerRecommendation,
  detectMissingNextAction,
  detectStageMismatch,
  detectStaleLead,
  recommendCrmNextAction,
} from './crmControllerRules'

const oldDate = new Date(Date.now() - 7 * 86_400_000).toISOString()

describe('crm controller strategy rules', () => {
  it('detects raised hand with no follow-up as high priority', () => {
    const recommendation = recommendCrmNextAction({ id: 'lead-1', commercialStage: 'raised_hand' })

    expect(detectMissingNextAction({ id: 'lead-1', commercialStage: 'raised_hand' })).toBe(true)
    expect(recommendation.type).toBe('follow_up_task')
    expect(recommendation.priority).toBe('high')
  })

  it('does not treat cold lead as hot opportunity', () => {
    const recommendation = recommendCrmNextAction({ id: 'lead-2', commercialStage: 'lead_cold', temperature: 'cold' })

    expect(recommendation.type).toBe('follow_up_task')
    expect(recommendation.priority).toBe('medium')
  })

  it('routes proposal with price objection to closer and objection intelligence', () => {
    const recommendation = recommendCrmNextAction(
      { id: 'lead-3', commercialStage: 'almost_customer', mainObjection: 'price' },
      {},
      ['price'],
    )

    expect(recommendation.type).toBe('objection_capture')
    expect(recommendation.owner).toBe('ai_closer')
  })

  it('routes inactive customer to retention or revenue recovery', () => {
    const recommendation = recommendCrmNextAction(
      { id: 'lead-4', commercialStage: 'ex_customer' },
      { inactiveDays: 120, stuckOpportunityValue: 50000 },
    )

    expect(recommendation.type).toBe('revenue_recovery_sequence')
    expect(recommendation.priority).toBe('high')
  })

  it('does not pursue bad fit aggressively', () => {
    const recommendation = recommendCrmNextAction({ id: 'lead-5', commercialStage: 'bad_fit', fitStatus: 'bad_fit' })

    expect(recommendation.type).toBe('do_not_pursue')
  })

  it('detects stale lead from last activity', () => {
    expect(detectStaleLead({ id: 'lead-6', lastActivityAt: oldDate })).toBe(true)
  })

  it('detects stage mismatch for hot lead still marked cold', () => {
    expect(detectStageMismatch({ id: 'lead-7', commercialStage: 'lead_cold', temperature: 'hot' })).toBe(true)
  })

  it('builds structured CRM controller recommendation', () => {
    const payload = buildCrmControllerRecommendation(
      { id: 'lead-8', commercialStage: 'raised_hand' },
      { concept_cards: [{ id: 'card-sdr' }], context_hash: 'hash-1' },
    )

    expect(payload.stage).toBe('raised_hand')
    expect(payload.supportingCards).toEqual(['card-sdr'])
    expect(payload.metadata.contextHash).toBe('hash-1')
  })
})
