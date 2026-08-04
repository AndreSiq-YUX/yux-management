import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const dirname = path.dirname(fileURLToPath(import.meta.url))
const migrationPath = path.resolve(dirname, '../src/db/migrations/0123_active_prospecting_orchestration.sql')

describe('active prospecting orchestration schema', () => {
  it('creates governed policies, plans and channel permissions', () => {
    expect(existsSync(migrationPath)).toBe(true)
    if (!existsSync(migrationPath)) return

    const migration = readFileSync(migrationPath, 'utf8')
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS public.prospecting_policies')
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS public.prospecting_plans')
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS public.lead_channel_permissions')
    expect(migration).toContain('UNIQUE (organization_id, channel, address)')
    expect(migration).toContain('ALTER TABLE public.prospecting_plans FORCE ROW LEVEL SECURITY')
    expect(migration).toContain('ALTER TABLE public.lead_channel_permissions FORCE ROW LEVEL SECURITY')
  })

  it('extends existing Radar ledgers rather than creating parallel analysis/event tables', () => {
    expect(existsSync(migrationPath)).toBe(true)
    if (!existsSync(migrationPath)) return

    const migration = readFileSync(migrationPath, 'utf8')
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS run_kind TEXT')
    expect(migration).toContain("'yux_agent_runtime'")
    expect(migration).toContain("'analysis_requested'")
    expect(migration).toContain("'contact_blocked'")
    expect(migration).toContain("'radar', 'prospecting'")
    expect(migration).not.toContain('CREATE TABLE IF NOT EXISTS public.radar_analysis_runs')
  })
})
