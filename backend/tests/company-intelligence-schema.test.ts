import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('company intelligence schema', () => {
  it('creates the canonical organization profile and knowledge governance fields', () => {
    const sql = readFileSync(new URL('../src/db/migrations/0125_company_intelligence_hub.sql', import.meta.url), 'utf8')

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.organization_company_profiles')
    expect(sql).toContain('UNIQUE (organization_id)')
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS visibility')
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS allowed_agent_profile_keys')
    expect(sql).toContain('idx_knowledge_entries_org_published_fts')
  })
})
