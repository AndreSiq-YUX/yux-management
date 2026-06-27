import { describe, expect, it } from 'vitest'
import { processSequenceExecution } from '../src/modules/crm/scheduler.js'

const ids = {
  execution: '00000000-0000-4000-8000-000000000001',
  org: '00000000-0000-4000-8000-000000000002',
  lead: '00000000-0000-4000-8000-000000000003',
  enrollment: '00000000-0000-4000-8000-000000000004',
  step: '00000000-0000-4000-8000-000000000005',
  sequence: '00000000-0000-4000-8000-000000000006',
  nextStep: '00000000-0000-4000-8000-000000000007',
}

class FakeClient {
  queries: Array<{ sql: string; values?: unknown[] }> = []

  async query(sql: string, values?: unknown[]) {
    this.queries.push({ sql, values })
    if (sql.includes('FROM public.automation_executions x')) {
      return {
        rows: [{
          id: ids.execution,
          organization_id: ids.org,
          lead_id: ids.lead,
          enrollment_id: ids.enrollment,
          step_id: ids.step,
          action_type: 'internal_task',
          payload: { subject: 'Ligar para o lead', body: 'Confirmar disponibilidade' },
          status: 'pending',
          attempt_count: 0,
          lead_name: 'Lead Teste',
          lead_email: 'lead@yux.com.br',
          lead_phone: null,
        }],
      }
    }
    if (sql.includes('WHERE id = $1') && sql.includes('FROM public.crm_sequence_steps')) {
      return {
        rows: [{
          id: ids.step,
          sequence_id: ids.sequence,
          action_type: 'internal_task',
          delay_minutes: 0,
          subject: 'Ligar',
          body: 'Tarefa',
          order_index: 0,
          is_active: true,
        }],
      }
    }
    if (sql.includes('WHERE sequence_id = $1') && sql.includes('order_index > $2')) {
      return {
        rows: [{
          id: ids.nextStep,
          sequence_id: ids.sequence,
          action_type: 'email',
          delay_minutes: 15,
          subject: 'Proxima mensagem',
          body: 'Enviar proposta',
          order_index: 1,
          is_active: true,
        }],
      }
    }
    return { rows: [], rowCount: 0 }
  }

  release() {
    return undefined
  }
}

class FakePool {
  client = new FakeClient()
  failedQueries: Array<{ sql: string; values?: unknown[] }> = []

  async connect() {
    return this.client
  }

  async query(sql: string, values?: unknown[]) {
    this.failedQueries.push({ sql, values })
    return { rows: [], rowCount: 0 }
  }
}

describe('crm sequence scheduler', () => {
  it('creates an internal lead task and schedules the next sequence step', async () => {
    const pool = new FakePool()
    const now = new Date('2026-06-27T12:00:00.000Z')

    await processSequenceExecution(pool as never, ids.execution, { now })

    const sqlStatements = pool.client.queries.map((query) => query.sql)
    expect(sqlStatements).toContain('BEGIN')
    expect(sqlStatements).toContain('COMMIT')
    const leadTaskInsert = pool.client.queries.find((query) => query.sql.includes('INSERT INTO public.lead_tasks'))
    expect(leadTaskInsert?.sql).toContain('organization_id, lead_id, title, description, due_at, metadata')
    expect(leadTaskInsert?.values).toEqual([
      ids.org,
      ids.lead,
      'Ligar para o lead',
      'Confirmar disponibilidade',
      now.toISOString(),
      { source: 'crm_sequence_scheduler', executionId: ids.execution, enrollmentId: ids.enrollment },
    ])
    const nextExecutionInsert = pool.client.queries.find((query) => query.sql.includes('INSERT INTO public.automation_executions'))
    expect(nextExecutionInsert?.values).toEqual([
      ids.org,
      ids.lead,
      ids.enrollment,
      ids.nextStep,
      'email',
      { subject: 'Proxima mensagem', body: 'Enviar proposta' },
      '2026-06-27T12:15:00.000Z',
    ])
    expect(pool.failedQueries).toEqual([])
  })
})
