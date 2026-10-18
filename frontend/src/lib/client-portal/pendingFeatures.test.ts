import { describe, expect, it } from 'vitest'
import { PENDING_FEATURES, getPendingFeature, listPendingFeatures, type PendingCode } from './pendingFeatures'

const EXPECTED_CODES = Array.from({ length: 26 }, (_, index) => `B${index + 1}`) as PendingCode[]

describe('pendingFeatures', () => {
  it('registers every code from B1 to B26 with complete fields', () => {
    expect(Object.keys(PENDING_FEATURES).sort()).toEqual([...EXPECTED_CODES].sort())
    for (const code of EXPECTED_CODES) {
      const feature = getPendingFeature(code)
      expect(feature.code).toBe(code)
      expect(feature.title.trim()).not.toBe('')
      expect(feature.clientMessage.trim()).not.toBe('')
      expect(feature.screens.length).toBeGreaterThan(0)
      feature.screens.forEach(screen => expect(screen.startsWith('/')).toBe(true))
    }
  })

  it('lists features sorted by numeric code', () => {
    expect(listPendingFeatures().map(feature => feature.code)).toEqual(EXPECTED_CODES)
  })

  it('prints the current pending checklist', () => {
    const lines = listPendingFeatures().map(feature => `${feature.code} - ${feature.title} (${feature.screens.join(', ')})`)
    console.info(`Pendências do portal:\n${lines.join('\n')}`)
    expect(lines).toHaveLength(26)
  })
})
