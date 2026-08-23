import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { hashCanonical } from '../src/modules/action-engine/repository.js'

const migration = readFileSync(new URL('../src/db/migrations/0131_mission_supervisor_foundation.sql', import.meta.url), 'utf8')

describe('generic Mission Supervisor foundation schema', () => {
  it('adds generic goals, autonomy, pack selection and autonomous mode', () => {
    expect(migration).toContain('goal JSONB')
    expect(migration).toContain('autonomy_envelope JSONB')
    expect(migration).toContain('pack_selection JSONB')
    expect(migration).toContain("'autonomous'")
  })

  it('stores append-only tenant context snapshots with exact hashes', () => {
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS public.action_mission_context_snapshots')
    expect(migration).toContain('capability_catalog_hash')
    expect(migration).toContain('action_mission_context_snapshots_append_only')
    expect(migration).toContain('private.rls_can_access_organization(organization_id)')
    expect(hashCanonical({ b: 2, a: 1 })).toBe(hashCanonical({ a: 1, b: 2 }))
  })
})
