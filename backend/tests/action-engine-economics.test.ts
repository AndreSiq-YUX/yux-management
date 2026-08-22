import { describe, expect, it } from 'vitest'
import { calculateHumanCost, calculateMissionEconomics, divideScaled, formatScaledDecimal, parseScaledDecimal } from '../src/modules/action-engine/economics.js'

describe('Action Engine mission economics', () => {
  it('calculates productization KPIs without floating point money', () => {
    expect(calculateMissionEconomics({ value: '10000', costs: ['300', '225'], humanHours: '3', completedActions: 10, humanActions: 2 })).toMatchObject({
      totalExecutionCostBrl: '525.00', netValueBrl: '9475.00', valueCostRatio: '19.0476',
      valuePerHumanHourBrl: '3333.33', humanFreeExecutionRate: '0.8000',
    })
  })

  it('uses not_applicable instead of inventing zero ratios', () => {
    const result = calculateMissionEconomics({ value: '0', costs: [], humanHours: '0', completedActions: 0, humanActions: 0 })
    expect(result.valueCostRatio).toBe('not_applicable')
    expect(result.valuePerHumanHourBrl).toBe('not_applicable')
    expect(result.humanFreeExecutionRate).toBe('not_applicable')
  })

  it('prices 180 human minutes at R$75/hour as R$225', () => {
    expect(calculateHumanCost('180', '75')).toBe('225.00')
  })

  it('parses, formats and divides scaled decimals deterministically', () => {
    expect(formatScaledDecimal(parseScaledDecimal('12.345', 2), 2)).toBe('12.35')
    expect(formatScaledDecimal(divideScaled(10_000n, 525n, 4), 4)).toBe('19.0476')
    expect(() => divideScaled(1n, 0n, 2)).toThrowError('decimal_division_by_zero')
  })
})
