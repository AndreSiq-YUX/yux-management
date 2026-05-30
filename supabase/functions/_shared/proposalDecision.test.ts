import { describe, expect, it } from 'vitest'
import { validatePublicDecision } from './proposalDecision'

describe('public proposal decisions', () => {
  it('requires a comment only for adjustment requests', () => {
    expect(validatePublicDecision('adjustments_requested', '  ')).toBe('Descreva os ajustes solicitados.')
    expect(validatePublicDecision('rejected', '')).toBeUndefined()
    expect(validatePublicDecision('approved', '')).toBeUndefined()
  })

  it('rejects unsupported decisions', () => {
    expect(validatePublicDecision('later', '')).toBe('Decisao invalida.')
  })
})
