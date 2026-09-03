import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const dirname = path.dirname(fileURLToPath(import.meta.url))
const migrationPath = path.resolve(dirname, '../src/db/migrations/0149_unlimited_ai_credit_wallets.sql')

describe('Unlimited AI credit wallets schema', () => {
  it('adds an explicit opt-in policy that defaults to bounded credits', () => {
    expect(existsSync(migrationPath)).toBe(true)
    const sql = readFileSync(migrationPath, 'utf8')
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS is_unlimited BOOLEAN NOT NULL DEFAULT FALSE')
    expect(sql).toContain('usage is metered in the ledger and monthly_used')
  })
})
