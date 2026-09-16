import type { FastifyInstance } from 'fastify'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AuthStore, AuthUser } from '../src/auth/routes.js'
import { buildServer } from '../src/server.js'

const env = { NODE_ENV: 'test' as const, PORT: 4000, DATABASE_URL: 'postgresql://unused/test', REDIS_URL: 'redis://localhost:6379',
  SESSION_COOKIE_NAME: 'yux_session', SESSION_SECRET: 'test-secret-value-with-at-least-32-chars', CORS_ORIGIN: 'http://localhost:3000' }
let app: FastifyInstance | undefined
afterEach(async () => { await app?.close(); app = undefined; vi.unstubAllGlobals() })
async function setup(role: AuthUser['role'] = 'yux_admin', options: { runtime?: boolean; rows?: Record<string, unknown>[] } = {}) {
  const authStore: AuthStore = { async findActiveUserByEmail() { return null }, async createSession() {}, async deleteSession() {},
    async findUserBySession() { return { id: 'user-1', email: 'test@example.com', name: 'Test', role } } }
  const pool = { async query(sql: string) { return { rows: sql.includes('FROM public.model_routing_rules') ? options.rows || [] : [] } }, async end() {} }
  app = await buildServer({ ...env, ...(options.runtime ? { YUX_AGENT_RUNTIME_URL: 'http://runtime.test', YUX_AGENT_RUNTIME_TOKEN: 'mock-runtime-token' } : {}) }, { authStore, pool: pool as never })
  return app
}
const payload = { agentType: 'support_assistant', provider: 'openrouter', modelName: 'main:free' }
describe('Admin-only central routing API', () => {
  it('forbids operators from changing models and reading central credentials/configuration', async () => {
    const server = await setup('yux_operator')
    for (const url of ['/api/platform/admin/llm-routes', '/api/platform/admin/llm-use-cases', '/api/platform/admin/llm-configuration']) {
      expect((await server.inject({ method: 'GET', url, cookies: { yux_session: 'token' } })).statusCode).toBe(403)
    }
    expect((await server.inject({ method: 'POST', url: '/api/platform/admin/llm-routes', cookies: { yux_session: 'token' }, payload })).statusCode).toBe(403)
  })
  it('does not allow legacy generic endpoints to bypass Admin model authorization', async () => {
    const server = await setup('yux_operator')
    for (const url of ['/api/strategy-engine/query', '/api/marketing-studio/query']) {
      const response = await server.inject({ method: 'POST', url, cookies: { yux_session: 'token' },
        payload: { table: 'model_routing_rules', operation: 'delete', filters: [{ op: 'eq', column: 'id', value: '00000000-0000-4000-8000-000000000001' }] } })
      expect(response.statusCode).toBe(403)
    }
  })
  it('returns a complete catalogue and explicit legacy availability without invoking a provider', async () => {
    const server = await setup()
    const response = await server.inject({ method: 'GET', url: '/api/platform/admin/llm-configuration', cookies: { yux_session: 'token' } })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({ routes: [], legacyStatus: 'unavailable' })
    expect(response.json().useCases.map((item: { key: string }) => item.key)).toContain('support_assistant')
  })
  it('rejects empty names, malformed fallbacks and scoped global routes', async () => {
    const server = await setup()
    for (const invalid of [{ ...payload, modelName: '  ' }, { ...payload, fallbackRoutes: [{ provider: 'other', modelName: 'model' }] },
      { ...payload, agentType: 'global_llm', routingTier: 'premium' }, { ...payload, agentType: null }]) {
      expect((await server.inject({ method: 'POST', url: '/api/platform/admin/llm-routes', cookies: { yux_session: 'token' }, payload: invalid })).statusCode).toBe(400)
    }
  })
  it('shows legacy models but never overwrites a configured paused route with environment defaults', async () => {
    const fetch = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify({ routes: [
      { ...payload, agentType: 'global_llm', modelName: 'environment:free' },
      { ...payload, agentType: 'knowledge_curator', modelName: 'curator:free' },
    ] }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetch)
    const server = await setup('yux_admin', { runtime: true, rows: [{ id: 'route-global', agent_type: 'global_llm', routing_tier: 'default', provider: 'openrouter', model_name: 'selected:free', status: 'paused', fallback_routes: [] }] })
    const response = await server.inject({ method: 'GET', url: '/api/platform/admin/llm-configuration', cookies: { yux_session: 'token' } })
    expect(response.statusCode).toBe(200)
    expect(response.json().legacyStatus).toBe('available')
    expect(response.json().routes.filter((route: { agentType: string }) => route.agentType === 'global_llm')).toEqual([expect.objectContaining({ modelName: 'selected:free', status: 'paused', origin: 'database' })])
    expect(response.json().routes).toContainEqual(expect.objectContaining({ agentType: 'knowledge_curator', modelName: 'curator:free', origin: 'environment' }))
    expect(fetch.mock.calls[0][0]).toBe('http://runtime.test/configuration/llm-routes')
  })
})
