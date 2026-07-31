import { expect, it } from 'vitest'

function assertEquals(actual: unknown, expected: unknown) {
  expect(actual).toEqual(expected)
}
import { selectConversionPreset } from '../../src/lib/edge-compat/proposalConversion.js'

it('selectConversionPreset prefers blueprint phases and falls back to package phases', () => {
  assertEquals(selectConversionPreset(['blueprint'], ['package']), ['blueprint'])
  assertEquals(selectConversionPreset([], ['package']), ['package'])
})
