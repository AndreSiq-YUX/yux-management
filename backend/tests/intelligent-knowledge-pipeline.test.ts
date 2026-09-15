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

  it('keeps every request within the runtime section-count limit', () => {
    const sections = Array.from({ length: 161 }, (_, index) => ({
      locator: `paragraph:${index + 1}`,
      body: `Trecho ${index + 1}`,
    }))

    const batches = batchLocatedSections(sections, 100_000)

    expect(batches).toHaveLength(3)
    expect(batches.every(batch => batch.length <= 80)).toBe(true)
    expect(batches.flat().map(section => section.body)).toEqual(sections.map(section => section.body))
  })

  it('splits a single oversized section without losing its content or provenance', () => {
    const body = 'Uma secao longa que precisa ser dividida sem perder nenhuma parte.'

    const batches = batchLocatedSections([{ locator: 'paragraph:1', heading: 'Titulo', body }], 20)
    const parts = batches.flat()

    expect(parts.length).toBeGreaterThan(1)
    expect(parts.every(part => part.body.length <= 20)).toBe(true)
    expect(parts.map(part => part.body).join('')).toBe(body)
    expect(parts[0]).toMatchObject({ locator: 'paragraph:1:chars:1-20', heading: 'Titulo (parte 1)' })
  })
})
