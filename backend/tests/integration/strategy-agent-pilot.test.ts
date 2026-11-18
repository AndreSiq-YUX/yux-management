import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { loadEnv } from '../../src/config/env.js'
import { createContextAwarePool } from '../../src/db/client.js'
import { runWithDatabaseRequestContext } from '../../src/db/request-context.js'
import { handleStrategyAdminChat } from '../../src/jobs/handlers/strategy.js'
import { buildServer, type AppJobQueue } from '../../src/server.js'
import { fixtureIds, fixturePassword, fixtureUsers, seedIntegrationFixtures } from './support/fixtures.js'

const url = process.env.YUX_AGENT_PILOT_TEST_DATABASE_URL

describe.skipIf(!url)('admin strategist pilot with Postgres and simulated generation', () => {
  const organizationId = randomUUID()
  const leadId = randomUUID()
  const job = vi.fn()
  let admin: pg.Pool
  let worker: pg.Pool
  let apiPool: pg.Pool
  let app: Awaited<ReturnType<typeof buildServer>>
  let adminCookie: string
  let clientCookie: string
  let templateId: string
  let packageId: string
  let priceId: string
  let excludedTemplateId: string

  const call = (method: 'GET' | 'POST' | 'PUT', path: string, payload?: object, cookie = adminCookie) =>
    app.inject({ method, url: path, headers: { cookie }, ...(payload ? { payload } : {}) })

  beforeAll(async () => {
    const database = new URL(url!)
    if (!['localhost', '127.0.0.1'].includes(database.hostname) || database.pathname !== '/yux_agent_pilot_test') {
      throw new Error('Use the dedicated local database yux_agent_pilot_test')
    }
    admin = new pg.Pool({ connectionString: database.toString() })
    await seedIntegrationFixtures(admin)
    const service = (username: string) => {
      const target = new URL(database)
      target.username = username
      return new pg.Pool({ connectionString: target.toString() })
    }
    worker = createContextAwarePool(service('yux_worker'), 'worker')
    apiPool = createContextAwarePool(service('yux_api'))
    const env = loadEnv({
      NODE_ENV: 'test', SESSION_SECRET: 'strategy-qa-local-test-session-secret',
      DATABASE_URL: database.toString(), YUX_AGENT_RUNTIME_URL: 'http://127.0.0.1:4109',
      YUX_AGENT_RUNTIME_TOKEN: 'local-simulated-runtime', STRATEGY_PRESALES_PILOT_ORGANIZATION_IDS: organizationId,
    })
    const queued = { add: job.mockImplementation(async () => ({ id: randomUUID() })) } as unknown as AppJobQueue
    app = await buildServer(env, { pool: apiPool, jobQueue: queued })
    const login = async (email: string) => {
      const response = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email, password: fixturePassword } })
      expect(response.statusCode).toBe(200)
      return response.cookies.map(cookie => cookie.name + '=' + cookie.value).join('; ')
    }
    adminCookie = await login(fixtureUsers.yux_admin.email)
    clientCookie = await login(fixtureUsers.client_admin_A.email)
    packageId = (await admin.query("SELECT id FROM public.packages WHERE key = 'maquina_comercial'")).rows[0].id
    await admin.query("INSERT INTO public.organizations(id,name,slug,kind) VALUES ($1,'Subconta de captação de teste',$2,'client')",
      [organizationId, 'agent-qa-' + organizationId])
    await admin.query(
      "INSERT INTO public.leads(id,organization_id,name,email,stage,status) VALUES ($1,$2,'Prospect sintético','lead@simulated.test','NEW','open')",
      [leadId, organizationId],
    )
    templateId = (await admin.query(
      "INSERT INTO public.proposal_templates(organization_id,package_id,name,scope) VALUES ($1,$2,'Modelo de teste','Acompanhamento CRM') RETURNING id",
      [organizationId, packageId],
    )).rows[0].id
    priceId = (await admin.query(
      "INSERT INTO public.proposal_price_rules(organization_id,package_id,item_key,label,minimum_value,recommended_value,maximum_value) VALUES ($1,$2,'base','Pacote de teste',1000,1500,3000) RETURNING id",
      [organizationId, packageId],
    )).rows[0].id
    excludedTemplateId = (await admin.query(
      `INSERT INTO public.proposal_templates(organization_id,package_id,name,presales_sellable)
       SELECT $1,id,'Operação técnica',true FROM public.packages WHERE key='yux_internal_growth' RETURNING id`,
      [organizationId],
    )).rows[0].id
    await admin.query(
      `INSERT INTO public.proposal_price_rules(organization_id,package_id,item_key,label,minimum_value,recommended_value,maximum_value)
       SELECT $1,id,'base','Operação interna',0,0,0 FROM public.packages WHERE key='yux_internal_growth'`,
      [organizationId],
    )
  })

  afterEach(() => vi.unstubAllGlobals())
  afterAll(async () => {
    await app?.close()
    await apiPool?.end()
    await worker?.end()
    await admin?.query('DELETE FROM public.organizations WHERE id = $1', [organizationId])
    await admin?.end()
  })

  it('promotes by account, retains earlier budget and imports only current prices once', async () => {
    const base = '/api/strategy-engine/agent-prompts'
    const received: Array<Record<string, any>> = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toMatch(/^http:\/\/127\.0\.0\.1:4109\//)
      const body = JSON.parse(String(init.body))
      if (url.endsWith('/instructions/preview/strategist')) {
        return Response.json({ candidate: { requests: [{ fingerprint: 'a'.repeat(64) }] } })
      }
      received.push(body)
      return Response.json({ synthesis: {
        answer: 'Escopo de teste.',
        recommendation: { decision: 'recommend', rationale: 'Há demanda existente e falta acompanhamento.', packageId, itemKeys: ['base'] },
      } })
    }))
    expect((await call('GET', base, undefined, clientCookie)).statusCode).toBe(403)
    expect((await call('PUT', base + '/catalog', { organizationId, templateId, approved: true })).statusCode).toBe(200)
    expect((await call('PUT', base + '/catalog', { organizationId, templateId: excludedTemplateId, approved: true })).statusCode).toBe(409)
    const publication = { organizationId, expectedVersion: 0, operation: 'publish', instruction: 'Compare ofertas.',
      reason: 'Homologação sintética', message: 'Teste', mode: 'proposal' }
    const published = await call('POST', base + '/versions', publication)
    expect(published.statusCode, published.body).toBe(200)
    expect((await call('POST', base + '/versions', publication)).statusCode).toBe(409)
    expect((await call('POST', base + '/preview', { flow: 'strategist', organizationId,
      contractId: fixtureIds.contractA, mode: 'proposal', message: 'Contraprova' })).statusCode).toBe(409)
    const run = async (message: string, sessionId?: string) => {
      const sent = await call('POST', '/api/functions/run-strategy-admin-chat', {
        body: { message, sessionId, organizationId, leadId, mode: 'proposal' },
      })
      expect(sent.statusCode, sent.body).toBe(202)
      const queued = job.mock.lastCall![1]
      await runWithDatabaseRequestContext({ role: 'client_member', organizationIds: [organizationId], serviceRole: 'worker' },
        () => handleStrategyAdminChat(worker, app.config, queued))
      return sent.json<{ session: { id: string }; assistantMessage: { id: string } }>()
    }
    const first = await run('Orçamento confirmado de R$ 2.000.')
    const second = await run('Recomende agora.', first.session.id)
    expect(received[1].retrieval_context.conversation_history).toEqual([
      expect.objectContaining({ content: 'Orçamento confirmado de R$ 2.000.' }),
    ])
    expect(received[1].retrieval_context.commercial_catalog.offers).toHaveLength(1)
    expect(received[1].retrieval_context.opportunity.id).toBe(leadId)
    const wrongSession = await call('POST', '/api/functions/run-strategy-admin-chat', {
      body: { message: 'Mudar de conta', sessionId: first.session.id, organizationId: fixtureIds.organizationA },
    })
    expect(wrongSession.statusCode).toBe(409)

    const endpoint = '/api/proposals/strategy-recommendations/'
    const listed = await call('GET', endpoint + leadId + '?organizationId=' + organizationId)
    expect(listed.statusCode, listed.body).toBe(200)
    const [latest, prior] = listed.json<Array<{ id: string; catalogVersion: string }>>()
    expect(latest.id).toBe(second.assistantMessage.id)
    const importRequest = (item: typeof latest) => call('POST', endpoint + item.id + '/import', {
      organizationId, leadId, expectedCatalogVersion: item.catalogVersion,
    })
    const [draftOne, draftTwo] = await Promise.all([importRequest(latest), importRequest(latest)])
    expect(draftOne.statusCode, draftOne.body).toBe(200)
    expect(draftTwo.statusCode, draftTwo.body).toBe(200)
    expect(draftOne.json().id).toBe(draftTwo.json().id)
    const { rows } = await admin.query('SELECT final_value,status FROM public.proposals WHERE organization_id=$1 AND lead_id=$2', [organizationId, leadId])
    expect(rows).toEqual([{ final_value: '1500.00', status: 'draft' }])
    await admin.query('UPDATE public.proposal_price_rules SET recommended_value=1750 WHERE id=$1', [priceId])
    expect((await importRequest(prior)).statusCode).toBe(409)

    const restored = await call('POST', base + '/versions', { organizationId, expectedVersion: 1, reason: 'Ensaio de reversão', operation: 'restore', restoreVersion: 0 })
    expect(restored.statusCode, restored.body).toBe(200)
    expect(restored.json()).toMatchObject({ version: 2, instruction: null })
    expect((await call('GET', base + '/opportunities?organizationId=' + organizationId)).json().enabled).toBe(false)
  })
})
