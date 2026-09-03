import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const dirname = path.dirname(fileURLToPath(import.meta.url))
const migrationPath = path.resolve(dirname, '../src/db/migrations/0151_mission_intake_trace_link.sql')

describe('Mission intake trace link schema', () => {
  it('links agent traces to mission conversations without overloading support conversations', () => {
    expect(existsSync(migrationPath)).toBe(true)
    const sql = readFileSync(migrationPath, 'utf8')
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS mission_conversation_id UUID')
    expect(sql).toContain('REFERENCES public.action_mission_conversations(id) ON DELETE SET NULL')
    expect(sql).toContain('idx_agent_execution_runs_mission_conversation')
  })
})
