import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const dirname = path.dirname(fileURLToPath(import.meta.url))
const migrationPath = path.resolve(dirname, '../src/db/migrations/0152_strategy_retrieval_embedding_status.sql')

describe('Strategy retrieval embedding status schema', () => {
  it('persists each status emitted by the existing retrieval service', () => {
    expect(existsSync(migrationPath)).toBe(true)
    const sql = readFileSync(migrationPath, 'utf8')
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS embedding_status TEXT NOT NULL')
    for (const status of ['available', 'provided', 'unavailable']) {
      expect(sql).toContain(`'${status}'`)
    }
  })
})
