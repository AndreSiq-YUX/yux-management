import { describe, expect, it } from 'vitest'
import { purgeExpiredTraces } from '../src/jobs/handlers/maintenance.js'

describe('trace retention maintenance', () => {
  it('purges runtime traces and messages using each organization retention setting', async () => {
    const queries: string[] = []
    const pool = {
      query: async (sql: string) => {
        queries.push(sql)
        return { rowCount: queries.length === 1 ? 3 : 7, rows: [] }
      },
    }
    await expect(purgeExpiredTraces(pool as never)).resolves.toEqual({ tracesPurged: 3, messagesPurged: 7 })
    expect(queries[0]).toContain('agent_execution_runs')
    expect(queries[0]).toContain('retention_months')
    expect(queries[1]).toContain('public.messages')
  })
})
