import { describe, expect, it } from 'vitest'
import { getNextActiveSequenceStep } from './crmAutomation'

describe('getNextActiveSequenceStep', () => {
  it('returns the next active step after the completed step', () => {
    expect(getNextActiveSequenceStep([
      { id: 'third', order_index: 2, is_active: true },
      { id: 'disabled', order_index: 1, is_active: false },
      { id: 'first', order_index: 0, is_active: true },
    ], 0)).toEqual({ id: 'third', order_index: 2, is_active: true })
  })

  it('returns undefined when the sequence is complete', () => {
    expect(getNextActiveSequenceStep([
      { id: 'first', order_index: 0, is_active: true },
    ], 0)).toBeUndefined()
  })
})
