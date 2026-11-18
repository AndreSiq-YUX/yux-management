import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import type { createJobProcessor } from '../../src/jobs/processor.js'
import type { MissionPlanRequestWire } from '../../src/modules/action-engine/generated/mission-wire.js'
import type { AppJobQueue } from '../../src/server.js'
import { fixtureIds, fixtureUsers } from '../integration/support/fixtures.js'
import { createIntegrationRig } from '../integration/support/rig.js'

const database = new URL(process.env.YUX_INTEGRATION_DATABASE_URL ?? 'postgresql://invalid/invalid')
assert(database.hostname === '127.0.0.1' && /^\/yux_test_agent_pilot_browser(?:_\w+)?$/.test(database.pathname),
  'Use a dedicated loopback database named yux_test_agent_pilot_browser')

const { organizationA: missionOrg, contractA: missionContract, organizationB: presalesOrg, contractB: presalesContract } = fixtureIds
const runtime = 'http://127.0.0.1:4191'
const generationRuntime = 'http://127.0.0.1:4189'
const token = 'agent-pilot-browser-fixture'
process.env.YUX_AGENT_RUNTIME_URL = runtime
process.env.YUX_AGENT_RUNTIME_TOKEN = token
const localFetch = globalThis.fetch
globalThis.fetch = (input, init) => {
  const url = new URL(input instanceof Request ? input.url : input)
  assert.equal(url.hostname, '127.0.0.1', 'Unexpected external request in the pilot test')
  return localFetch(input, { ...init, redirect: 'error' })
}

const draftJobs = new Set([
  'action-engine.scheduleReadyActions', 'action-engine.executeAction', 'action-engine.collectMetrics', 'action-engine.evaluateMission',
])
const allowedJobs = new Set(['strategy.adminChat', 'action-engine.processMissionConversation', 'action-engine.planMission', ...draftJobs])
const draftCapabilities = new Set([
  'system.readiness.check', 'crm.pipeline.inspect', 'crm.pipeline.simulate', 'crm.pipeline.create_draft',
  'email.template.create_draft', 'crm.sequence.create_draft',
])
const plannedMissions: string[] = []
type PilotJob = Parameters<ReturnType<typeof createJobProcessor>>[0]
const jobs: PilotJob[] = []
const queue: AppJobQueue = {
  async add(name, data) {
    assert(allowedJobs.has(name), `Unexpected pilot job: ${name}`)
    const id = randomUUID()
    jobs.push({ id, name, data } as PilotJob)
    return { id }
  },
  async close() {},
}
const rig = await createIntegrationRig({
  queueMode: 'stub', stubJobQueue: queue, missionConversations: true, corsOrigin: 'http://127.0.0.1:4187',
  agentPilots: {
    presalesOrganizationId: presalesOrg,
    missionScopes: [
      `${missionOrg}:${missionContract}:mission-intake-internal`, `${missionOrg}:${missionContract}:mission-planning`,
      `${presalesOrg}:${presalesContract}:mission-intake-internal`, `${presalesOrg}:${presalesContract}:mission-planning`,
    ],
  },
  drainStubQueue: async processJob => {
    for (let drained = 0; jobs.length > 0; drained++) {
      assert(drained < 50, 'Pilot job queue did not drain')
      const job = jobs.shift()!
      if (draftJobs.has(job.name)) {
        const { missionId, organizationId, actionRunId } = job.data
        assert(typeof missionId === 'string' && plannedMissions.includes(missionId), 'Unexpected mission in the draft queue')
        if (organizationId !== undefined) assert.equal(organizationId, missionOrg)
        if (job.name === 'action-engine.executeAction') {
          const { rows: [action] } = await rig.sql(`SELECT step.capability_key FROM public.action_runs run
            JOIN public.action_plan_steps step ON step.id=run.plan_step_id AND step.plan_id=run.plan_id
            WHERE run.id=$1 AND run.mission_id=$2 AND run.organization_id=$3`, [actionRunId, missionId, missionOrg])
          assert(action && draftCapabilities.has(action.capability_key), 'Only preparation capabilities are permitted in this fixture')
        }
      }
      await processJob(job)
    }
  },
})

