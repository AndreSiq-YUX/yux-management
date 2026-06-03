import { assertEquals } from 'jsr:@std/assert@1'
import { getNextActiveSequenceStep } from './crmAutomation.ts'

Deno.test('getNextActiveSequenceStep returns the next active step after the completed step', () => {
  assertEquals(getNextActiveSequenceStep([
    { id: 'third', order_index: 2, is_active: true },
    { id: 'disabled', order_index: 1, is_active: false },
    { id: 'first', order_index: 0, is_active: true },
  ], 0), { id: 'third', order_index: 2, is_active: true })
})

Deno.test('getNextActiveSequenceStep returns undefined when the sequence is complete', () => {
  assertEquals(getNextActiveSequenceStep([
    { id: 'first', order_index: 0, is_active: true },
  ], 0), undefined)
})
