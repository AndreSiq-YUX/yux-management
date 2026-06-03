import { assertEquals } from 'jsr:@std/assert@1'
import { validatePublicDecision } from './proposalDecision.ts'

Deno.test('validatePublicDecision requires a comment only for adjustment requests', () => {
  assertEquals(validatePublicDecision('adjustments_requested', '  '), 'Descreva os ajustes solicitados.')
  assertEquals(validatePublicDecision('rejected', ''), undefined)
  assertEquals(validatePublicDecision('approved', ''), undefined)
})

Deno.test('validatePublicDecision rejects unsupported decisions', () => {
  assertEquals(validatePublicDecision('later', ''), 'Decisao invalida.')
})
