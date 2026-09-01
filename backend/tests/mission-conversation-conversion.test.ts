import { describe, expect, it } from 'vitest'
import { confirmMissionConversationBrief } from '../src/modules/action-engine/mission-conversations.js'
import { hashCanonical, type Connectable, type Queryable } from '../src/modules/action-engine/repository.js'
import { FUNNEL_NURTURE_PACK_V1 } from '../src/modules/action-engine/packs/funnel-nurture-v1.js'

type Row = Record<string, unknown>
type Step = { match: string; rows: Row[] }
const now = '2026-08-31T12:00:00.000Z'
const orgId = '00000000-0000-4000-8000-000000000001'
const conversationId = '00000000-0000-4000-8000-000000000010'
const contractId = '00000000-0000-4000-8000-000000000020'
const missionId = '00000000-0000-4000-8000-000000000030'
const userId = '00000000-0000-4000-8000-000000000040'
const packVersionId = '00000000-0000-4000-8000-000000000050'
const brief = {
  title: 'Funil para PMEs', objective: 'Criar um funil e nutrir oportunidades de pequenas empresas.',
  requestedOutcome: 'qualified_lead', scopeHints: ['crm', 'automations'], packKeys: ['funnel_nurture'],
  constraints: { icp: 'Pequenas empresas de Londrina', offer: 'Consultoria de automação', targetRevenueBrl: '10000' },
  deadlineAt: '2026-09-30T23:59:59.000Z', maxTotalCostBrl: '800', maxHumanHours: '6', mode: 'assisted',
  acceptanceCriteria: [],
}

function conversationRow(change: Row = {}) { return { id: conversationId, organization_id: orgId, contract_id: contractId, mission_id: null, status: 'brief_confirmation', title: 'Funil para PMEs', current_brief: brief, context_readiness: { status: 'ready_for_brief_confirmation' }, last_context_hash: 'c'.repeat(64), last_harness_run_id: 'run-1', version: 3, created_by: userId, created_at: now, updated_at: now, completed_at: null, ...change } }
function missionRow(change: Row = {}) { return { id: missionId, organization_id: orgId, contract_id: contractId, pack_version_id: packVersionId, status: 'draft', mode: 'assisted', title: 'Funil para PMEs', objective: brief.objective, goal: { statement: brief.objective, requestedOutcome: brief.requestedOutcome, scopeHints: brief.scopeHints, constraints: brief.constraints, acceptanceCriteria: [] }, autonomy_envelope: { mode: 'assisted', allowedModules: ['automations', 'crm', 'funnel_nurture_agent'], allowedCapabilityKeys: [], maxTotalCostBrl: '800', maxHumanHours: '6', expiresAt: brief.deadlineAt, alwaysRequireApprovalFor: ['external', 'irreversible', 'destructive'] }, pack_selection: {}, parameters: {}, budget: {}, deadline_at: brief.deadlineAt, active_plan_id: null, version: 1, created_by: userId, created_at: now, updated_at: now, ...change } }
function messageRow() { return { id: '00000000-0000-4000-8000-000000000060', organization_id: orgId, conversation_id: conversationId, sequence: 1, actor_type: 'user', message_kind: 'text', content: 'Quero um funil', structured_payload: {}, source_refs: [], client_message_id: 'client-1', harness_run_id: null, created_by: userId, created_at: now } }
function eventRow(type: string) { return { id: '00000000-0000-4000-8000-000000000070', organization_id: orgId, crm_instance_id: null, event_type: type, schema_version: 1, aggregate_type: 'mission', aggregate_id: missionId, lead_id: null, correlation_id: '00000000-0000-4000-8000-000000000080', causation_id: null, depth: 0, actor: { type: 'user', id: userId }, occurred_at: now, automation_trace: {}, payload: {}, dispatch_status: 'pending', attempt_count: 0, available_at: now, dispatched_at: null, last_error: null, created_at: now } }

function scriptedPool(steps: Step[]) {
  const calls: Array<{ sql: string; params?: unknown[] }> = []
  const client: Queryable & { release(): void } = { async query<T = Row>(sql: string, params?: unknown[]) { calls.push({ sql, params }); if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(sql)) return { rows: [] as T[] }; const step = steps.shift(); if (!step) throw new Error(`unexpected query: ${sql}`); expect(sql).toContain(step.match); return { rows: step.rows as T[] } }, release() {} }
  const pool: Connectable = { ...client, async connect() { return client } }
  return { pool, calls, steps }
}

