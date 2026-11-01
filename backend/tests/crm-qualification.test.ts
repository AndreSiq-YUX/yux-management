import { describe, expect, it } from 'vitest'
import {
  qualificationRuleSchema,
  evaluateProfileRule,
  scoreTemperature,
  ruleContribution,
} from '../src/modules/crm/qualification.js'

const rule = (extra = {}) =>
  qualificationRuleSchema.parse({
    name: 'Refeições',
    kind: 'profile',
    fieldKey: 'custom:custom_a-b',
    dimension: 'fit',
    points: 10,
    operator: 'exists',
    bands: [
      { min: null, max: 500, points: 10 },
      { min: 500, max: 1000, points: 20 },
      { min: 1000, max: null, points: 30 },
    ],
    ...extra,
  })
describe('qualification state contributions', () => {
  it.each([
    [0, 10],
    [499, 10],
    [500, 20],
    [999, 20],
    [1000, 30],
    [null, 0],
    [undefined, 0],
  ])('scores %s as %s', (value, points) => {
    expect(evaluateProfileRule(rule(), { 'custom:custom_a-b': value })).toBe(
      points,
    )
  })
  it('rejects overlapping and inverted bands', () => {
    expect(() =>
      rule({
        bands: [
          { min: 0, max: 100, points: 10 },
          { min: 99, max: 200, points: 20 },
        ],
      }),
    ).toThrow()
    expect(() => rule({ bands: [{ min: 100, max: 20, points: 10 }] })).toThrow()
  })
  it('distinguishes false, missing and zero', () => {
    const booleanRule = rule({
      bands: [],
      fieldKey: 'custom:boolean',
      operator: 'equals',
      comparisonValue: false,
    })
    expect(evaluateProfileRule(booleanRule, { 'custom:boolean': false })).toBe(
      10,
    )
    expect(evaluateProfileRule(booleanRule, {})).toBe(0)
  })
  it('enforces the selected customer type', () => {
    const kitchen = rule({
      recordTypeId: '00000000-0000-4000-8000-000000000001',
    })
    expect(
      evaluateProfileRule(kitchen, {
        'custom:custom_a-b': 1000,
        recordTypeId: null,
      }),
    ).toBe(0)
  })
  it('caps activity contributions, not the state ledger', () => {
    expect(ruleContribution(90, 30, 100)).toBe(10)
    expect(ruleContribution(100, 30, 100)).toBe(0)
    expect(scoreTemperature(39, 40, 70)).toBe('cold')
    expect(scoreTemperature(40, 40, 70)).toBe('warm')
    expect(scoreTemperature(70, 40, 70)).toBe('hot')
  })
})
