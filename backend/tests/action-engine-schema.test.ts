import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const dirname = path.dirname(fileURLToPath(import.meta.url))
const migrationPath = path.resolve(dirname, '../src/db/migrations/0128_action_engine_foundation.sql')
const tables = [
  'action_packs', 'action_pack_versions', 'action_missions', 'action_mission_metrics',
  'action_plans', 'action_plan_steps', 'action_runs', 'action_run_attempts',
  'action_cost_entries', 'action_approvals', 'action_observations',
  'action_mission_entities', 'action_evaluations', 'action_capability_policies',
]

describe('Action Engine schema', () => {
  it('creates all durable business ledgers', () => {
    expect(existsSync(migrationPath)).toBe(true)
    const sql = readFileSync(migrationPath, 'utf8')
    for (const table of tables) expect(sql).toContain(`CREATE TABLE IF NOT EXISTS public.${table}`)
    expect(sql).toContain('FORCE ROW LEVEL SECURITY')
    expect(sql).toContain('private.rls_can_access_organization(organization_id)')
    expect(sql).toContain('private.rls_is_internal()')
  })

  it('enforces revision, idempotency and exclusive ownership constraints', () => {
    const sql = readFileSync(migrationPath, 'utf8')
    expect(sql).toContain('UNIQUE (mission_id, revision)')
    expect(sql).toContain('UNIQUE (pack_id, semantic_version)')
    expect(sql).toContain('UNIQUE (plan_id, step_key)')
    expect(sql).toContain('UNIQUE (run_id, attempt_number)')
    expect(sql).toContain('UNIQUE (idempotency_key)')
    expect(sql).toContain('UNIQUE (mission_id, entity_type, entity_id, role)')
    expect(sql).toContain('idx_action_mission_entities_exclusive')
    expect(sql).toContain('idx_action_plans_one_active_revision')
  })

  it('uses exact decimal money and protects published/approved history', () => {
    const sql = readFileSync(migrationPath, 'utf8')
    const costTable = sql.slice(sql.indexOf('CREATE TABLE IF NOT EXISTS public.action_cost_entries'), sql.indexOf('CREATE TABLE IF NOT EXISTS public.action_approvals'))
    expect(costTable).toContain('NUMERIC(')
    expect(costTable).not.toMatch(/\bREAL\b|DOUBLE PRECISION/i)
    expect(sql).toContain('action_pack_version_immutable')
    expect(sql).toContain('action_plan_immutable')
    expect(sql).toContain('action_cost_entries_append_only')
  })
})
