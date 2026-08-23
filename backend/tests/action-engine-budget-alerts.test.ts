import { describe, expect, it } from 'vitest'
import { calculateMissionBudgetBurnDown } from '../src/modules/action-engine/budget-alerts.js'
import { filterReadinessCorrectionLinks } from '../src/modules/action-engine/readiness.js'

describe('Action Engine operational budget controls', () => {
  it.each([['50.00', [50]], ['80.00', [50, 80]], ['95.00', [50, 80, 95]]])('crossing %s%% emits the exact thresholds', (amount, thresholds) => {
    const result = calculateMissionBudgetBurnDown({ maximumCostBrl: '100', envelopeVersion: 1, entries: [reserved('r1', amount)] })
    expect(result.newlyCrossedThresholds).toEqual(thresholds)
    expect(result.alertThresholds).toEqual(thresholds)
  })

  it('a jump from 49 to 96 emits every missing threshold once per envelope version', () => {
    const before = calculateMissionBudgetBurnDown({ maximumCostBrl: '100', envelopeVersion: 4, entries: [reserved('r1', '49')] })
    expect(before.newlyCrossedThresholds).toEqual([])
    const after = calculateMissionBudgetBurnDown({ maximumCostBrl: '100', envelopeVersion: 4, entries: [reserved('r1', '96')] })
    expect(after.newlyCrossedThresholds).toEqual([50, 80, 95])
    const repeated = calculateMissionBudgetBurnDown({ maximumCostBrl: '100', envelopeVersion: 4, entries: [reserved('r1', '96')], emittedThresholds: after.newlyCrossedThresholds })
    expect(repeated.newlyCrossedThresholds).toEqual([])
  })

  it('removes reversed reservations and always budgets from normalized BRL', () => {
    const reversed = calculateMissionBudgetBurnDown({ maximumCostBrl: '100', envelopeVersion: 1, entries: [reserved('r1', '60'), { id: 'x1', nature: 'reversal', amountBrl: '-60', reversesEntryId: 'r1' }], emittedThresholds: [50] })
    expect(reversed.reservedCostBrl).toBe('0.000000')
    expect(reversed.consumedPercent).toBe('0.00')
    expect(reversed.alertThresholds).toEqual([50])
    expect(reversed.nextAlertThreshold).toBe(80)
    const converted = calculateMissionBudgetBurnDown({ maximumCostBrl: '1000', envelopeVersion: 1, entries: [{ id: 'a1', nature: 'actual', amountBrl: '200', currencyOriginal: 'USD' }] })
    expect(converted.actualCostBrl).toBe('200.000000')
    expect(converted.consumedPercent).toBe('20.00')
  })

  it('keeps only allowlisted correction routes the actor can access', () => {
    const checks = filterReadinessCorrectionLinks([
      { status: 'block', code: 'contract', message: 'Contrato', fixHref: '/platform/contracts' },
      { status: 'block', code: 'crm', message: 'CRM', fixHref: '/crm/settings' },
      { status: 'block', code: 'unsafe', message: 'Inválido', fixHref: 'https://evil.example' },
    ], ['crm'])
    expect(checks[0]?.fixHref).toBeUndefined()
    expect(checks[1]?.fixHref).toBe('/crm/settings')
    expect(checks[2]?.fixHref).toBeUndefined()
  })
})

function reserved(id: string, amountBrl: string) { return { id, nature: 'reserved' as const, amountBrl } }
