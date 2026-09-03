import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const dirname = path.dirname(fileURLToPath(import.meta.url))
const migrationPath = path.resolve(dirname, '../src/db/migrations/0150_mission_intake_run_source.sql')

describe('Mission intake trace source schema', () => {
  it('allows the server-owned mission intake source without removing existing sources', () => {
    expect(existsSync(migrationPath)).toBe(true)
    const sql = readFileSync(migrationPath, 'utf8')
    expect(sql).toContain('DROP CONSTRAINT IF EXISTS agent_execution_runs_run_source_check')
    for (const source of [
      'whatsapp', 'strategy_admin', 'marketing_studio', 'scheduled',
      'runtime', 'test', 'radar', 'prospecting', 'mission_intake',
    ]) expect(sql).toContain(`'${source}'`)
  })
})
