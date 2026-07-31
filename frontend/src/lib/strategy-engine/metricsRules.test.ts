import { describe, expect, it } from 'vitest'
import {
  calculateCac,
  calculateMroi,
  calculateStageConversion,
  classifyCashPriority,
  estimateRecoverableValue,
} from './metricsRules'

describe('strategy metrics rules', () => {
  it('returns null CAC when there are no customers', () => {
    expect(calculateCac(3000, 0)).toBeNull()
  })

  it('calculates CAC from spend and customers', () => {
    expect(calculateCac(6000, 3)).toBe(2000)
  })

  it('calculates MROI from revenue minus spend and operational cost', () => {
    expect(calculateMroi(30000, 6000, 4000)).toBe(2)
  })

  it('calculates stage conversion and clamps invalid overflow', () => {
    expect(calculateStageConversion(100, 25)).toBe(0.25)
    expect(calculateStageConversion(10, 20)).toBe(1)
    expect(calculateStageConversion(0, 20)).toBeNull()
  })

  it('estimates recoverable value from count, ticket and expected rate', () => {
    expect(estimateRecoverableValue(20, 1000, 0.25)).toBe(5000)
  })

  it('classifies high stuck opportunity value as high priority', () => {
    expect(classifyCashPriority({ stuckOpportunityValue: 35000 })).toBe('high_priority')
  })

  it('classifies negative MROI as critical', () => {
    expect(classifyCashPriority({ mroi: -0.3 })).toBe('critical')
  })
})
