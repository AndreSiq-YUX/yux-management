import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const dirname = path.dirname(fileURLToPath(import.meta.url))
const migrationPath = path.resolve(dirname, '../src/db/migrations/0171_runtime_ai_credit_reservation_grant.sql')

describe('Agent runtime AI credit reservation grant', () => {
  it('permits only the wallet columns changed by an atomic reservation', () => {
    expect(existsSync(migrationPath)).toBe(true)
    const sql = readFileSync(migrationPath, 'utf8')

    expect(sql).toContain('GRANT UPDATE (current_balance, monthly_used, updated_at)')
    expect(sql).toContain('ON TABLE public.ai_credit_wallets')
    expect(sql).toContain('TO yux_runtime')
    expect(sql).not.toMatch(/GRANT\s+UPDATE\s+ON\s+TABLE\s+public\.ai_credit_wallets/i)
  })
})
