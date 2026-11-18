import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { loadEnv } from '../../src/config/env.js'
import { createContextAwarePool } from '../../src/db/client.js'
import { runWithDatabaseRequestContext } from '../../src/db/request-context.js'
import { handleStrategyAdminChat } from '../../src/jobs/handlers/strategy.js'
import { REVENUE_RECOVERY_PACK_V0 } from '../../src/modules/action-engine/packs/revenue-recovery-v0.js'
import { publishActionPackVersion } from '../../src/modules/action-engine/repository.js'
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
      STRATEGY_PRESALES_BILLABLE_CONTRACT_IDS: fixtureIds.contractA,
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
    await admin.query("INSERT INTO public.organizations(id,name,slug,kind,client_id) VALUES ($1,'Subconta de captação de teste',$2,'client',$3)",
      [organizationId, 'agent-qa-' + organizationId, fixtureIds.clientA])
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

  it('inspects the supervisor only as global admin and leaves the mission unchanged', async () => {
    const missionId = randomUUID()
    const { parameters: _schema, ...definition } = REVENUE_RECOVERY_PACK_V0
    const pack = await publishActionPackVersion(admin, {
      packKey: definition.key, name: 'Revenue Recovery', description: 'Fixture do piloto',
      semanticVersion: definition.semanticVersion, outcomeType: definition.outcomeType,
      definition, contentHash: definition.contentHash, createdBy: fixtureUsers.yux_admin.id,
    })
    await admin.query(
      `INSERT INTO public.action_missions
       (id,organization_id,pack_version_id,title,objective,status,mode,create_idempotency_key,created_by)
       VALUES ($1,$2,$3,'Recuperação sintética','Propor recuperação em rascunho','draft','assisted',$4,$5)`,
      [missionId, organizationId, pack.id, missionId, fixtureUsers.yux_admin.id],
    )
    const runtime = vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toBe('http://127.0.0.1:4109/instructions/preview/mission-supervisor')
      const wire = JSON.parse(String(init.body))
      expect(wire.organization_id).toBe(organizationId)
      expect(wire.mission.id).toBe(missionId)
      expect(wire.action_pack.key).toBe('revenue_recovery')
      expect(wire).not.toHaveProperty('context_snapshot_id')
      expect(wire.capabilities.length).toBeGreaterThan(0)
      return Response.json({ baseline: { requests: [{ stage: 'planner' }] } })
    })
    vi.stubGlobal('fetch', runtime)
    const root = '/api/strategy-engine/agent-prompts'
    const body = { flow: 'mission-supervisor', organizationId, missionId }
    for (const user of [fixtureUsers.yux_operator, fixtureUsers.client_admin_A, fixtureUsers.client_member_A]) {
      const session = await app.inject({
        method: 'POST', url: '/api/auth/login', payload: { email: user.email, password: fixturePassword },
      })
      expect(session.statusCode).toBe(200)
      const cookie = session.cookies.map(item => item.name + '=' + item.value).join('; ')
      expect((await call('GET', root + '/missions?organizationId=' + organizationId, undefined, cookie)).statusCode).toBe(403)
      expect((await call('POST', root + '/preview', body, cookie)).statusCode).toBe(403)
    }
    expect((await call('POST', root + '/preview', { ...body, organizationId: fixtureIds.organizationA })).statusCode).toBe(404)
    expect((await call('POST', root + '/preview', { ...body, contractId: fixtureIds.contractB })).statusCode).toBe(409)
    expect(runtime).not.toHaveBeenCalled()
    expect((await call('GET', root + '/missions?organizationId=' + organizationId)).json().missions)
      .toContainEqual({ id: missionId, title: 'Recuperação sintética' })
    const result = await call('POST', root + '/preview', body)
    expect(result.statusCode, result.body).toBe(200)
    expect(result.headers['cache-control']).toBe('no-store')
    expect(runtime).toHaveBeenCalledTimes(1)
    expect((await admin.query('SELECT status, version::int FROM public.action_missions WHERE id = $1', [missionId])).rows)
      .toEqual([{ status: 'draft', version: 1 }])
    for (const table of ['action_planning_cycles', 'action_mission_context_snapshots', 'action_plans']) {
      expect((await admin.query('SELECT COUNT(*)::int AS count FROM public.' + table + ' WHERE mission_id = $1', [missionId])).rows[0].count)
        .toBe(0)
    }
    await admin.query('DELETE FROM public.action_missions WHERE id = $1', [missionId])
  })

  it('promotes by account, retains earlier budget and imports only current prices once', async () => {
    const base = '/api/strategy-engine/agent-prompts'
    const insufficientEvidence = 'O orçamento mudou e ainda não sabemos se o gargalo é aquisição ou acompanhamento.'
    const received: Array<Record<string, any>> = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toMatch(/^http:\/\/127\.0\.0\.1:4109\//)
      const body = JSON.parse(String(init.body))
      if (url.endsWith('/instructions/preview/strategist')) {
        return Response.json({ candidate: { requests: [{ fingerprint: 'a'.repeat(64) }] } })
      }
      received.push(body)
      return Response.json({ credits: body.client_id ? { reserved: 3, charged: 2, released: 1 } : null,
        usage: { reportedProviderCostUsd: null }, synthesis: {
        answer: 'Escopo de teste.',
        recommendation: body.message === insufficientEvidence
          ? { decision: 'defer', rationale: 'Aguardar diagnóstico.', missingInformation: ['Confirmar o orçamento e a origem do gargalo.'] }
          : { decision: 'recommend', rationale: 'Há demanda existente e falta acompanhamento.', packageId, itemKeys: ['base'] },
      } })
    }))
    expect((await call('GET', base, undefined, clientCookie)).statusCode).toBe(403)
    const scope = await call('GET', base + '/scope?organizationId=' + organizationId)
    expect(scope.statusCode).toBe(200)
    expect(scope.json().contracts).toContainEqual({ id: fixtureIds.contractA, name: expect.stringMatching(/\S/) })
    expect((await call('PUT', base + '/catalog', { organizationId, templateId, approved: true })).statusCode).toBe(200)
    expect((await call('PUT', base + '/catalog', { organizationId, templateId: excludedTemplateId, approved: true })).statusCode).toBe(409)
    const publication = { organizationId, expectedVersion: 0, operation: 'publish', instruction: 'Compare ofertas.',
      reason: 'Homologação sintética', message: 'Teste', mode: 'proposal' }
    const published = await call('POST', base + '/versions', publication)
    expect(published.statusCode, published.body).toBe(200)
    expect((await call('POST', base + '/versions', publication)).statusCode).toBe(409)
    expect((await call('POST', base + '/preview', { flow: 'strategist', organizationId,
      contractId: fixtureIds.contractB, mode: 'proposal', message: 'Contraprova' })).statusCode).toBe(409)
    const run = async (message: string, sessionId?: string, billableContract = false) => {
      const sent = await call('POST', '/api/functions/run-strategy-admin-chat', {
        body: { message, sessionId, organizationId, leadId, mode: 'proposal',
          contractId: fixtureIds.contractA },
      })
      expect(sent.statusCode, sent.body).toBe(202)
      const queued = job.mock.lastCall![1]
      await runWithDatabaseRequestContext({ role: 'client_member', organizationIds: [organizationId], serviceRole: 'worker' },
        () => handleStrategyAdminChat(worker, {
          ...app.config, STRATEGY_PRESALES_BILLABLE_CONTRACT_IDS: billableContract ? fixtureIds.contractA : undefined,
        }, queued))
      return sent.json<{ session: { id: string }; assistantMessage: { id: string } }>()
    }
    const first = await run('Orçamento confirmado de R$ 2.000.')
    const second = await run('Recomende agora.', first.session.id, true)
    expect(received[0].client_id).toBeNull()
    expect(received[1].client_id).toBe(fixtureIds.clientA)
    expect(received[1].strategy_operation_id).toBe(second.assistantMessage.id)
    const persistedUsage = await admin.query(
      'SELECT safe_context FROM public.yux_strategy_chat_messages WHERE id=$1', [second.assistantMessage.id],
    )
    expect(persistedUsage.rows[0].safe_context).toMatchObject({
      commercialCredits: 2, generationUsage: { reportedProviderCostUsd: null },
    })
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

    const deferred = await run(insufficientEvidence, first.session.id)
    const savedDeferral = await admin.query(
      'SELECT safe_context FROM public.yux_strategy_chat_messages WHERE id=$1', [deferred.assistantMessage.id],
    )
    expect(savedDeferral.rows[0].safe_context).toMatchObject({
      recommendation: { decision: 'defer', missingInformation: ['Confirmar o orçamento e a origem do gargalo.'] },
    })
    const updatedRecommendations = await call('GET', endpoint + leadId + '?organizationId=' + organizationId)
    expect(updatedRecommendations.statusCode).toBe(200)
    const eligibleIds = updatedRecommendations.json<Array<{ id: string }>>().map(item => item.id)
    expect(eligibleIds).not.toContain(deferred.assistantMessage.id)
    const ineligible = await importRequest({
      id: deferred.assistantMessage.id, catalogVersion: savedDeferral.rows[0].safe_context.catalogVersion,
    })
    expect(ineligible.statusCode).toBe(409)
    expect(ineligible.json().error).toBe('strategy_recommendation_ineligible')
    expect((await admin.query('SELECT id FROM public.proposals WHERE organization_id=$1 AND lead_id=$2', [organizationId, leadId])).rows)
      .toEqual([{ id: draftOne.json().id }])

    const restored = await call('POST', base + '/versions', { organizationId, expectedVersion: 1, reason: 'Ensaio de reversão', operation: 'restore', restoreVersion: 0 })
    expect(restored.statusCode, restored.body).toBe(200)
    expect(restored.json()).toMatchObject({ version: 2, instruction: null })
    expect((await call('GET', base + '/opportunities?organizationId=' + organizationId)).json().enabled).toBe(false)
  })

  it('publishes a single specialist for one task and keeps the enqueued version during later edits', async () => {
    const base = '/api/strategy-engine/agent-prompts'
    const stage = 'crm_pipeline_analyst'
    const instruction = 'Confirme o próximo passo comercial antes de concluir.'
    const scopePath = `${base}/scope?organizationId=${organizationId}`
    const scope = (await call('GET', scopePath)).json()
    const currentVersion = scope.versions[0]?.version ?? 0
    const publication = { organizationId, expectedVersion: currentVersion, operation: 'publish',
      instruction, stage, reason: 'Ensaio de versão da etapa.', message: 'Verifique o funil.', mode: 'proposal' }
    const previewRequest = { flow: 'strategist', organizationId, message: publication.message, mode: publication.mode,
      candidateStage: stage, candidateInstruction: instruction }
    const received: Array<Record<string, unknown>> = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body))
      if (url === 'http://127.0.0.1:4109/instructions/preview/strategist') {
        return Response.json({ candidate: { requests: [{ stage, fingerprint: 'a'.repeat(64),
          stageInstructionApplied: body.candidate_stage === stage }] } })
      }
      expect(url).toBe('http://127.0.0.1:4109/workflows/execute')
      received.push(body)
      return Response.json({ synthesis: { answer: 'Próximo passo a confirmar.' } })
    }))

    for (const role of [fixtureUsers.yux_operator, fixtureUsers.client_admin_A, fixtureUsers.client_member_A]) {
      const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: role.email, password: fixturePassword } })
      expect(login.statusCode).toBe(200)
      const cookie = login.cookies.map(item => item.name + '=' + item.value).join('; ')
      expect((await call('GET', scopePath, undefined, cookie)).statusCode).toBe(403)
      expect((await call('POST', base + '/preview', previewRequest, cookie)).statusCode).toBe(403)
      expect((await call('POST', base + '/versions', publication, cookie)).statusCode).toBe(403)
    }
    expect((await call('POST', base + '/versions', { ...publication, stage: 'missing_specialist' })).json().error)
      .toBe('agent_prompt_stage_not_simulated')

    const published = await call('POST', base + '/versions', publication)
    expect(published.statusCode, published.body).toBe(200)
    const firstVersion = currentVersion + 1
    expect(published.json()).toMatchObject({ version: firstVersion, instruction: null,
      stage_instructions: [{ mode: 'proposal', stage, instruction }], test_fingerprints: ['a'.repeat(64)] })
    const comparison = await call('POST', base + '/preview', previewRequest)
    expect(comparison.statusCode).toBe(200)
    expect(comparison.json().publishedVersion).toBe(firstVersion)
    expect((await call('GET', `${base}/opportunities?organizationId=${organizationId}&mode=proposal`)).json().enabled).toBe(true)
    expect((await call('GET', `${base}/opportunities?organizationId=${organizationId}&mode=diagnostic_48h`)).json().enabled).toBe(false)
    const foreignScope = await call('GET', `${base}/scope?organizationId=${fixtureIds.organizationA}`)
    expect(JSON.stringify(foreignScope.json().versions)).not.toContain(instruction)

    const enqueue = (mode: string) => call('POST', '/api/functions/run-strategy-admin-chat', {
      body: { organizationId, message: 'Prepare a estratégia.', mode },
    })
    const queued = await enqueue('proposal')
    expect(queued.statusCode, queued.body).toBe(202)
    const firstJob = job.mock.lastCall![1]
    expect(firstJob.body.presales).toMatchObject({ version: firstVersion, instruction: null, stageInstructions: { [stage]: instruction } })
    expect((await enqueue('diagnostic_48h')).statusCode).toBe(202)
    expect(job.mock.lastCall![1].body.presales).toBeUndefined()

    const updated = await call('POST', base + '/versions', { ...publication, expectedVersion: firstVersion,
      instruction: 'Peça a confirmação da etapa atual antes de concluir.' })
    expect(updated.statusCode, updated.body).toBe(200)
    expect((await call('POST', base + '/versions', {
      ...publication, expectedVersion: comparison.json().publishedVersion,
    })).statusCode).toBe(409)
    await runWithDatabaseRequestContext({ role: 'client_member', organizationIds: [organizationId], serviceRole: 'worker' },
      () => handleStrategyAdminChat(worker, app.config, firstJob))
    expect(received[0]).toMatchObject({ presales_stage_instructions: { [stage]: instruction }, presales_prompt_version: firstVersion })

    const restored = await call('POST', base + '/versions', { organizationId, expectedVersion: firstVersion + 1,
      operation: 'restore', restoreVersion: firstVersion, reason: 'Restaurar etapa aprovada.' })
    expect(restored.statusCode).toBe(200)
    expect(restored.json()).toMatchObject({ stage_instructions: [{ mode: 'proposal', stage, instruction }] })
  })
})
