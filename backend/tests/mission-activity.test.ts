import { describe, expect, it } from 'vitest'
import { listMissionActivity } from '../src/modules/action-engine/mission-activity.js'
import type { Queryable } from '../src/modules/action-engine/repository.js'

const organizationId = '00000000-0000-4000-8000-000000000001'
const missionId = '00000000-0000-4000-8000-000000000002'

describe('Mission activity projection', () => {
  it('projects existing ledgers into a stable owner-safe chronology', async () => {
    const activity = await listMissionActivity(pool(), { organizationId, missionId, includeTechnicalEvidence: false })
    expect(activity.map(item => item.title)).toEqual([
      'Missão criada',
      'Pedido confirmado',
      'Plano em preparação',
      'Decisão necessária sobre o plano 1',
      'Plano 1 aprovado',
      'Funil criado',
      'Nova tentativa programada',
      'Missão pausada',
      'Missão concluída',
    ])
    expect(activity.every(item => item.technicalEvidence === undefined)).toBe(true)
    expect(activity.find(item => item.kind === 'artifact')?.artifact).toEqual(expect.objectContaining({ kind: 'funnel', entityId: '00000000-0000-4000-8000-000000000040' }))
    expect(activity.find(item => item.id.startsWith('run:run-retry'))?.description).not.toContain('provider_secret')
  })

  it('includes traceable record references only for internal operators', async () => {
    const activity = await listMissionActivity(pool(), { organizationId, missionId, includeTechnicalEvidence: true })
    expect(activity.find(item => item.id === 'event:event-created')?.technicalEvidence).toEqual(expect.objectContaining({ source: 'domain_event', eventType: 'mission.created' }))
    expect(activity.find(item => item.kind === 'artifact')?.technicalEvidence).toEqual(expect.objectContaining({ capabilityKey: 'crm.funnel.create_draft' }))
  })

  it('rejects a mission outside the requested tenant before reading its ledgers', async () => {
    const queries: string[] = []
    const client: Queryable = { async query<T>(sql: string) { queries.push(sql); return { rows: [] as T[] } } }
    await expect(listMissionActivity(client, { organizationId, missionId })).rejects.toThrow('mission_not_found')
    expect(queries).toHaveLength(1)
  })
})

function pool(): Queryable {
  return {
    async query<T>(sql: string) {
      if (sql.includes('FROM public.action_missions')) return { rows: [{ id: missionId }] as T[] }
      if (sql.includes('FROM public.domain_events')) return { rows: [
        { id: 'event-created', event_type: 'mission.created', payload: {}, occurred_at: '2026-08-31T12:00:00.000Z' },
        { id: 'event-confirmed', event_type: 'mission.conversation_brief_confirmed', payload: {}, occurred_at: '2026-08-31T12:01:00.000Z' },
        { id: 'event-planning', event_type: 'mission.status_changed', payload: { toStatus: 'planning' }, occurred_at: '2026-08-31T12:02:00.000Z' },
        { id: 'event-paused', event_type: 'mission.paused', payload: {}, occurred_at: '2026-08-31T12:08:00.000Z' },
        { id: 'event-complete', event_type: 'mission.status_changed', payload: { toStatus: 'succeeded' }, occurred_at: '2026-08-31T12:09:00.000Z' },
      ] as T[] }
      if (sql.includes('FROM public.action_plans')) return { rows: [{ id: 'plan-1', revision: 1, status: 'pending_approval', created_at: '2026-08-31T12:03:00.000Z', updated_at: '2026-08-31T12:03:00.000Z' }] as T[] }
      if (sql.includes('FROM public.action_approvals')) return { rows: [
        { id: 'approval-approved', plan_id: 'plan-1', approval_type: 'plan', status: 'approved', decision_reason: 'Aprovado', created_at: '2026-08-31T12:03:00.000Z', updated_at: '2026-08-31T12:04:00.000Z', revision: 1 },
      ] as T[] }
      if (sql.includes('FROM public.action_runs')) return { rows: [
        { id: 'run-artifact', status: 'succeeded', output: { entityId: '00000000-0000-4000-8000-000000000040', versionId: '00000000-0000-4000-8000-000000000041', status: 'draft' }, last_error: null, created_at: '2026-08-31T12:04:30.000Z', updated_at: '2026-08-31T12:05:00.000Z', completed_at: '2026-08-31T12:05:00.000Z', step_key: 'pack.draft_funnel', capability_key: 'crm.funnel.create_draft' },
        { id: 'run-retry', status: 'retry_scheduled', output: {}, last_error: 'provider_secret=do-not-expose', created_at: '2026-08-31T12:05:30.000Z', updated_at: '2026-08-31T12:06:00.000Z', completed_at: null, step_key: 'pack.publish_funnel', capability_key: 'crm.funnel.publish' },
      ] as T[] }
      throw new Error(`unexpected_query:${sql}`)
    },
  }
}
