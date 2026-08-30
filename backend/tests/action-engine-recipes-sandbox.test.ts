import { describe, expect, it } from 'vitest'
import { hashCanonical } from '../src/modules/action-engine/repository.js'
import { REAL_ESTATE_FUNNEL_RECIPE } from '../src/modules/action-engine/recipes.js'
import { seededEntityUnchanged } from '../src/modules/action-engine/sandbox-seeder.js'

describe('mission recipes and sandbox invariants', () => {
  it('pins the complete recipe definition behind its canonical hash', () => {
    const { contentHash, ...definition } = REAL_ESTATE_FUNNEL_RECIPE
    expect(contentHash).toBe(hashCanonical(definition))
    expect(REAL_ESTATE_FUNNEL_RECIPE.packSelections).toEqual([
      expect.objectContaining({ key: 'funnel_nurture', version: '1.0.0', contentHash: expect.stringMatching(/^[a-f0-9]{64}$/) }),
    ])
  })

  it('only considers a seeded record disposable while its canonical content is unchanged', () => {
    const current = { name: '[DEMO] Funil', isActive: true }
    const expectedHash = hashCanonical(current)
    expect(seededEntityUnchanged(expectedHash, current)).toBe(true)
    expect(seededEntityUnchanged(expectedHash, { ...current, name: 'Funil editado pelo cliente' })).toBe(false)
    expect(seededEntityUnchanged(expectedHash, null)).toBe(false)
  })
})
