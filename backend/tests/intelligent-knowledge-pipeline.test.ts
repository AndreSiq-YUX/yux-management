import { describe, expect, it } from 'vitest'
import { batchLocatedSections } from '../src/jobs/handlers/company-intelligence.js'

describe('intelligent knowledge pipeline batching', () => {
  it('preserves source order and locators while bounding requests', () => {
    const sections = [
      { locator: 'paragraph:1', body: 'A'.repeat(7) },
      { locator: 'paragraph:2', body: 'B'.repeat(7) },
      { locator: 'paragraph:3', body: 'C'.repeat(7) },
    ]
    const batches = batchLocatedSections(sections, 10)
    expect(batches).toHaveLength(3)
    expect(batches.flat().map(section => section.locator)).toEqual(['paragraph:1', 'paragraph:2', 'paragraph:3'])
  })
})
