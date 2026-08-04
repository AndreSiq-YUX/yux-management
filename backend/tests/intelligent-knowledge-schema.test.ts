import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('intelligent knowledge schema', () => {
  it('adds processing runs, reviewable suggestions and curated chunk provenance', () => {
    const sql = readFileSync(new URL('../src/db/migrations/0126_intelligent_knowledge_pipeline.sql', import.meta.url), 'utf8')

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.knowledge_intelligence_runs')
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.company_intelligence_suggestions')
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS chunk_kind')
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS evidence_excerpt')
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS embedding_dimensions')
    expect(sql).toContain("chunk_kind IN ('raw','curated_fact','curated_summary')")
    expect(sql).toContain('UNIQUE (run_id, field_path, source_url)')
  })
})
