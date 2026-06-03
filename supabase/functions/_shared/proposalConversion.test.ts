import { assertEquals } from 'jsr:@std/assert@1'
import { selectConversionPreset } from './proposalConversion.ts'

Deno.test('selectConversionPreset prefers blueprint phases and falls back to package phases', () => {
  assertEquals(selectConversionPreset(['blueprint'], ['package']), ['blueprint'])
  assertEquals(selectConversionPreset([], ['package']), ['package'])
})
