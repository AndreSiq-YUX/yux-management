import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { expect, it } from 'vitest'
import { createIntegrationRig } from './support/rig.js'
import { fixtureUsers } from './support/fixtures.js'
import { createContextAwarePool } from '../../src/db/client.js'
import { runWithDatabaseRequestContext } from '../../src/db/request-context.js'
import type { MissionConversationTurnResponseWire } from '../../src/modules/action-engine/generated/mission-wire.js'
import type { AppEnv } from '../../src/config/env.js'
import { handleActionEngineProcessMissionConversation, handleActionEnginePlanMission, handleActionEngineSchedule,
  handleActionEngineExecute, handleActionEngineCollectMetrics, handleActionEngineEvaluation } from '../../src/jobs/handlers/action-engine.js'
import { crmPreparationProposal } from '../support/crm-preparation-fixture.js'
import { createSequenceDraft, publishSequenceDraft } from '../../src/modules/automations/mission-commands.js'

it('creates and reviews real drafts through conversation without a sender, with retries, tenant isolation and activation gates', async () => {
  const jobs: Array<{name: string; data: Record<string, unknown>}> = []
  const queue = { async add(name: string, data: Record<string, unknown>) { jobs.push({name,data}); return {id: randomUUID()} }, async close() {} }
  const rig = await createIntegrationRig({queueMode: 'stub', missionConversations: true, stubJobQueue: queue})
  const pool = createContextAwarePool(new pg.Pool({connectionString: rig.serviceDatabaseUrl('yux_worker')}), 'worker')
  const org = rig.ids.organizationA
  const within = <T>(work: () => Promise<T>) => runWithDatabaseRequestContext({role:'yux_admin',organizationIds:[org],serviceRole:'worker'},work)
  const env = {MISSION_CONVERSATIONS_ENABLED:true, YUX_AGENT_RUNTIME_URL:'http://simulated.invalid',YUX_AGENT_RUNTIME_TOKEN:'fixture',
    ACTION_ENGINE_MUTATION_LEASE_SECRET:'integration-mutation-lease-secret-32-chars'} as AppEnv
  try {
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
      expect(request.allowedActionPacks?.map(item=>item.key)).toContain('crm_preparation')
      expect(request.allowedActionPacks?.map(item=>item.key)).not.toContain('funnel_nurture')
      return {schemaVersion:1,kind:'brief_confirmation',reply:'Confira o plano de preparação, sem envio.',understood:{},questions:[],
        readiness:{status:'ready_for_brief_confirmation',knownFacts:[],assumptions:[],missing:[]},brief,suggestedActions:[],sources:[],
        retrievalTraceId:randomUUID(),contextHash:'a'.repeat(64),usage:{inputTokens:0,outputTokens:0,totalTokens:0}}
    }}))
    const getChat = () => rig.request('yux_admin','GET',`/api/action-engine/mission-conversations/${conversationId}?organizationId=${org}`)
    const chat = (await getChat()).body
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
    const planResult = await within(() => handleActionEnginePlanMission(pool as never,env,planJob.data,queue,{invokePlan:async(_env,input)=>{
      expect(input.allowed_source_ids).toContain(sourceId)
      return crmPreparationProposal(missionId,sourceId)
    }}))
    expect(planResult.planId).toBeTruthy()
    const awaiting = (await getChat()).body
    expect(awaiting.status).toBe('awaiting_plan_approval')
    const reference = awaiting.messages.at(-1).structuredPayload
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


