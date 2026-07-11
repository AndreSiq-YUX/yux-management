import { describe, expect, it } from 'vitest'
import { purgeExpiredTraces } from '../src/jobs/handlers/maintenance.js'

describe('trace retention maintenance', () => {
  it('purges runs, dependent trace tables, raw events and messages using each organization retention setting', async () => {
    const queries: string[] = []
    const pool = {
      query: async (sql: string) => {
        queries.push(sql)
        return { rowCount: queries.length, rows: [] }
      },
    }

    const result = await purgeExpiredTraces(pool as never)

    expect(result).toEqual({
      agent_execution_steps: 1,
      agent_context_snapshots: 2,
      agent_verification_results: 3,
      strategy_subagent_runs: 4,
      tracesPurged: 5,
      eventsPurged: 6,
      messagesPurged: 7,
    })
    expect(queries[0]).toContain('agent_execution_steps')
    expect(queries[1]).toContain('agent_context_snapshots')
    expect(queries[2]).toContain('agent_verification_results')
    expect(queries[3]).toContain('strategy_subagent_runs')
    expect(queries[4]).toContain('agent_execution_runs')
    expect(queries[5]).toContain('agent_events')
    expect(queries[6]).toContain('public.messages')
    for (const sql of queries) expect(sql).toContain('retention_months')
  })
})
