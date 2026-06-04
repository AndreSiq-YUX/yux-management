import { describe, expect, it } from 'vitest'
import { canEnrollInSequence, calculateSequenceConversionRate } from './sequenceRules'

describe('sequenceRules', () => {
  it('blocks enrollment when contact channel is missing', () => {
    expect(canEnrollInSequence({
      channel: 'email',
      email: '',
      whatsappPhone: '+5511999999999',
      emailOptIn: true,
    })).toEqual({ ok: false, reason: 'email_required' })
  })

  it('blocks email sequence without opt-in', () => {
    expect(canEnrollInSequence({ channel: 'email', email: 'ana@example.com', emailOptIn: false })).toEqual({
      ok: false,
      reason: 'email_opt_in_required',
    })
  })

  it('calculates sequence conversion rate', () => {
    expect(calculateSequenceConversionRate({ enrolled: 20, converted: 5 })).toBe(25)
  })
})