const leadId = randomUUID()
const names = { presales: 'YUX Captação · teste local', mission: 'Villeman e Massas · teste local', lead: `Prospect de acompanhamento ${leadId.slice(0, 8)}` }
const budget = 'Orçamento confirmado de R$ 2.000 para recuperar oportunidades já geradas.'
const objective = 'Prepare a captação de cozinhas industriais em São Paulo para a oferta de massas congeladas.'
const agencyObjective = 'Prepare a captação da agência para cozinhas industriais em São Paulo. Confira se o WhatsApp pode ser usado.'
const revisedAudience = 'Cozinhas industriais na Grande São Paulo com retirada agendada'
await rig.sql('UPDATE public.organizations SET name=CASE WHEN id=$1 THEN $3 ELSE $4 END WHERE id IN ($1,$2)', [missionOrg, presalesOrg, names.mission, names.presales])
// The shared integration fixture uses a synthetic pack with no metrics collector.
await rig.sql('DELETE FROM public.action_missions WHERE id=$1 AND create_idempotency_key=$2', [fixtureIds.missionA, 'integration-mission-a'])
await rig.sql(`INSERT INTO public.contract_modules(contract_id,module_key,enabled)
  VALUES ($1,'action_engine',TRUE),($2,'action_engine',TRUE)
  ON CONFLICT(contract_id,module_key) DO UPDATE SET enabled=TRUE`, [missionContract, presalesContract])
await rig.sql(`INSERT INTO public.ai_credit_wallets(organization_id,client_id,contract_id,current_balance)
  VALUES ($1,$2,$3,10),($4,$5,$6,10) ON CONFLICT(contract_id) DO UPDATE SET current_balance=10`,
  [missionOrg, fixtureIds.clientA, missionContract, presalesOrg, fixtureIds.clientB, presalesContract])
await rig.sql(`INSERT INTO public.crm_instances(organization_id,contract_id,status)
  VALUES ($1,$2,'active'),($3,$4,'draft') ON CONFLICT(contract_id) DO UPDATE SET status=EXCLUDED.status`,
  [presalesOrg, presalesContract, missionOrg, missionContract])
const { rows: [crm] } = await rig.sql('SELECT id FROM public.crm_instances WHERE contract_id=$1', [presalesContract])
const { rows: [pipeline] } = await rig.sql(`INSERT INTO public.crm_pipelines(organization_id,crm_instance_id,name,is_active,is_default)
  VALUES($1,$2,'Pré-venda piloto',TRUE,TRUE) ON CONFLICT(organization_id,name) DO UPDATE SET is_active=TRUE RETURNING id`, [presalesOrg, crm.id])
const { rows: [stage] } = await rig.sql(`INSERT INTO public.crm_pipeline_stages(pipeline_id,key,name,order_index,is_active)
  VALUES($1,'new','Novo lead',0,TRUE) ON CONFLICT(pipeline_id,key) DO UPDATE SET is_active=TRUE RETURNING id`, [pipeline.id])
await rig.sql(`INSERT INTO public.leads (id,organization_id,client_id,crm_instance_id,name,email,stage,status,pipeline_id,stage_id)
  VALUES ($1,$2,$3,$4,$5,$6,'NEW','open',$7,$8)`, [leadId, presalesOrg, fixtureIds.clientB, crm.id, names.lead, `${leadId}@integration.test`, pipeline.id, stage.id])
const independentLeadId = randomUUID()
await rig.sql(`WITH independent_lead AS (
  INSERT INTO public.leads(id,organization_id,client_id,crm_instance_id,name,email,stage,status)
  VALUES($1,$2,$3,$4,'Outra oportunidade do piloto',$5,'NEW','open') RETURNING id
) INSERT INTO public.proposals (organization_id,lead_id,crm_instance_id,package_id,title,updated_at)
  SELECT $2, independent_lead.id, $4, package.id, 'Outra proposta no mesmo workspace', NOW() + interval '1 day'
  FROM independent_lead CROSS JOIN public.packages package WHERE package.key='maquina_comercial'`,
  [independentLeadId, presalesOrg, fixtureIds.clientB, crm.id, `${independentLeadId}@integration.test`])
await rig.sql(`INSERT INTO public.proposal_templates (organization_id,package_id,name,scope,presales_sellable)
  SELECT $1,id,'Acompanhamento comercial','Recuperar oportunidades existentes',TRUE
  FROM public.packages WHERE key='maquina_comercial' ON CONFLICT DO NOTHING`, [presalesOrg])
await rig.sql(`INSERT INTO public.proposal_price_rules (organization_id,package_id,item_key,label,minimum_value,recommended_value,maximum_value)
  SELECT $1,p.id,'base','Acompanhamento comercial',1000,1500,3000 FROM public.packages p
  WHERE p.key='maquina_comercial' AND NOT EXISTS (SELECT 1 FROM public.proposal_price_rules r
    WHERE r.organization_id=$1 AND r.package_id=p.id AND r.item_key='base')`, [presalesOrg])
await rig.sql(`INSERT INTO public.strategy_agent_prompt_versions
  (organization_id,version,instruction,operation,reason,test_fingerprints,author_id)
  VALUES ($1,1,'Compare as ofertas elegíveis e preserve o orçamento.','publish','Cenário local',ARRAY[]::text[],$2)
  ON CONFLICT (organization_id,version) DO NOTHING`, [presalesOrg, fixtureUsers.yux_admin.id])

