import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { expect, it } from 'vitest'
import { createIntegrationRig } from './support/rig.js'
import { fixtureUsers } from './support/fixtures.js'
import { createContextAwarePool } from '../../src/db/client.js'
import { runWithDatabaseRequestContext } from '../../src/db/request-context.js'
import type { MissionConversationTurnResponseWire } from '../../src/modules/action-engine/generated/mission-wire.js'
import type { AppEnv } from '../../src/config/env.js'
import type { EnqueueJobOptions } from '../../src/jobs/queue.js'
import { handleActionEngineProcessMissionConversation, handleActionEnginePlanMission, handleActionEngineSchedule,
  handleActionEngineExecute, handleActionEngineCollectMetrics, handleActionEngineEvaluation } from '../../src/jobs/handlers/action-engine.js'
import { crmPreparationProposal } from '../support/crm-preparation-fixture.js'
import { requestMissionPlan } from '../../src/modules/action-engine/planner.js'
import { createSequenceDraft, publishSequenceDraft } from '../../src/modules/automations/mission-commands.js'
import { buildMissionPlanningCatalog, buildMissionPlanningContext } from '../../src/modules/action-engine/mission-plan-request.js'
import { getMission, hashCanonical } from '../../src/modules/action-engine/repository.js'

it.each(['success', 'specialist_failure', 'spec_changed', 'calls_exhausted'])('preserves the CRM preparation journey and private accounting in %s', async outcome => {
  const jobs: Array<{name: string; data: Record<string, unknown>; options?: EnqueueJobOptions}> = []
  const queue = { async add(name: string, data: Record<string, unknown>, options?: EnqueueJobOptions) { jobs.push({name,data,options}); return {id: randomUUID()} }, async close() {} }
  const rig = await createIntegrationRig({queueMode: 'stub', missionConversations: true, stubJobQueue: queue})
  const pool = createContextAwarePool(new pg.Pool({connectionString: rig.serviceDatabaseUrl('yux_worker')}), 'worker')
  const org = rig.ids.organizationA
  const within = <T>(work: () => Promise<T>) => runWithDatabaseRequestContext({role:'yux_admin',organizationIds:[org],serviceRole:'worker'},work)
  const env = {MISSION_CONVERSATIONS_ENABLED:true, YUX_AGENT_RUNTIME_URL:'http://simulated.invalid',YUX_AGENT_RUNTIME_TOKEN:'fixture',
    ACTION_ENGINE_PROMPT_PILOT_ORGANIZATION_IDS:org,
    ACTION_ENGINE_MUTATION_LEASE_SECRET:'integration-mutation-lease-secret-32-chars'} as AppEnv
  const intakeInstruction = 'Confirme a retirada antes de propor o briefing.'
  const planningInstruction = 'Use a condição de retirada ao definir a qualificação.'
  const sourceRules = { methodology: 'optional', company_strategy: 'required', company_documents: 'forbidden', portfolio: 'optional' }
  try {
    await rig.sql(`INSERT INTO private.mission_prompt_versions
      (organization_id,scope,version,instructions,operation,reason,test_fingerprints,author_id,source_rules)
      VALUES ($1,'mission-intake-internal',1,$3::jsonb,'publish','Teste sintético',ARRAY[]::text[],$2,$5::jsonb),
             ($1,'mission-planning',1,$4::jsonb,'publish','Teste sintético',ARRAY[]::text[],$2,$5::jsonb)
      ON CONFLICT (organization_id,scope,version) DO NOTHING`,
    [org, fixtureUsers.yux_admin.id, JSON.stringify({synthesizer:intakeInstruction}),
      JSON.stringify({'funnel_nurture.crm_architect':planningInstruction}), JSON.stringify(sourceRules)])
    await rig.sql('UPDATE public.action_resource_claims SET active=FALSE,released_at=NOW() WHERE organization_id=$1',[org])
    await rig.sql('DELETE FROM public.memberships WHERE user_id=$1 AND organization_id=$2',[fixtureUsers.yux_operator.id,org])
    for (const module of ['action_engine','crm','automations']) await rig.sql(`INSERT INTO public.contract_modules(contract_id,module_key,enabled)
      VALUES($1,$2,TRUE) ON CONFLICT(contract_id,module_key) DO UPDATE SET enabled=TRUE`,[rig.ids.contractA,module])
    await rig.sql(`INSERT INTO public.crm_instances(organization_id,contract_id,status) VALUES($1,$2,'draft')
      ON CONFLICT(contract_id) DO UPDATE SET status='draft'`,[org,rig.ids.contractA])
    const root = `/api/company-intelligence/organizations/${org}/strategies`
    const strategy = await rig.request('client_admin_A','POST',root,{expectedVersion:null,idempotencyKey:randomUUID(),content:{schemaVersion:1,
      title:'Representante de alimentos',objective:'Captar cozinhas industriais',summary:'Distribuição de massas para cozinhas industriais.',
      sections:[{id:randomUUID(),kind:'constraints',title:'Oferta',body:'Massas congeladas com atendimento comercial consultivo.',agentUse:'internal'}],references:{productIds:[],documentIds:[]}}})
    expect(strategy.statusCode).toBe(200)
    const published = await rig.request('client_admin_A','POST',`${root}/${strategy.body.id}/publish`,{expectedVersion:strategy.body.version,
      revisionId:strategy.body.draftRevision.id,expectedContentHash:strategy.body.draftRevision.contentHash,idempotencyKey:randomUUID()})
    await rig.request('client_admin_A','POST',`${root}/${strategy.body.id}/primary`,{expectedVersion:published.body.version})
    const sourceId = strategy.body.draftRevision.id
    const { rows: [source] } = await rig.sql(`SELECT revision_number::text AS version,
      private.company_strategy_projection_v1(content,'internal_operator')::text AS content
      FROM public.company_strategy_revisions WHERE id=$1`, [sourceId])
    const brief: MissionConversationTurnResponseWire['brief'] = {title:'Preparar prospecção',objective:'Preparar CRM, funil e e-mails para cozinhas industriais.',requestedOutcome:'crm_drafts_prepared',
      scopeHints:['crm','automations'],constraints:{icp:'Cozinhas industriais',offer:'Massas congeladas'},acceptanceCriteria:[],
      packKeys:['crm_preparation'],mode:'prepare' as const,deadlineAt:null,maxTotalCostBrl:null,maxHumanHours:null,maxExternalContacts:0}
    for (const role of ['client_admin_A','client_member_A'] as const) {
      const denied = await rig.request(role,'POST','/api/action-engine/mission-conversations',{organizationId:org,message:brief.objective,clientMessageId:randomUUID()},{'idempotency-key':randomUUID()})
      expect(denied.statusCode).toBe(403)
    }
    const accepted = await rig.request('yux_admin','POST','/api/action-engine/mission-conversations',{
      organizationId:org,contractId:rig.ids.contractA,message:brief.objective,clientMessageId:randomUUID()},{'idempotency-key':randomUUID()})
    expect(accepted.statusCode).toBe(202)
    const conversationId = accepted.body.conversation.id
    await within(() => handleActionEngineProcessMissionConversation(pool as never,env,jobs.shift()!.data,{invokeTurn:async(_env,request)=>{
      expect(request.mission_prompt).toEqual({version:1,instructions:{synthesizer:intakeInstruction},source_rules:sourceRules})
      expect(request.allowedActionPacks?.map(item=>item.key)).toContain('crm_preparation')
      expect(request.allowedActionPacks?.map(item=>item.key)).not.toContain('funnel_nurture')
      return {schemaVersion:1,kind:'brief_confirmation',reply:'Confira o plano de preparação, sem envio.',understood:{},questions:[],
        readiness:{status:'ready_for_brief_confirmation',knownFacts:[],assumptions:[],missing:[]},brief,suggestedActions:[],sources:[],
        retrievedSources:[{ref:`customer:strategy:${sourceId}`,id:sourceId,kind:'company_strategy',version:source.version,
          title:'Representante de alimentos',visibility:'internal',displayMode:'named',
          contentHash:hashCanonical({id:sourceId,version:source.version,content:source.content})}],
        retrievalTraceId:randomUUID(),contextHash:'a'.repeat(64),usage:{inputTokens:0,outputTokens:0,totalTokens:0}}
    }}))
    const getChat = () => rig.request('yux_admin','GET',`/api/action-engine/mission-conversations/${conversationId}?organizationId=${org}`)
    const initialChat = (await getChat()).body
    const revisedIcp = 'Cozinhas industriais na Grande São Paulo com retirada agendada'
    const revisionMessage = `Ajuste a prospecção para ${revisedIcp}. Preserve a oferta de massas congeladas.`
    const revised = await rig.request('yux_admin','POST',`/api/action-engine/mission-conversations/${conversationId}/messages`,{
      organizationId:org,expectedVersion:initialChat.version,clientMessageId:randomUUID(),message:revisionMessage,
    })
    expect(revised.statusCode).toBe(202)
    await within(() => handleActionEngineProcessMissionConversation(pool as never,env,jobs.shift()!.data,{
      invokeTurn: async (_env, request, operationId) => {
        expect(request.mission_prompt).toEqual({version:1,instructions:{synthesizer:intakeInstruction},source_rules:sourceRules})
        expect(operationId).toBe(revised.body.conversation.messages.at(-1).id)
        expect(request.user_message).toBe(revisionMessage)
        expect(request.transcript).toEqual([
          {role:'user',content:brief.objective},
          {role:'agent',content:'Confira o plano de preparação, sem envio.'},
          {role:'user',content:revisionMessage},
        ])
        expect(request.currentBrief).toMatchObject({ constraints: brief.constraints })
        return {schemaVersion:1,kind:'brief_confirmation',reply:'Ajustei o público e mantive a oferta de massas congeladas.',
          understood:{},questions:[],readiness:{status:'ready_for_brief_confirmation',knownFacts:[],assumptions:[],missing:[]},
          brief:{...brief,constraints:{...brief.constraints,icp:revisedIcp}},suggestedActions:[],sources:[],
          retrievalTraceId:randomUUID(),contextHash:'b'.repeat(64),usage:{inputTokens:0,outputTokens:0,totalTokens:0}}
      },
    }))
    const chat = (await getChat()).body
    expect(JSON.stringify(chat)).not.toContain(intakeInstruction)
    expect(chat.currentBrief.constraints).toMatchObject({icp:revisedIcp,offer:'Massas congeladas'})
    const confirmation = {organizationId:org,expectedVersion:chat.version,briefHash:chat.briefHash}
    await rig.sql("UPDATE public.crm_instances SET status='paused' WHERE organization_id=$1",[org])
    const unavailable = await rig.request('yux_admin','POST',`/api/action-engine/mission-conversations/${conversationId}/confirm`,confirmation)
    expect(unavailable.statusCode).toBe(409)
    expect(unavailable.body.error).toBe('crm_preparation_crm_unavailable')
    await rig.sql("UPDATE public.crm_instances SET status='draft' WHERE organization_id=$1",[org])
    const confirmed = await rig.request('yux_admin','POST',`/api/action-engine/mission-conversations/${conversationId}/confirm`,confirmation)
    expect(confirmed.statusCode).toBe(202)
    const missionId = confirmed.body.missionId
    const repeated = await rig.request('yux_admin','POST',`/api/action-engine/mission-conversations/${conversationId}/confirm`,confirmation)
    expect(repeated.body.missionId).toBe(missionId)
    const planJob = jobs.find(job=>job.name==='action-engine.planMission')!
    await within(async () => {
      const mission = (await getMission(pool, missionId, org))!
      const catalog = await buildMissionPlanningCatalog(pool, env, mission)
      await rig.sql('UPDATE public.company_strategies SET archived_at=NOW() WHERE id=$1', [strategy.body.id])
      try {
        await expect(buildMissionPlanningContext(pool, mission, catalog)).rejects.toThrow('mission_source_verification_failed:conversation_history')
      } finally {
        await rig.sql('UPDATE public.company_strategies SET archived_at=NULL WHERE id=$1', [strategy.body.id])
      }
    })
    const specificationFingerprint = 'd'.repeat(64)
    const resolvePlanningSpec = async () => ({
      calls: outcome === 'calls_exhausted' ? 9 : 5, fingerprint: specificationFingerprint, profileVersion: 3,
    })
    if (outcome === 'spec_changed' || outcome === 'calls_exhausted') {
      const changed = outcome === 'spec_changed'
      const invoke = async (_url: URL | RequestInfo, init?: RequestInit) => {
        expect(changed).toBe(true)
        expect(new URL(String(_url)).pathname).toBe('/missions/plan-governed')
        expect(new Headers(init?.headers).get('X-YUX-Mission-Planning-Spec')).toBe(specificationFingerprint)
        return Response.json({ detail: 'mission_plan_spec_changed' }, { status: 409 })
      }
      await expect(within(() => handleActionEnginePlanMission(pool as never, env, planJob.data, queue, {
        resolvePlanningSpec,
        invokePlan: (config, input, _fetch, meter, fingerprint) => requestMissionPlan(config, input, invoke, meter, fingerprint),
      }))).rejects.toThrow(changed ? 'mission_plan_spec_changed' : 'planning_budget_exhausted')
      const receipt = await rig.sql(`SELECT cycle.status,cycle.usage,entry.nature,entry.calls
        FROM public.action_planning_cycles cycle JOIN public.action_planning_usage_entries entry ON entry.cycle_id=cycle.id
        WHERE cycle.mission_id=$1 ORDER BY entry.nature`, [missionId])
      expect(receipt.rows).toEqual(changed ? [
        { status: 'cancelled', usage: { calls: 0, inputTokens: 0, outputTokens: 0, costBrl: '0', latencyMs: 0 }, nature: 'release', calls: 0 },
        { status: 'cancelled', usage: { calls: 0, inputTokens: 0, outputTokens: 0, costBrl: '0', latencyMs: 0 }, nature: 'reservation', calls: 5 },
      ] : [])
      const cycle = await rig.sql('SELECT status,terminal_reason FROM public.action_planning_cycles WHERE mission_id=$1', [missionId])
      expect(cycle.rows).toEqual([changed ? { status: 'cancelled', terminal_reason: 'mission_plan_spec_changed' }
        : { status: 'exhausted', terminal_reason: 'planning_budget_calls_exhausted' }])
      const scope = new URLSearchParams({ organizationId: org, contractId: rig.ids.contractA, missionId })
      const history = await rig.request('yux_admin', 'GET', `/api/strategy-engine/agent-prompts/planning-history?${scope}`)
      expect(history.body.executions).toEqual(changed ? [expect.objectContaining({ totalUsd: 0, reconciledBrl: '0', stages: [] })] : [])
      expect((await rig.sql('SELECT id FROM public.action_plans WHERE mission_id=$1', [missionId])).rows).toHaveLength(0)
      expect((await getChat()).body.status).toBe('blocked')
      expect(await rig.providerCalls()).toHaveLength(0)
      return
    }
    if (outcome === 'specialist_failure') {
      const sendFailure: typeof fetch = async (_url, init) => {
        expect(new Headers(init?.headers).get('X-YUX-Mission-Pilot-Usage')).toBe('1')
        return Response.json({ detail: { code: 'funnel_nurture_model_unavailable', planningMeasurements: [
          { node: 'planner', attemptCount: 1, inputTokens: 100, outputTokens: 50,
            reasoningTokens: 6, attemptsWithoutCost: 0, reportedCostUsd: 0.014 },
          { node: 'funnel_nurture.crm_architect', attemptCount: 1, attemptsWithoutCost: 1, reportedCostUsd: null },
        ] } }, { status: 422 })
      }
      const run = () => within(() => handleActionEnginePlanMission(pool as never, env, planJob.data, queue, {
        resolvePlanningSpec,
        invokePlan: (config, input, _fetch, meter, fingerprint) => requestMissionPlan(config, input, sendFailure, meter, fingerprint),
      }))
      await expect(run()).rejects.toThrow('agent_harness_plan_failed:422:funnel_nurture_model_unavailable')
      await expect(run()).resolves.toEqual({ skipped: 'mission_state_changed' })
      const receipt = await rig.sql(`SELECT cycle.status,usage.calls,usage.cost_brl::text,usage.metadata
        FROM public.action_planning_usage_entries usage JOIN public.action_planning_cycles cycle ON cycle.id=usage.cycle_id
        WHERE cycle.mission_id=$1 AND usage.nature='actual'`, [missionId])
      expect(receipt.rows).toHaveLength(1)
      expect(receipt.rows[0]).toMatchObject({ status: 'cancelled', calls: 2, cost_brl: '5.000000', metadata: {
        measurements: { reportedCostUsd: null, knownCostSubtotalUsd: 0.014, pendingReconciliation: true, stages: [
          { node: 'planner', knownInputTokens: 100, reasoningTokens: 6, reportedCostUsd: 0.014 },
          { node: 'funnel_nurture.crm_architect', attemptsWithoutCost: 1, reportedCostUsd: null },
        ] },
      } })
      expect((await rig.sql('SELECT id FROM public.action_plans WHERE mission_id=$1', [missionId])).rows).toHaveLength(0)
      const blocked = (await getChat()).body
      expect(blocked.status).toBe('blocked')
      expect(JSON.stringify(blocked)).not.toMatch(/knownCostSubtotalUsd|planningMeasurements|0\.014/)
      const historyUrl = `/api/strategy-engine/agent-prompts/planning-history?organizationId=${org}&contractId=${rig.ids.contractA}&missionId=${missionId}`
      const history = await rig.request('yux_admin', 'GET', historyUrl)
      expect(history.statusCode, JSON.stringify(history.body)).toBe(200)
      expect(history.body).toEqual({ executions: [{
        id: expect.any(String), startedAt: expect.any(String), revision: planJob.data.requestedVersion,
        state: 'cancelled', reservedBrl: '5.000000', reconciledBrl: null, totalUsd: null, knownSubtotalUsd: 0.014,
        stages: [
          { name: 'planner', attempts: 1, inputTokens: 100, outputTokens: 50, reasoningTokens: 6, confirmedUsd: 0.014 },
          { name: 'funnel_nurture.crm_architect', attempts: 1, inputTokens: null, outputTokens: null, reasoningTokens: null, confirmedUsd: null },
        ],
      }] })
      for (const role of ['yux_operator', 'client_admin_A', 'client_member_A'] as const) {
        const denied = await rig.request(role, 'GET', historyUrl)
        expect(denied.statusCode).toBe(403)
        expect(denied.body).not.toHaveProperty('executions')
      }
      expect((await rig.request('yux_admin', 'GET', historyUrl.replace(org, rig.ids.organizationB))).statusCode).toBe(404)
      expect((await rig.request('yux_admin', 'GET', historyUrl.replace(rig.ids.contractA, rig.ids.contractB))).statusCode).toBe(404)
      expect(await rig.providerCalls()).toHaveLength(0)
      return
    }
    const planResult = await within(() => handleActionEnginePlanMission(pool as never,env,planJob.data,queue,{ resolvePlanningSpec, invokePlan:async(_env,input)=>{
      expect(input.mission_prompt).toEqual({version:1,instructions:{'funnel_nurture.crm_architect':planningInstruction},source_rules:sourceRules})
      expect(input.allowed_source_ids).toContain(sourceId)
      expect(input).toMatchObject({mission:{parameters:{icp:revisedIcp,offer:'Massas congeladas'}}})
      const duplicate = await handleActionEnginePlanMission(pool as never, env, planJob.data, queue, {
        resolvePlanningSpec: async () => { throw new Error('preflight temporarily unavailable') },
        invokePlan: async () => { throw new Error('duplicate reached the planner') },
      })
      expect(duplicate).toEqual({ skipped: 'planning_call_in_progress' })
      const recheck = jobs.filter(job => job.name === 'action-engine.planMission').at(-1)
      expect(recheck?.options?.jobId).toMatch(/^mission-planning-recheck-/)
      expect(recheck?.options?.delay).toBeGreaterThan(0)
      const proposal = crmPreparationProposal(missionId,sourceId)
      proposal.plan.resolvedParameters.icp = revisedIcp
      return { ...proposal, trace: { planningMeasurements: [
        { node: 'planner', attemptCount: 2, inputTokens: 200, outputTokens: 100, reportedCostUsd: null },
        { node: 'crm_architect', attemptCount: 1, inputTokens: 50, outputTokens: 25, reportedCostUsd: 0.01 },
      ] } }
    }}))
    expect(planResult.planId).toBeTruthy()
    const receipts = await rig.sql(`SELECT usage.nature,usage.calls,usage.input_tokens,usage.output_tokens,usage.cost_brl::text,
        usage.specialist_profile,usage.specialist_version
        FROM public.action_planning_usage_entries usage JOIN public.action_planning_cycles cycle ON cycle.id=usage.cycle_id
        WHERE cycle.mission_id=$1 ORDER BY usage.nature`, [missionId])
    expect(receipts.rows).toEqual([
      { nature: 'actual', calls: 3, input_tokens: 250, output_tokens: 125, cost_brl: '5.000000', specialist_profile: 'mission_supervisor', specialist_version: 3 },
      { nature: 'reservation', calls: 5, input_tokens: 12_000, output_tokens: 2_500, cost_brl: '5.000000', specialist_profile: 'mission_supervisor', specialist_version: 3 },
    ])
    const awaiting = (await getChat()).body
    expect(JSON.stringify(awaiting)).not.toContain(planningInstruction)
    expect(JSON.stringify(awaiting)).not.toContain('planningMeasurements')
    expect(awaiting.status).toBe('awaiting_plan_approval')
    const reference = awaiting.messages.at(-1).structuredPayload
    expect(reference.decisionSummary.changes.map((item:any)=>item.quantity)).toEqual([1,1,1,1,1])
    expect(reference.decisionSummary.contactImpact.futureEligibleContacts).toBe(false)
    const approvalBody = {organizationId:org,missionId,approvalId:reference.approvalId,expectedMissionVersion:reference.missionVersion,
      subjectHash:reference.subjectHash,decision:'approved',reason:'Revisado: criar apenas rascunhos.'}
    const approveUrl = `/api/action-engine/plans/${reference.planId}/submit`
    expect((await rig.request('yux_operator','POST',approveUrl,approvalBody)).statusCode).toBe(403)
    await rig.sql("INSERT INTO public.memberships(user_id,organization_id,role_key) VALUES ($1,$2,'yux_manager') ON CONFLICT(user_id,organization_id) DO NOTHING",[fixtureUsers.yux_operator.id,org])
    const approval = await rig.request('yux_operator','POST',approveUrl,approvalBody)
    expect(approval.statusCode,JSON.stringify(approval.body)).toBe(200)
    expect(approval.body.status).toBe('active')
    expect((await getChat()).body.status).toBe('planning')
    expect((await rig.request('yux_admin','POST',approveUrl,approvalBody)).statusCode).toBe(200)
    const execute = async (job: {data: Record<string,unknown>}) => within(() => handleActionEngineExecute(pool as never,queue,job.data,'draft-test',env.ACTION_ENGINE_MUTATION_LEASE_SECRET))
    for (let index=0; index<8; index++) {
      await within(() => handleActionEngineSchedule(pool as never,queue,{missionId}))
      const jobIndex = jobs.findIndex(job=>job.name==='action-engine.executeAction')
      expect(jobIndex,`action index ${index}`).toBeGreaterThanOrEqual(0)
      const actionJob = jobs.splice(jobIndex,1)[0]
      expect(actionJob,`action ${index}`).toBeDefined()
      if (index===3 || index===4 || index===5) {
        if (index===3) await rig.sql("UPDATE public.crm_instances SET status='paused' WHERE organization_id=$1",[org])
        else await rig.sql('UPDATE public.contract_modules SET enabled=FALSE WHERE contract_id=$1 AND module_key=$2',[rig.ids.contractA,index===4?'automations':'action_engine'])
        expect((await execute(actionJob)).status).toBe('blocked')
        const written = await rig.sql('SELECT COUNT(*)::int AS count FROM public.action_mission_command_results WHERE action_run_id=$1',[actionJob.data.actionRunId])
        expect(written.rows[0].count).toBe(0)
        if (index===3) {
          await within(() => handleActionEngineEvaluation(pool as never,{missionId,organizationId:org,checkpointKey:'blocked-before-recovery'},queue))
          expect((await getChat()).body.status).toBe('blocked')
          const state = (await rig.sql('SELECT version FROM public.action_missions WHERE id=$1',[missionId])).rows[0]
          const resumed = await rig.request('yux_admin','POST',`/api/action-engine/missions/${missionId}/resume`,{
            organizationId:org,expectedVersion:state.version,reason:'Retomar após conferir o bloqueio.'})
          expect(resumed.statusCode,JSON.stringify(resumed.body)).toBe(200)
        }
        if (index===3) await rig.sql("UPDATE public.crm_instances SET status='draft' WHERE organization_id=$1",[org])
        else await rig.sql('UPDATE public.contract_modules SET enabled=TRUE WHERE contract_id=$1 AND module_key=$2',[rig.ids.contractA,index===4?'automations':'action_engine'])
        const retry = await rig.request('yux_admin','POST',`/api/action-engine/actions/${actionJob.data.actionRunId}/retry`,{organizationId:org,reason:'Condição corrigida no teste local.'})
        expect(retry.statusCode,JSON.stringify(retry.body)).toBe(200)
        // The same durable action is retried; discard its duplicate queue message in this deterministic harness.
        const duplicateIndex = jobs.findIndex(job=>job.name==='action-engine.executeAction' && job.data.actionRunId===actionJob.data.actionRunId)
        if (duplicateIndex>=0) jobs.splice(duplicateIndex,1)
      }
      const result = await execute(actionJob)
      expect(result.status,JSON.stringify(result)).toBe('succeeded')
      expect((await execute(actionJob)).duplicate).toBe(true)
    }
    await within(() => handleActionEngineCollectMetrics(pool as never,queue,{missionId}))
    await within(() => handleActionEngineEvaluation(pool as never,{missionId,organizationId:org,checkpointKey:'draft-complete'},queue))
    await within(() => handleActionEngineEvaluation(pool as never,{missionId,organizationId:org,checkpointKey:'draft-complete'},queue))
    const complete = (await getChat()).body
    expect(complete.status).toBe('converted')
    expect(complete.messages.filter((m:any)=>m.structuredPayload.crmPreparation==='completed')).toHaveLength(1)
    const counts = (await rig.sql(`SELECT
      (SELECT COUNT(*)::int FROM public.crm_pipeline_versions WHERE mission_id=$1 AND status='draft') AS funnels,
      (SELECT COUNT(*)::int FROM public.email_templates WHERE mission_id=$1 AND status='draft') AS emails,
      (SELECT COUNT(*)::int FROM public.crm_sequences WHERE mission_id=$1 AND is_active=FALSE) AS sequences,
      (SELECT COUNT(*)::int FROM public.automation_flows WHERE mission_id=$1) AS automations,
      (SELECT status FROM public.crm_instances WHERE organization_id=$2) AS crm_status`,[missionId,org])).rows[0]
    expect(counts).toEqual({funnels:1,emails:3,sequences:1,automations:0,crm_status:'draft'})
    const artifacts = await rig.request('yux_admin','GET',`/api/action-engine/missions/${missionId}/artifacts?organizationId=${org}`)
    expect(artifacts.statusCode,JSON.stringify(artifacts.body)).toBe(200)
    expect(artifacts.body).toHaveLength(5)
    expect(artifacts.body.every((item:any)=>item.status==='draft')).toBe(true)
    expect(artifacts.body.filter((item:any)=>item.staleApproval)).toEqual([])
    const controls = await rig.request('yux_admin','GET',`/api/action-engine/missions/${missionId}/operational-controls?organizationId=${org}`)
    expect(controls.statusCode,JSON.stringify(controls.body)).toBe(200)
    expect(Number(controls.body.budget.maximumCostBrl)).toBe(0)
    const sequenceVersion = (await rig.sql('SELECT id,sequence_id,content_hash,snapshot FROM public.crm_sequence_versions WHERE mission_id=$1',[missionId])).rows[0]
    const commandContext = {organizationId:org,missionId,actionRunId:randomUUID(),actorId:fixtureUsers.yux_admin.id,idempotencyKey:randomUUID()}
    await within(async()=>{
      await expect(publishSequenceDraft(pool,commandContext,{sequenceId:sequenceVersion.sequence_id,versionId:sequenceVersion.id,
        expectedContentHash:sequenceVersion.content_hash})).rejects.toThrow('email_provider_unavailable')
      await expect(createSequenceDraft(pool,{...commandContext,organizationId:rig.ids.organizationB},sequenceVersion.snapshot))
        .rejects.toThrow('sequence_template_version_unavailable')
    })
    const foreign = await rig.request('client_admin_B','GET',`/api/action-engine/mission-conversations/${conversationId}?organizationId=${org}`)
    expect(foreign.statusCode).toBe(403)
    expect(await rig.providerCalls()).toHaveLength(0)
  } finally { await pool.end(); await rig.close() }
},120_000)
