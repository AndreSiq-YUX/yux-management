import { expect, it } from 'vitest'

function assertEquals(actual: unknown, expected: unknown) {
  expect(actual).toEqual(expected)
}
import { validatePublicDecision } from '../../src/lib/edge-compat/proposalDecision.js'

it('validatePublicDecision requires a comment only for adjustment requests', () => {
  assertEquals(validatePublicDecision('adjustments_requested', '  '), 'Descreva os ajustes solicitados.')
  assertEquals(validatePublicDecision('rejected', ''), undefined)
  assertEquals(validatePublicDecision('approved', ''), undefined)
})

it('validatePublicDecision rejects unsupported decisions', () => {
  assertEquals(validatePublicDecision('later', ''), 'Decisao invalida.')
})