const sourceTitle = 'Representante sintético de alimentos'
const agencySourceTitle = 'Estratégia sintética de captação da agência'
const sourceByOrganization = new Map<string, { sourceId: string; contractId: string }>([
  [missionOrg, await publishCompanyStrategy({
    organizationId: missionOrg, clientId: fixtureIds.clientA, contractId: missionContract, actor: 'client_admin_A',
    title: sourceTitle, product: 'Lasanha congelada em caixa piloto', offer: 'Massas congeladas com retirada agendada.',
  })],
  [presalesOrg, await publishCompanyStrategy({
    organizationId: presalesOrg, clientId: fixtureIds.clientB, contractId: presalesContract, actor: 'client_admin_B',
    title: agencySourceTitle, product: 'Diagnóstico de aquisição PME', offer: 'Auditoria de aquisição para cozinhas industriais.',
  })],
])

async function publishCompanyStrategy(input: {
  organizationId: string; clientId: string; contractId: string; actor: 'client_admin_A' | 'client_admin_B'
  title: string; product: string; offer: string
}) {
  const { organizationId, clientId, contractId, actor, title, product, offer } = input
  const { rows: [item] } = await rig.sql(`INSERT INTO public.marketing_products_services
    (organization_id,client_id,contract_id,name,description,status)
    VALUES($1,$2,$3,$4,$5,'active') RETURNING id`, [organizationId, clientId, contractId, product, offer])
  const path = `/api/company-intelligence/organizations/${organizationId}/strategies`
  const created = await rig.request(actor, 'POST', path, {
    expectedVersion: null, idempotencyKey: randomUUID(), content: {
      schemaVersion: 1, title, objective: 'Captação de cozinhas industriais em São Paulo', summary: offer,
      sections: [{ id: randomUUID(), kind: 'constraints', title: 'Oferta', body: offer, agentUse: 'internal' }],
      references: { productIds: [item.id], documentIds: [] },
    },
  })
  assert.equal(created.statusCode, 200, JSON.stringify(created.body))
  const sourceId = created.body.draftRevision.id as string
  const published = await rig.request(actor, 'POST', `${path}/${created.body.id}/publish`, {
    expectedVersion: created.body.version, revisionId: sourceId,
    expectedContentHash: created.body.draftRevision.contentHash, idempotencyKey: randomUUID(),
  })
  assert.equal(published.statusCode, 200, JSON.stringify(published.body))
  const primary = await rig.request(actor, 'POST', `${path}/${created.body.id}/primary`, { expectedVersion: published.body.version })
  assert.equal(primary.statusCode, 200, JSON.stringify(primary.body))
  return { sourceId, contractId }
}