describe('Mission conversation conversion', () => {
  it('pins the confirmed brief and creates exactly one planning Mission in the same transaction', async () => {
    const planningMission = missionRow({ status: 'planning', version: 2 })
    const fake = scriptedPool([
      { match: 'FOR UPDATE', rows: [conversationRow()] },
      { match: 'FROM public.action_pack_versions', rows: [{ id: packVersionId, key: 'funnel_nurture', semantic_version: FUNNEL_NURTURE_PACK_V1.semanticVersion, content_hash: FUNNEL_NURTURE_PACK_V1.contentHash }] },
      { match: 'FROM public.organizations organization', rows: [{ kind: 'yux', module_keys: [] }] },
      { match: 'INSERT INTO public.action_missions', rows: [missionRow()] },
      { match: 'INSERT INTO public.domain_events', rows: [eventRow('mission.created')] },
      { match: 'FROM public.action_missions', rows: [missionRow()] },
      { match: 'UPDATE public.action_missions', rows: [planningMission] },
      { match: 'INSERT INTO public.domain_events', rows: [eventRow('mission.status_changed')] },
      { match: 'UPDATE public.action_mission_conversations', rows: [conversationRow({ mission_id: missionId, status: 'planning', version: 4 })] },
      { match: 'INSERT INTO public.domain_events', rows: [eventRow('mission.conversation_brief_confirmed')] },
      { match: 'WHERE id = $1 AND organization_id = $2', rows: [conversationRow({ mission_id: missionId, status: 'planning', version: 4 })] },
      { match: 'ORDER BY sequence ASC', rows: [messageRow()] },
    ])
    const result = await confirmMissionConversationBrief(fake.pool, { organizationId: orgId, conversationId, expectedVersion: 3, briefHash: hashCanonical(brief), confirmedBy: userId })
    expect(result.mission.status).toBe('planning')
    expect(result.conversation.missionId).toBe(missionId)
    const insert = fake.calls.find(call => call.sql.includes('INSERT INTO public.action_missions'))
    expect(insert?.params?.[4]).toBe(brief.objective)
    expect(insert?.params?.[6]).toEqual(expect.objectContaining({ constraints: brief.constraints }))
    expect(insert?.params?.[7]).toEqual(expect.objectContaining({ maxTotalCostBrl: '800', maxHumanHours: '6' }))
    expect(insert?.params?.[13]).toBe(`mission-conversation:${conversationId}:${hashCanonical(brief)}`)
    expect(fake.steps).toHaveLength(0)
  })

  it('returns the already attached Mission for a concurrent confirmation retry', async () => {
    const attached = conversationRow({ mission_id: missionId, status: 'planning', version: 4 })
    const fake = scriptedPool([
      { match: 'FOR UPDATE', rows: [attached] },
      { match: 'FROM public.action_missions', rows: [missionRow({ status: 'planning', version: 2 })] },
      { match: 'WHERE id = $1 AND organization_id = $2', rows: [attached] },
      { match: 'ORDER BY sequence ASC', rows: [messageRow()] },
    ])
    const result = await confirmMissionConversationBrief(fake.pool, { organizationId: orgId, conversationId, expectedVersion: 3, briefHash: hashCanonical(brief), confirmedBy: userId })
    expect(result.mission.id).toBe(missionId)
    expect(fake.calls.some(call => call.sql.includes('INSERT INTO public.action_missions'))).toBe(false)
  })

  it('rejects a stale or forged brief hash before creating anything', async () => {
    const fake = scriptedPool([{ match: 'FOR UPDATE', rows: [conversationRow()] }])
    await expect(confirmMissionConversationBrief(fake.pool, { organizationId: orgId, conversationId, expectedVersion: 3, briefHash: '0'.repeat(64), confirmedBy: userId })).rejects.toThrow('mission_conversation_brief_changed')
    expect(fake.calls.some(call => call.sql.includes('INSERT INTO public.action_missions'))).toBe(false)
  })
})
