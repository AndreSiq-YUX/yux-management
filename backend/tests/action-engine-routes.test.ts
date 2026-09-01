import type { FastifyInstance } from 'fastify'
import { afterEach, describe, expect, it } from 'vitest'
import type { AuthStore, AuthUser } from '../src/auth/routes.js'
import { hashSessionToken } from '../src/auth/session.js'
import type { AppJobQueue } from '../src/server.js'
import { buildServer } from '../src/server.js'

const env = {
  NODE_ENV: 'test' as const, PORT: 4000, DATABASE_URL: 'postgresql://localhost/test', REDIS_URL: 'redis://localhost:6379',
  SESSION_COOKIE_NAME: 'yux_session', SESSION_SECRET: 'test-secret-value-with-at-least-32-chars', CORS_ORIGIN: 'http://localhost:3000',
  MISSION_CONVERSATIONS_ENABLED: true, MISSION_CONVERSATIONS_MAX_TURNS: 6, MISSION_CONVERSATIONS_POLL_MAX_SECONDS: 5,
}
const orgA = '00000000-0000-4000-8000-000000000001'
const orgB = '00000000-0000-4000-8000-000000000002'
const missionId = '00000000-0000-4000-8000-000000000003'
const conversationId = '00000000-0000-4000-8000-000000000030'

class Store implements AuthStore {
  hash = ''
  user: AuthUser | null = null
  async findActiveUserByEmail() { return null }
  async createSession() { return undefined }
  async deleteSession() { return undefined }
  async findUserBySession(hash: string) { return hash === this.hash ? this.user : null }
}

class Pool {
  async query<T>(sql: string) {
    if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] as T[] }
    if (sql.includes('FROM public.memberships') && sql.includes('SELECT organization_id')) return { rows: [{ organization_id: orgA }] as T[] }
    if (sql.includes('SELECT DISTINCT cm.module_key')) return { rows: [{ module_key: 'action_engine' }] as T[] }
    if (sql.includes('INSERT INTO public.action_mission_conversations')) return { rows: [{
      id: conversationId, organization_id: orgA, contract_id: null, mission_id: null,
      status: 'collecting_context', title: 'Quero uma campanha', current_brief: {}, context_readiness: {},
      last_context_hash: null, last_harness_run_id: null, version: 1,
      created_by: '00000000-0000-4000-8000-000000000010', created_at: new Date(), updated_at: new Date(), completed_at: null,
    }] as T[] }
    if (sql.includes('INSERT INTO public.action_mission_conversation_messages')) return { rows: [{
      id: '00000000-0000-4000-8000-000000000031', organization_id: orgA, conversation_id: conversationId,
      sequence: 1, actor_type: 'user', message_kind: 'text', content: 'Quero uma campanha',
      structured_payload: {}, source_refs: [], client_message_id: 'client-message-1', harness_run_id: null,
      created_by: '00000000-0000-4000-8000-000000000010', created_at: new Date(),
    }] as T[] }
    if (sql.includes("definition->'metricSpec'")) return { rows: [{ metric_spec: {}, content_hash: 'a'.repeat(64) }] as T[] }
    if (sql.includes('FROM public.action_missions') && sql.includes('FOR UPDATE')) {
      return { rows: [{
        id: missionId, organization_id: orgA, contract_id: null,
        pack_version_id: '00000000-0000-4000-8000-000000000004', status: 'active', mode: 'assisted',
        title: 'Missão', objective: 'Objetivo', parameters: {}, budget: {}, deadline_at: null,
        active_plan_id: null, version: 2, created_by: 'user-1', created_at: new Date(), updated_at: new Date(),
      }] as T[] }
    }
    if (sql.includes('FROM public.action_missions') && sql.includes('LIMIT 1')) {
      return { rows: [{
        id: missionId, organization_id: orgA, contract_id: null,
        pack_version_id: '00000000-0000-4000-8000-000000000004', status: 'draft', mode: 'assisted',
        title: 'Missão legada', objective: 'Recuperar receita', goal: {}, autonomy_envelope: {}, pack_selection: {},
        parameters: {}, budget: { maxTotalCostBrl: '1000', maxHumanHours: '10' }, deadline_at: null,
        active_plan_id: null, version: 1, created_by: 'user-1', created_at: new Date(), updated_at: new Date(),
      }] as T[] }
    }
    throw new Error(`Unexpected SQL: ${sql}`)
  }
  async connect() { return { query: this.query.bind(this), release() {} } }
  async end() { return undefined }
}

