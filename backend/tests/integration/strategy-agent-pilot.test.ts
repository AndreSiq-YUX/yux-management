import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { loadEnv } from '../../src/config/env.js'
import { createContextAwarePool } from '../../src/db/client.js'
import { runWithDatabaseRequestContext } from '../../src/db/request-context.js'
import { handleStrategyAdminChat } from '../../src/jobs/handlers/strategy.js'
import { REVENUE_RECOVERY_PACK_V0 } from '../../src/modules/action-engine/packs/revenue-recovery-v0.js'
import { publishActionPackVersion } from '../../src/modules/action-engine/repository.js'
import { pinMissionPromptVersion } from '../../src/modules/action-engine/mission-prompt-versions.js'
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
  let deniedCookies: string[]
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
      YUX_AGENT_RUNTIME_TOKEN: 'local-simulated-runtime', STRATEGY_PRESALES_PILOT_ORGANIZATION_IDS: `${organizationId},${fixtureIds.organizationB}`,
      STRATEGY_PRESALES_PILOT_SCOPES: `${organizationId}:${fixtureIds.contractA}`,
      STRATEGY_PRESALES_BILLABLE_CONTRACT_IDS: fixtureIds.contractA,
      ACTION_ENGINE_PROMPT_PILOT_ORGANIZATION_IDS: organizationId,
      ACTION_ENGINE_PROMPT_PILOT_SCOPES: `${fixtureIds.organizationA}:${fixtureIds.contractA}:mission-intake-internal`,
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
    deniedCookies = [clientCookie, await login(fixtureUsers.yux_operator.email), await login(fixtureUsers.client_member_A.email)]
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

  async function createSupervisorScenario() {
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
    return missionId
  }

  it('reports the enabled contract and audience only to the global admin', async () => {
    const { organizationA, contractA, organizationB } = fixtureIds
    const otherContract = randomUUID()
    await admin.query(`INSERT INTO public.contracts (id,client_id,package_id,status,starts_at)
      SELECT $2,client_id,package_id,'active',starts_at FROM public.contracts WHERE id=$1`, [contractA, otherContract])
    try {
      const endpoint = `/api/strategy-engine/agent-prompts/scope?organizationId=${organizationA}`
      const internal = `${endpoint}&promptScope=mission-intake-internal`
      const approved = await call('GET', internal)
      expect(approved.statusCode, approved.body).toBe(200)
      expect(approved.json()).toMatchObject({ pilotEnabled: false, pilotContractIds: [contractA],
        contracts: expect.arrayContaining([expect.objectContaining({ id: contractA }), expect.objectContaining({ id: otherContract })]) })
      for (const scope of ['mission-intake-client', 'mission-planning']) {
        const disabled = await call('GET', `${endpoint}&promptScope=${scope}`)
        expect(disabled.statusCode).toBe(200)
        expect(disabled.json()).toMatchObject({ pilotEnabled: false, pilotContractIds: [] })
      }
      for (const cookie of deniedCookies) {
        const denied = await call('GET', internal, undefined, cookie)
        expect(denied.statusCode).toBe(403)
        expect(denied.json()).not.toHaveProperty('pilotContractIds')
      }
      expect((await call('GET', internal.replace(organizationA, organizationB))).json()).toMatchObject({ pilotContractIds: [] })
      expect((await call('GET', internal.replace(organizationA, organizationId))).json()).toMatchObject({ pilotEnabled: true })
    } finally {
      await admin.query('DELETE FROM public.contracts WHERE id=$1', [otherContract])
    }
  })

  it('inspects the supervisor only as global admin and leaves the mission unchanged', async () => {
    const missionId = await createSupervisorScenario()
    const runtime = vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toBe('http://127.0.0.1:4109/instructions/preview/mission-supervisor')
      const wire = JSON.parse(String(init.body))
      expect(wire.organization_id).toBe(organizationId)
      expect(wire.mission.id).toBe(missionId)
      expect(wire.action_pack.key).toBe('revenue_recovery')
      expect(wire).not.toHaveProperty('context_snapshot_id')
      expect(wire.capabilities.length).toBeGreaterThan(0)
      const stage = { stage: 'planner' }
      return Response.json({ baseline: { requests: [stage] },
        ...(wire.candidate_adjustment ? { candidate: { requests: [{ ...stage,
          stageInstructionApplied: wire.candidate_adjustment.stage === stage.stage, providerFingerprint: 'a'.repeat(64),
        }] } } : {}) })
    })
    vi.stubGlobal('fetch', runtime)
    const root = '/api/strategy-engine/agent-prompts'
    const body = { flow: 'mission-supervisor', organizationId, missionId }
    for (const cookie of deniedCookies) {
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
    const publication = { ...body, operation: 'publish', stage: 'planner', expectedVersion: 0,
      instruction: 'Valide a condição de retirada antes de detalhar o plano.', reason: 'Ensaio em ambiente local.' }
    const approved = await call('POST', root + '/versions', publication)
    expect(approved.statusCode, approved.body).toBe(200)
    expect(approved.json()).toMatchObject({ version: 1, instructions: { planner: publication.instruction },
      test_fingerprints: ['a'.repeat(64)] })
    expect(runtime).toHaveBeenCalledTimes(2)
    expect(JSON.parse(String(runtime.mock.calls[1][1].body)).candidate_adjustment)
      .toEqual({ stage: 'planner', instruction: publication.instruction, version: 1 })
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
    expect(scope.json()).toMatchObject({ pilotEnabled: false, pilotContractIds: [fixtureIds.contractA] })
    expect((await call('GET', base + '/scope?organizationId=' + fixtureIds.organizationB)).json()).toMatchObject({ pilotEnabled: true })
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
    const run = async (message: string, { sessionId, billableContract = false, includeLead = true }: {
      sessionId?: string; billableContract?: boolean; includeLead?: boolean
    } = {}) => {
      const sent = await call('POST', '/api/functions/run-strategy-admin-chat', {
        body: { message, sessionId, organizationId, ...(includeLead ? { leadId } : {}), mode: 'proposal',
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
    const alternateContract = randomUUID()
    await admin.query(`INSERT INTO public.contracts (id,client_id,package_id,status,starts_at)
      SELECT $2,client_id,package_id,'active',starts_at FROM public.contracts WHERE id=$1`, [fixtureIds.contractA, alternateContract])
    try {
      const opportunities = `${base}/opportunities?organizationId=${organizationId}&mode=proposal`
      const approved = await call('GET', `${opportunities}&contractId=${fixtureIds.contractA}`)
      expect(approved.statusCode, approved.body).toBe(200)
      expect(approved.json()).toMatchObject({ enabled: true, leads: [expect.objectContaining({ id: leadId })] })
      const denied = await call('GET', `${opportunities}&contractId=${alternateContract}`)
      expect(denied.statusCode, denied.body).toBe(200)
      expect(denied.json()).toMatchObject({ enabled: false, pilotContractIds: [fixtureIds.contractA], leads: [],
        contracts: expect.arrayContaining([expect.objectContaining({ id: alternateContract })]) })
      expect((await call('GET', opportunities)).json()).toMatchObject({ enabled: false, leads: [] })
      for (const cookie of deniedCookies) {
        const forbidden = await call('GET', `${opportunities}&contractId=${fixtureIds.contractA}`, undefined, cookie)
        expect(forbidden.statusCode).toBe(403)
        expect(forbidden.json()).not.toHaveProperty('pilotContractIds')
      }
      const queued = job.mock.calls.length
      const command = { message: 'Tente trocar o contrato da oportunidade.', organizationId, leadId, mode: 'proposal' }
      const wrongContract = await call('POST', '/api/functions/run-strategy-admin-chat', { body: { ...command, contractId: alternateContract } })
      expect(wrongContract.statusCode, wrongContract.body).toBe(409)
      expect(wrongContract.json().error).toBe('strategy_presales_pilot_inactive')
      const wrongSessionContract = await call('POST', '/api/functions/run-strategy-admin-chat', {
        body: { ...command, contractId: alternateContract, sessionId: first.session.id },
      })
      expect(wrongSessionContract.statusCode, wrongSessionContract.body).toBe(409)
      expect(wrongSessionContract.json().error).toBe('strategy_chat_session_scope_mismatch')
      expect(job.mock.calls).toHaveLength(queued)
      expect(received).toHaveLength(1)
    } finally {
      await admin.query('DELETE FROM public.contracts WHERE id=$1', [alternateContract])
    }
    const second = await run('Recomende agora.', { sessionId: first.session.id, billableContract: true })
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

    const deferred = await run(insufficientEvidence, { sessionId: first.session.id })
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
    expect((await call('GET', base + '/opportunities?organizationId=' + organizationId + '&contractId=' + fixtureIds.contractA)).json().enabled).toBe(false)
    await run('Analise pelo fluxo herdado.', { includeLead: false })
    expect(received.at(-1)).not.toHaveProperty('presales_prompt_version')
    expect(received.at(-1)).not.toHaveProperty('retrieval_context.commercial_catalog')
    const saved = await admin.query(`SELECT id,final_value,status,strategy_recommendation_message_id
      FROM public.proposals WHERE organization_id=$1 AND lead_id=$2`, [organizationId, leadId])
    expect(saved.rows).toEqual([{ id: draftOne.json().id, final_value: '1500.00', status: 'draft',
      strategy_recommendation_message_id: second.assistantMessage.id }])
    expect((await admin.query('SELECT safe_context FROM public.yux_strategy_chat_messages WHERE id=$1', [second.assistantMessage.id])).rows)
      .toEqual(persistedUsage.rows)
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

    for (const cookie of deniedCookies) {
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
    const opportunityScope = `${base}/opportunities?organizationId=${organizationId}&contractId=${fixtureIds.contractA}`
    expect((await call('GET', `${opportunityScope}&mode=proposal`)).json().enabled).toBe(true)
    expect((await call('GET', `${opportunityScope}&mode=diagnostic_48h`)).json().enabled).toBe(false)
    const foreignScope = await call('GET', `${base}/scope?organizationId=${fixtureIds.organizationA}`)
    expect(JSON.stringify(foreignScope.json().versions)).not.toContain(instruction)

    const enqueue = (mode: string) => call('POST', '/api/functions/run-strategy-admin-chat', {
      body: { organizationId, contractId: fixtureIds.contractA, message: 'Prepare a estratégia.', mode },
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

  it('limits mission turn adjustments to the intended account and audience, and pins the version through retries', async () => {
    const base = '/api/strategy-engine/agent-prompts'
    const body = { flow: 'mission-intake', organizationId, audience: 'internal_operator', message: 'Prepare a captação.' }
    const issue = { ...body, operation: 'publish', stage: 'synthesizer', expectedVersion: 0,
      instruction: 'Confirme o processo logístico.', reason: 'Caso sintético.' }
    const runtime = vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toBe('http://127.0.0.1:4109/instructions/preview/mission-intake')
      const request = JSON.parse(String(init.body))
      expect(request.organization_id).toBe(organizationId)
      expect(request.audience).toBe(body.audience)
      return Response.json({ baseline: { requests: [{ stage: 'synthesizer' }] },
        ...(request.candidate_adjustment ? { candidate: { requests: [{ stage: 'synthesizer',
          stageInstructionApplied: true, providerFingerprint: 'b'.repeat(64),
        }] } } : {}) })
    })
    vi.stubGlobal('fetch', runtime)
    const internal = `${base}/scope?organizationId=${organizationId}&promptScope=mission-intake-internal`
    for (const cookie of deniedCookies) {
      expect((await call('GET', internal, undefined, cookie)).statusCode).toBe(403)
      expect((await call('POST', base + '/preview', body, cookie)).statusCode).toBe(403)
      expect((await call('POST', base + '/versions', issue, cookie)).statusCode).toBe(403)
    }
    expect((await call('POST', base + '/versions', { ...issue, stage: 'planner' })).statusCode).toBe(409)
    expect(runtime).not.toHaveBeenCalled()
    const publish = await call('POST', base + '/versions', issue)
    expect(publish.statusCode, publish.body).toBe(200)
    expect(publish.json()).toMatchObject({ version: 1, instructions: { synthesizer: issue.instruction } })
    expect((await call('GET', internal.replace('intake-internal', 'intake-client'))).json().versions).toEqual([])
    expect((await call('GET', internal.replace(organizationId, fixtureIds.organizationA))).json().versions).toEqual([])

    const run = { organizationId, scope: 'mission-intake-internal' as const, operationId: randomUUID(), operationVersion: 1 }
    const pin = (request: typeof run, env = app.config) => runWithDatabaseRequestContext(
      { role: 'yux_operator', organizationIds: [organizationId], serviceRole: 'worker' },
      () => pinMissionPromptVersion(worker, env, request),
    )
    const pinned = { pilot: true, configuration: { version: 1, instructions: { synthesizer: issue.instruction } } }
    expect(await pin(run)).toEqual(pinned)
    const revised = await call('POST', base + '/versions', { ...issue, expectedVersion: 1, instruction: 'Confirme a região atendida.' })
    expect(revised.statusCode, revised.body).toBe(200)
    expect(await pin(run)).toEqual(pinned)
    expect(await pin({ ...run, operationId: randomUUID() })).toEqual({ pilot: true,
      configuration: { version: 2, instructions: revised.json().instructions } })
    const restored = await call('POST', base + '/versions', { organizationId, operation: 'restore',
      promptScope: 'mission-intake-internal', restoreVersion: 0, expectedVersion: 2, reason: 'Retomar a configuração herdada.' })
    expect(restored.statusCode, restored.body).toBe(200)
    const disabled = { ...app.config, ACTION_ENGINE_PROMPT_PILOT_ORGANIZATION_IDS: undefined }
    const inherited = { ...run, operationId: randomUUID() }
    expect(await pin(run, disabled)).toEqual(pinned)
    expect(await pin(inherited)).toEqual({ pilot: true, configuration: undefined })
    expect(await pin(inherited, disabled)).toEqual({ pilot: true, configuration: undefined })
    expect(await pin({ ...run, operationVersion: 2 }, disabled)).toEqual({ pilot: false })
    expect(await pin({ ...run, operationId: randomUUID() }, disabled)).toEqual({ pilot: false })
  })

  it('publishes tested source rules independently for each pilot flow and restores the inherited policy', async () => {
    const base = '/api/strategy-engine/agent-prompts'
    const sourceRules = { methodology: 'forbidden', company_strategy: 'optional', company_documents: 'required', portfolio: 'optional' } as const
    const report = { rules: sourceRules, counts: { methodology: 0, company_strategy: 0, company_documents: 0, portfolio: 0 },
      missing: ['company_documents'] }
    const transport = vi.fn(async (url: string, init: RequestInit) => {
      const wire = JSON.parse(String(init.body))
      if (url.endsWith('/instructions/preview/mission-supervisor')) {
        expect(wire.mission_prompt?.source_rules).toBeUndefined()
        return Response.json({ baseline: { requests: [{ stage: 'planner', providerFingerprint: 'c'.repeat(64) }] } })
      }
      expect(wire.candidate_source_rules).toEqual(sourceRules)
      return Response.json({ baseline: { requests: [] }, candidate: { requests: [], sourcePolicy: report } })
    })
    vi.stubGlobal('fetch', transport)
    const scope = async (promptScope?: string) => (await call('GET',
      `${base}/scope?organizationId=${organizationId}${promptScope ? `&promptScope=${promptScope}` : ''}`)).json()
    const body = { organizationId, flow: 'mission-intake', message: 'Confirme as condições.', audience: 'client_user' }
    const publication = { operation: 'publish_sources', sourceRules, reason: 'Regra do caso sintético.' }
    for (const cookie of deniedCookies) {
      expect((await call('POST', base + '/versions', { ...body, ...publication, expectedVersion: 0 }, cookie)).statusCode).toBe(403)
    }
    expect(transport).not.toHaveBeenCalled()
    const compared = await call('POST', base + '/preview', { ...body, candidateSourceRules: sourceRules })
    expect(compared.json().candidate).toEqual({ requests: [], sourcePolicy: report })
    const approved = await call('POST', base + '/versions', { ...body, ...publication, expectedVersion: 0 })
    expect(approved.statusCode, approved.body).toBe(200)
    expect(approved.json()).toMatchObject({ instructions: {}, source_rules: sourceRules, test_fingerprints: [expect.stringMatching(/^[a-f0-9]{64}$/)] })
    expect((await scope('mission-intake-internal')).versions[0].source_rules).toBeNull()
    const run = { organizationId, scope: 'mission-intake-client' as const, operationId: randomUUID(), operationVersion: 1 }
    const pin = (request: typeof run) => runWithDatabaseRequestContext({
      role: 'yux_operator', organizationIds: [organizationId], serviceRole: 'worker',
    }, () => pinMissionPromptVersion(worker, app.config, request))
    expect((await pin(run)).configuration?.source_rules).toEqual(sourceRules)
    const restored = await call('POST', base + '/versions', {
      operation: 'restore', organizationId, promptScope: run.scope, restoreVersion: 0, expectedVersion: 1, reason: 'Reverter ensaio.',
    })
    expect(restored.statusCode, restored.body).toBe(200)
    expect(await pin({ ...run, operationId: randomUUID() })).toEqual({ pilot: true, configuration: undefined })
    expect((await pin(run)).configuration?.source_rules).toEqual(sourceRules)

    const strategist = await scope()
    const strategic = await call('POST', base + '/versions', {
      ...publication, organizationId, flow: 'strategist', message: 'Compare ofertas.', mode: 'proposal',
      expectedVersion: strategist.versions[0]?.version ?? 0,
    })
    expect(strategic.statusCode, strategic.body).toBe(200)
    expect(strategic.json()).toMatchObject({ source_rules: sourceRules, stage_instructions: strategist.versions[0]?.stage_instructions ?? [] })
    const missionId = await createSupervisorScenario()
    const planning = await scope('mission-planning')
    try {
      const planned = await call('POST', base + '/versions', { ...publication, organizationId, flow: 'mission-supervisor',
        missionId, expectedVersion: planning.versions[0]?.version ?? 0 })
      expect(planned.statusCode, planned.body).toBe(200)
      expect(planned.json()).toMatchObject({ source_rules: sourceRules, instructions: planning.versions[0]?.instructions ?? {} })
    } finally {
      await admin.query('DELETE FROM public.action_missions WHERE id = $1', [missionId])
    }
  })
})
