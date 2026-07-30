import { describe, expect, it } from 'vitest'
import { handleAutomationDispatch } from '../src/jobs/handlers/automation.js'

const env = {
  NODE_ENV: 'test' as const,
  PORT: 4000,
  DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/yux_test',
  REDIS_URL: 'redis://localhost:6379',
  SESSION_COOKIE_NAME: 'yux_session',
  SESSION_SECRET: 'test-secret-value-with-at-least-32-chars',
  CORS_ORIGIN: 'http://localhost:3000',
}

const ids = {
  org: '00000000-0000-4000-8000-000000000001',
  flow: '00000000-0000-4000-8000-000000000002',
  lead: '00000000-0000-4000-8000-000000000003',
  action: '00000000-0000-4000-8000-000000000004',
  run: '00000000-0000-4000-8000-000000000005',
  step: '00000000-0000-4000-8000-000000000006',
  task: '00000000-0000-4000-8000-000000000007',
}

class FakePool {
  queries: string[] = []
  duplicateRunId?: string

  async query(sql: string) {
    this.queries.push(sql)
    if (sql.includes('FROM public.automation_flows f')) {
      return { rows: [{ id: ids.flow, organization_id: ids.org, daily_run_limit: 50, trigger_id: 'trigger-1', trigger_type: 'lead.created', trigger_config: {} }] }
    }
    if (sql.includes('FROM public.leads WHERE')) {
      return { rows: [{ id: ids.lead, organization_id: ids.org, name: 'Ana', email: 'ana@example.com', phone: null, company: null, source: 'Formulário', source_kind: 'landing_page', status: 'open', score: 0, owner_id: null, assigned_to: null, pipeline_id: null, stage_id: null }] }
    }
    if (sql.includes('FROM public.automation_conditions')) return { rows: [] }
    if (sql.includes('FROM public.automation_actions')) return { rows: [{ id: ids.action, action_type: 'create_task', order_index: 1, payload: { title: 'Responder lead novo' } }] }
    if (sql.includes("event_payload->>'eventId'")) return { rows: this.duplicateRunId ? [{ id: this.duplicateRunId, status: 'completed' }] : [] }
    if (sql.includes('automation_execution_runs') && sql.includes('COUNT')) return { rows: [{ count: 0 }] }
    if (sql.includes('INSERT INTO public.automation_execution_runs')) return { rows: [{ id: ids.run }] }
    if (sql.includes('INSERT INTO public.automation_execution_steps')) return { rows: [{ id: ids.step }] }
    if (sql.includes('INSERT INTO public.lead_tasks')) return { rows: [{ id: ids.task }] }
    return { rows: [] }
  }
}

describe('automation dispatch handler', () => {
  it('runs a published lead.created flow and creates its CRM task', async () => {
    const pool = new FakePool()
    const result = await handleAutomationDispatch(pool as unknown as Parameters<typeof handleAutomationDispatch>[0], env, {
      event: {
        type: 'lead.created',
        organizationId: ids.org,
        leadId: ids.lead,
        source: 'landing_page',
        payload: { sourceKind: 'landing_page' },
      },
    })

    expect(result.results).toEqual([{ flowId: ids.flow, runId: ids.run, status: 'completed' }])
    expect(pool.queries.some(query => query.includes('INSERT INTO public.lead_tasks'))).toBe(true)
    expect(pool.queries.some(query => query.includes("SET status = 'completed'"))).toBe(true)
  })

  it('does not repeat a completed flow for the same event id', async () => {
    const pool = new FakePool()
    pool.duplicateRunId = ids.run
    const result = await handleAutomationDispatch(pool as unknown as Parameters<typeof handleAutomationDispatch>[0], env, {
      event: {
        type: 'lead.created',
        eventId: 'form-1:submission-1',
        organizationId: ids.org,
        leadId: ids.lead,
      },
    })

    expect(result.results).toEqual([{ flowId: ids.flow, runId: ids.run, status: 'skipped', reason: 'duplicate_event' }])
    expect(pool.queries.some(query => query.includes('INSERT INTO public.lead_tasks'))).toBe(false)
  })
})