function missionScope(input: { organization_id: string; contract_id?: string | null }) {
  const scope = sourceByOrganization.get(input.organization_id)
  assert(scope, 'Unexpected mission organization')
  assert.equal(input.contract_id, scope.contractId)
  return scope
}
const presalesTurns: string[] = []
const missionTurns: string[] = []
const listener = createServer(async (req, res) => {
  const respond = (status: number, body: unknown) => {
    res.writeHead(status, { 'content-type': 'application/json' })
    res.end(JSON.stringify(body))
  }
  if (req.headers.authorization !== `Bearer ${token}`) return respond(401, { error: 'fixture_token_required' })
  try {
    if (req.method === 'GET' && req.url === '/fixture') {
      return respond(200, { names, budget, objective, agencyObjective, revisedAudience, sourceTitle, agencySourceTitle,
        leadId, missionOrg, missionContract, presalesOrg, presalesContract })
    }
    if (req.method === 'POST' && req.url === '/worker-tick') {
      await rig.workerTick()
      return respond(200, { drained: true })
    }
    if (req.method === 'GET' && req.url === '/evidence') {
      const drafts = await rig.sql(`SELECT status,final_value::text,strategy_recommendation_message_id IS NOT NULL AS traced
        FROM public.proposals WHERE organization_id=$1 AND lead_id=$2`, [presalesOrg, leadId])
      const plans = await rig.sql(`SELECT p.mission_id, p.status,
        (SELECT COUNT(*)::int FROM public.action_plan_steps WHERE plan_id=p.id) AS steps,
        (SELECT COUNT(*)::int FROM public.action_runs WHERE plan_id=p.id AND status IN ('queued','running','succeeded')) AS runs
        FROM public.action_plans p WHERE p.organization_id=$1 AND p.mission_id=ANY($2::uuid[])`, [missionOrg, plannedMissions])
      return respond(200, { drafts: drafts.rows, presalesTurns, missionTurns, plans: plans.rows, providerCalls: (await rig.providerCalls()).length })
    }
    if (req.method === 'GET' && req.url === '/execution') {
      const { rows } = await rig.sql(`SELECT mission.id, mission.status,
        (SELECT COUNT(*)::int FROM public.action_runs WHERE mission_id=mission.id AND status='succeeded') AS completed_steps,
        ARRAY(SELECT status::text FROM public.crm_pipeline_versions WHERE mission_id=mission.id) AS funnels,
        ARRAY(SELECT status::text FROM public.email_templates WHERE mission_id=mission.id ORDER BY id) AS emails,
        ARRAY(SELECT is_active FROM public.crm_sequences WHERE mission_id=mission.id) AS active_sequences,
        ARRAY(SELECT status::text FROM public.crm_sequence_versions WHERE mission_id=mission.id) AS sequence_versions,
        (SELECT COUNT(*)::int FROM public.crm_sequence_enrollments enrollment
          JOIN public.crm_sequences sequence ON sequence.id=enrollment.sequence_id AND sequence.mission_id=mission.id) AS enrollments,
        (SELECT COUNT(*)::int FROM public.automation_flows WHERE mission_id=mission.id) AS automations,
        (SELECT COUNT(*)::int FROM public.email_send_requests WHERE organization_id=mission.organization_id) AS sends,
        (SELECT status FROM public.crm_instances WHERE contract_id=mission.contract_id) AS crm_status
        FROM public.action_missions mission WHERE mission.organization_id=$1 AND mission.id=ANY($2::uuid[])`, [missionOrg, plannedMissions])
      return respond(200, { missions: rows, providerCalls: (await rig.providerCalls()).length })
    }
    let body = ''
    for await (const chunk of req) body += chunk.toString()
    if (req.method !== 'POST' || !req.url) return respond(404, { error: 'fixture_route_not_found' })
    const input = JSON.parse(body)
    if (req.url === '/workflows/execute') {
      assert.equal(input.organization_id, presalesOrg)
      assert.equal(input.contract_id, presalesContract)
      assert.equal(input.presales_prompt_version, 1)
      const context = input.retrieval_context
      assert.equal(context.opportunity.id, leadId)
      assert.equal(context.commercial_catalog.offers.length, 1)
      presalesTurns.push(input.message)
    } else if (req.url === '/missions/conversations/turn') {
      missionScope(input)
      if (input.organization_id === missionOrg) missionTurns.push(input.user_message)
    } else if (req.url === '/missions/planning-spec' || req.url === '/missions/plan-governed') {
      const planInput: MissionPlanRequestWire = input
      const { sourceId } = missionScope(planInput)
      const allowedSourceIds = planInput.allowed_source_ids ?? []
      assert(allowedSourceIds.includes(sourceId))
      for (const [organizationId, scope] of sourceByOrganization) {
        if (organizationId !== planInput.organization_id) assert(!allowedSourceIds.includes(scope.sourceId))
      }
      const { id } = planInput.mission
      assert(typeof id === 'string')
      if (req.url === '/missions/plan-governed') {
        const { rows: [reservation] } = await rig.sql(`SELECT entry.calls, entry.metadata->>'specificationFingerprint' AS fingerprint
          FROM public.action_planning_cycles cycle JOIN public.action_planning_usage_entries entry ON entry.cycle_id=cycle.id
          WHERE cycle.mission_id=$1 AND cycle.organization_id=$2 AND entry.nature='reservation'`, [id, planInput.organization_id])
        assert(reservation.calls >= 5 && reservation.calls <= 8)
        assert.equal(reservation.calls, input.planning_budget.estimate.calls)
        assert.equal(reservation.fingerprint, req.headers['x-yux-mission-planning-spec'])
        assert.match(reservation.fingerprint, /^[a-f0-9]{64}$/)
        if (planInput.organization_id === missionOrg) plannedMissions.push(id)
      }
    } else if (!req.url.startsWith('/instructions/preview/')) {
      return respond(404, { error: 'fixture_route_not_found' })
    }
    const headers = new Headers({ authorization: `Bearer ${token}`, 'content-type': 'application/json' })
    for (const name of ['x-yux-mission-pilot-usage', 'x-yux-mission-turn-operation', 'x-yux-mission-planning-spec']) {
      const value = req.headers[name]
      if (typeof value === 'string') headers.set(name, value)
    }
    const result = await fetch(new URL(req.url, generationRuntime), { method: 'POST', body, headers })
    if (!result.headers.get('content-type')?.includes('application/json')) {
      await result.body?.cancel()
      return respond(result.status, { error: 'pilot_runtime_response_not_json' })
    }
    return respond(result.status, await result.json())
  } catch (error) {
    console.error('[agent-pilot-fixture]', error)
    return respond(500, { error: 'pilot_fixture_failed', message: String(error) })
  }
})
await new Promise<void>((resolve, reject) => {
  listener.once('error', reject)
  listener.listen(4191, '127.0.0.1', resolve)
})
await rig.listen(4188)
