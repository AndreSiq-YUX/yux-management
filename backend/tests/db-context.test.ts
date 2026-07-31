import { describe, expect, it } from 'vitest'
import { createContextAwarePool } from '../src/db/client.js'
import { runWithDatabaseRequestContext } from '../src/db/request-context.js'

class FakeClient {
  calls: Array<{ sql: string; values?: unknown[] }> = []
  async query(sql: string, values?: unknown[]) {
    this.calls.push({ sql, values })
    return { rows: [{ ok: 1 }], rowCount: 1 }
  }
  release() { return undefined }
}

class FakePool extends FakeClient {
  readonly client = new FakeClient()
  async connect() { return this.client }
  async end() { return undefined }
}

describe('context-aware PostgreSQL pool', () => {
  it('sets tenant context transactionally without reusing a shared pool session', async () => {
    const raw = new FakePool()
    const pool = createContextAwarePool(raw as never)

    await runWithDatabaseRequestContext(
      { role: 'client_admin', organizationIds: ['00000000-0000-4000-8000-000000000001'] },
      () => pool.query('SELECT * FROM public.leads'),
    )

    expect(raw.client.calls).toEqual([
      { sql: 'BEGIN', values: undefined },
      { sql: "SELECT set_config('app.current_role', $1, true)", values: ['client_admin'] },
      { sql: "SELECT set_config('app.current_orgs', $1, true)", values: ['{00000000-0000-4000-8000-000000000001}'] },
      { sql: 'SELECT * FROM public.leads', values: undefined },
      { sql: 'COMMIT', values: undefined },
    ])
  })

  it('sets the same context after BEGIN when a route uses a dedicated client', async () => {
    const raw = new FakePool()
    const pool = createContextAwarePool(raw as never)
    await runWithDatabaseRequestContext(
      { role: 'client_member', organizationIds: ['00000000-0000-4000-8000-000000000002'] },
      async () => {
        const client = await pool.connect()
        await client.query('BEGIN')
        await client.query('SELECT * FROM public.conversations')
        await client.query('COMMIT')
        client.release()
      },
    )
    expect(raw.client.calls.map(call => call.sql)).toEqual([
      'BEGIN',
      "SELECT set_config('app.current_role', $1, true)",
      "SELECT set_config('app.current_orgs', $1, true)",
      'SELECT * FROM public.conversations',
      'COMMIT',
    ])
  })
})
