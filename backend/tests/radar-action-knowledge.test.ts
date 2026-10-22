import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { expect, it } from 'vitest'
import { prepareRadarKnowledgePublication } from '../src/modules/radar/knowledge-publication.js'

it('prepares eight evidence-backed review proposals without claiming a publication', async () => {
  const source = await readFile(new URL('../../docs/knowledge/radar-commercial-action-engine.md', import.meta.url), 'utf8')
  const result = prepareRadarKnowledgePublication(source)
  expect(result.status).toBe('awaiting_review')
  expect(result.source.sha256).toBe(createHash('sha256').update(source).digest('hex'))
  expect(result.items).toHaveLength(8)
  expect(result.items.every(item => source.includes(item.evidence.excerpt))).toBe(true)
  expect(result.items.map(item => item.key)).toContain('resume_vs_new')
  expect(result.bindings).toContainEqual({ profileKey: 'growth_strategist', moduleKey: 'marketing_studio', workflowKey: 'mission_intake_conversation' })
  expect(result).not.toHaveProperty('publicationId')
  expect(JSON.stringify(result)).not.toContain('radar-commercial-execution-reference')
})

it('rejects an incomplete guide instead of producing ungrounded proposals', () => {
  expect(() => prepareRadarKnowledgePublication('# Incomplete')).toThrow('radar_knowledge_source_incomplete')
})
