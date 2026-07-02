import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const dirname = path.dirname(fileURLToPath(import.meta.url))
const migrationsDir = path.resolve(dirname, '../src/db/migrations')
const portalSchema = readFileSync(path.join(migrationsDir, '0100_portal_schema.sql'), 'utf8')
const omittedReport = readFileSync(path.join(migrationsDir, '0100_portal_schema.omitted.md'), 'utf8')

describe('self-hosted portal schema bootstrap', () => {
  it('does not keep executable Supabase-only dependencies', () => {
    expect(portalSchema).not.toMatch(/auth\.uid|auth\.role|auth\.users|storage\.|supabase_migrations/i)
    expect(portalSchema).not.toMatch(/\b(authenticated|anon|service_role)\b|pgrst/i)
    expect(portalSchema).not.toMatch(/CREATE POLICY|DROP POLICY|ENABLE ROW LEVEL SECURITY/i)
  })

  it('keeps the core portal tables required by the first backend modules', () => {
    for (const table of [
      'public.users',
      'public.organizations',
      'public.memberships',
      'public.contracts',
      'public.contract_modules',
      'public.crm_pipelines',
      'public.conversations',
      'public.yux_strategy_agent_profiles',
      'public.agent_execution_runs',
    ]) {
      expect(portalSchema).toMatch(new RegExp(`CREATE TABLE (IF NOT EXISTS )?${table.replace('.', '\\.')}`, 'i'))
    }
  })

  it('keeps email template management schema in fresh bootstrap', () => {
    expect(portalSchema).toContain('CREATE TABLE IF NOT EXISTS public.email_templates')
    expect(portalSchema).toContain('CREATE TABLE IF NOT EXISTS public.email_template_versions')
    expect(portalSchema).toContain('template_version_id UUID REFERENCES public.email_template_versions')
    expect(portalSchema).toContain('system.client_invitation')
    expect(portalSchema).toContain('system.password_reset')
  })

  it('records omitted Supabase-specific statements for review', () => {
    expect(omittedReport).toContain('supabase rls policy')
    expect(omittedReport).toContain('supabase auth users table')
    expect(omittedReport).toContain('supabase storage dependency')
  })
})
