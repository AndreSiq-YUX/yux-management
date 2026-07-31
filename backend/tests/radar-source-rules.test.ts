import { describe, expect, it } from 'vitest'
import {
  assertSmallBatchLimit,
  estimateRadarCost,
  normalizeRadarSourceKey,
  sourceRequiresEnabledCatalog,
} from '../src/modules/radar/sourceRules.js'

describe('radar source rules', () => {
  it('enforces small batch limits', () => {
    expect(() => assertSmallBatchLimit(10)).not.toThrow()
    expect(() => assertSmallBatchLimit(11)).toThrow('radar_batch_limit_exceeded')
    expect(() => assertSmallBatchLimit(0)).toThrow('radar_batch_empty')
  })

  it('normalizes source keys and estimates cost', () => {
    expect(normalizeRadarSourceKey(' Jina Reader ')).toBe('jina_reader')
    expect(estimateRadarCost(3, 0.125)).toBe(0.375)
  })

  it('keeps manual and csv available without external provider enablement', () => {
    expect(sourceRequiresEnabledCatalog('manual')).toBe(false)
    expect(sourceRequiresEnabledCatalog('csv')).toBe(false)
    expect(sourceRequiresEnabledCatalog('jina_reader')).toBe(true)
  })
})