const queue: AppJobQueue = { async add() { return {} }, async close() {} }
let app: FastifyInstance | undefined
afterEach(async () => { await app?.close(); app = undefined })

function auth(role: AuthUser['role']) {
  const token = `token-${role}`
  const store = new Store()
  store.hash = hashSessionToken(token)
  store.user = { id: '00000000-0000-4000-8000-000000000010', email: `${role}@example.com`, name: role, role }
  return { store, headers: { cookie: `${env.SESSION_COOKIE_NAME}=${token}` } }
}

describe('Action Engine routes', () => {
  it('accepts a Mission conversation, persists the first message and queues processing', async () => {
    const session = auth('yux_admin')
    const added: Array<{ name: string; data: Record<string, unknown>; options?: { jobId?: string } }> = []
    const conversationQueue: AppJobQueue = {
      async add(name, data, options) { added.push({ name, data, options }); return { id: options?.jobId } },
      async close() {},
    }
    app = await buildServer(env, { authStore: session.store, pool: new Pool() as never, jobQueue: conversationQueue })
    const response = await app.inject({
      method: 'POST', url: '/api/action-engine/mission-conversations', headers: {
        ...session.headers, 'idempotency-key': 'conversation-create-1',
      },
      payload: { organizationId: orgA, message: 'Quero uma campanha', clientMessageId: 'client-message-1' },
    })
    expect(response.statusCode).toBe(202)
    expect(response.json().conversation.id).toBe(conversationId)
    expect(added).toHaveLength(1)
    expect(added[0]).toMatchObject({
      name: 'action-engine.processMissionConversation',
      data: { conversationId, organizationId: orgA, requestedVersion: 1, audience: 'internal_operator' },
    })
  })

  it('requires authentication for the capability catalog', async () => {
    app = await buildServer(env, { authStore: new Store(), pool: new Pool() as never, jobQueue: queue })
    const response = await app.inject({ method: 'GET', url: '/api/action-engine/capabilities' })
    expect(response.statusCode).toBe(401)
  })

  it('returns only serializable capability metadata to an admin', async () => {
    const session = auth('yux_admin')
    app = await buildServer(env, { authStore: session.store, pool: new Pool() as never, jobQueue: queue })
    const response = await app.inject({ method: 'GET', url: '/api/action-engine/capabilities', headers: session.headers })
    expect(response.statusCode).toBe(200)
    expect(response.json().some((item: { key: string }) => item.key === 'crm.recovery_candidates.search')).toBe(true)
    expect(response.json().every((item: Record<string, unknown>) => !Object.prototype.hasOwnProperty.call(item, 'execute'))).toBe(true)
  })

  it('maps legacy missions to safe generic goal and autonomy defaults', async () => {
    const session = auth('yux_admin')
    app = await buildServer(env, { authStore: session.store, pool: new Pool() as never, jobQueue: queue })
    const response = await app.inject({ method: 'GET', url: `/api/action-engine/missions/${missionId}?organizationId=${orgA}`, headers: session.headers })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      goal: { statement: 'Recuperar receita', requestedOutcome: 'recovered_revenue' },
      autonomyEnvelope: { mode: 'assisted', maxTotalCostBrl: '1000', maxHumanHours: '10' },
      packSelection: {},
    })
  })

  it('denies lifecycle writes to client users and cross-organization reads', async () => {
    const session = auth('client_admin')
    app = await buildServer(env, { authStore: session.store, pool: new Pool() as never, jobQueue: queue })
    const [write, read] = await Promise.all([
      app.inject({ method: 'POST', url: `/api/action-engine/missions/${missionId}/pause`, headers: session.headers, payload: { organizationId: orgA, expectedVersion: 2, reason: 'Pausa solicitada' } }),
      app.inject({ method: 'GET', url: `/api/action-engine/missions/${missionId}?organizationId=${orgB}`, headers: session.headers }),
    ])
    expect(write.statusCode).toBe(403)
    expect(read.statusCode).toBe(403)
  })

  it('denies autonomy grant and kill-switch mutations without policy permission', async () => {
    const session = auth('client_admin')
    app = await buildServer(env, { authStore: session.store, pool: new Pool() as never, jobQueue: queue })
    const [grant, killSwitch] = await Promise.all([
      app.inject({ method: 'POST', url: `/api/action-engine/missions/${missionId}/autonomy-grants`, headers: session.headers, payload: {
        organizationId: orgA, expectedMissionVersion: 2,
        envelope: { mode: 'autonomous', allowedModules: ['crm'], allowedCapabilityKeys: ['crm.pipeline.draft'], maxTotalCostBrl: '100', maxHumanHours: '2', maxExternalContacts: 10, expiresAt: '2030-01-01T00:00:00.000Z', alwaysRequireApprovalFor: [] },
      } }),
      app.inject({ method: 'POST', url: `/api/action-engine/missions/${missionId}/capability-controls`, headers: session.headers, payload: {
        organizationId: orgA, capabilityKey: 'crm.pipeline.draft', capabilityVersion: 1, disabled: true, reason: 'Contenção preventiva',
      } }),
    ])
    expect(grant.statusCode).toBe(403)
    expect(killSwitch.statusCode).toBe(403)
  })

  it('requires an idempotency key on mission creation', async () => {
    const session = auth('yux_admin')
    app = await buildServer(env, { authStore: session.store, pool: new Pool() as never, jobQueue: queue })
    const response = await app.inject({
      method: 'POST', url: '/api/action-engine/missions', headers: session.headers,
      payload: { organizationId: orgA, title: 'Recuperar receita', objective: 'Recuperar R$ 10 mil', deadlineAt: '2026-09-30T12:00:00.000Z', parameters: { targetRevenueBrl: '10000', maxTotalCostBrl: '1000', maxHumanHours: '10', humanHourlyRateBrl: '100' } },
    })
    expect(response.statusCode).toBe(400)
    expect(response.json()).toEqual({ error: 'idempotency_key_required' })
  })

  it('keeps direct provider channels disabled in the first pilot', async () => {
    const session = auth('yux_admin')
    app = await buildServer(env, { authStore: session.store, pool: new Pool() as never, jobQueue: queue })
    const response = await app.inject({
      method: 'POST', url: '/api/action-engine/missions', headers: { ...session.headers, 'idempotency-key': 'pilot-external-channel' },
      payload: {
        organizationId: orgA, title: 'Recuperar receita', objective: 'Recuperar R$ 10 mil', deadlineAt: '2026-09-30T12:00:00.000Z',
        parameters: { targetRevenueBrl: '10000', maxTotalCostBrl: '1000', maxHumanHours: '10', humanHourlyRateBrl: '100', channels: ['email'] },
      },
    })
    expect(response.statusCode).toBe(400)
    expect(response.json()).toEqual({ error: 'mission_channel_not_enabled_for_pilot' })
  })

  it('returns a stable optimistic concurrency error', async () => {
    const session = auth('yux_operator')
    app = await buildServer(env, { authStore: session.store, pool: new Pool() as never, jobQueue: queue })
    const response = await app.inject({ method: 'POST', url: `/api/action-engine/missions/${missionId}/pause`, headers: session.headers, payload: { organizationId: orgA, expectedVersion: 1, reason: 'Pausa operacional' } })
    expect(response.statusCode).toBe(409)
    expect(response.json()).toEqual({ error: 'mission_version_conflict' })
  })
})
