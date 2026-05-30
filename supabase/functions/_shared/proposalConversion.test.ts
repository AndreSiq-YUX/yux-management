import { describe, expect, it } from 'vitest'
import { selectConversionPreset } from './proposalConversion'

describe('proposal conversion preset selection', () => {
  it('prefers blueprint phases and falls back to package phases', () => {
    expect(selectConversionPreset(['blueprint'], ['package'])).toEqual(['blueprint'])
    expect(selectConversionPreset([], ['package'])).toEqual(['package'])
  })
})
