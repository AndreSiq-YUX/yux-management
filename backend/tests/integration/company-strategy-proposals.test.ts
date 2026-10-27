import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { expect,it } from 'vitest'
import { createIntegrationRig } from './support/rig.js'
import { fixtureUsers } from './support/fixtures.js'
import { createContextAwarePool } from '../../src/db/client.js'
import { runWithDatabaseRequestContext } from '../../src/db/request-context.js'
import { createMissionConversation } from '../../src/modules/action-engine/mission-conversations.js'
import { handleActionEngineProcessMissionConversation } from '../../src/jobs/handlers/action-engine.js'
import type { AppEnv } from '../../src/config/env.js'
const content={schemaVersion:1 as const,title:'Estratégia para oficina',objective:'Aumentar agendamentos de revisão',summary:'Priorizar revisões preventivas e retorno dos clientes.',sections:[],references:{productIds:[],documentIds:[]}}
it('persists a real mission proposal atomically, replays safely and applies only an authorized draft',async()=>{
  const rig=await createIntegrationRig({queueMode:'stub'})
  const rawWorker=new pg.Pool({connectionString:rig.serviceDatabaseUrl('yux_worker')})
  const worker=createContextAwarePool(rawWorker,'worker')
  const org=rig.ids.organizationA,root=`/api/company-intelligence/organizations/${org}`
  try {
    let updated:any
    await runWithDatabaseRequestContext({role:'client_admin',organizationIds:[org],serviceRole:'worker'},async()=>{
      const conversation=await createMissionConversation(worker,{organizationId:org,title:'Construir estratégia',firstMessage:'Quero definir a estratégia da empresa sem executar campanhas.',firstMessageClientId:randomUUID(),createdBy:fixtureUsers.client_admin_A.id,idempotencyKey:randomUUID()})
      updated=await handleActionEngineProcessMissionConversation(worker,{MISSION_CONVERSATIONS_ENABLED:true} as AppEnv,{organizationId:org,conversationId:conversation.id,requestedVersion:conversation.version},{invokeTurn:async()=>({schemaVersion:1,kind:'message',reply:'Preparei uma proposta de estratégia para revisão.',understood:{},questions:[],readiness:{status:'needs_information',knownFacts:[],assumptions:[],missing:[]},brief:{packKeys:[],scopeHints:[],constraints:{},acceptanceCriteria:[]},suggestedActions:[],sources:[],strategyProposal:{content,sourceRefs:[]},retrievalTraceId:randomUUID(),contextHash:'a'.repeat(64),usage:{inputTokens:0,outputTokens:0,totalTokens:0}})})
    })
    expect(updated.blocked).not.toBe(true)
    const agent=updated.conversation.messages.find((message:any)=>message.actorType==='agent')
    const reference=agent.structuredPayload.strategyProposalReference
    expect(reference.proposalId).toMatch(/^[a-f0-9-]{36}$/)
    expect(updated.conversation.missionId).toBeFalsy()
    const proposal=await rig.request('client_admin_A','GET',`${root}/strategy-proposals/${reference.proposalId}`)
    expect(proposal.statusCode).toBe(200)
    expect(proposal.body.content.title).toBe('Estratégia para oficina')
    const command={expectedStrategyVersion:null,idempotencyKey:randomUUID(),reviewedContent:{...content,title:'Estratégia revisada da oficina'}}
    const applied=await rig.request('client_admin_A','POST',`${root}/strategy-proposals/${reference.proposalId}/apply`,command)
    expect(applied.statusCode).toBe(200)
    expect(applied.body.publishedRevision).toBeNull()
    expect(applied.body.draftRevision.content.title).toBe('Estratégia revisada da oficina')
    const replay=await rig.request('client_admin_A','POST',`${root}/strategy-proposals/${reference.proposalId}/apply`,command)
    expect(replay.body.draftRevision.id).toBe(applied.body.draftRevision.id)
    expect((await rig.request('client_member_A','POST',`${root}/strategy-proposals/${reference.proposalId}/apply`,command)).statusCode).toBe(403)
    expect((await rig.request('client_admin_B','GET',`/api/company-intelligence/organizations/${rig.ids.organizationB}/strategy-proposals/${reference.proposalId}`)).statusCode).toBe(404)
    expect((await rig.sql('SELECT id FROM public.company_strategy_publications WHERE strategy_id=$1',[applied.body.id])).rows).toHaveLength(0)
    expect(await rig.providerCalls()).toHaveLength(0)
  } finally {await rawWorker.end();await rig.close()}
})

it('opens authorized review with the exact draft and refuses stale proposals after a manual change',async()=>{
  const jobs:any[]=[]
  const rig=await createIntegrationRig({queueMode:'stub',missionConversations:true,stubJobQueue:{async add(name,data){jobs.push({name,data});return {id:'synthetic'}},async close(){}}})
  const raw=new pg.Pool({connectionString:rig.serviceDatabaseUrl('yux_worker')})
  const worker=createContextAwarePool(raw,'worker')
  const org=rig.ids.internalOrg,root=`/api/company-intelligence/organizations/${org}`
  try {
    const created=await rig.request('yux_admin','POST',`${root}/strategies`,{content,expectedVersion:null,idempotencyKey:randomUUID()})
    expect(created.statusCode).toBe(200)
    const strategy=created.body
    const command={expectedVersion:strategy.version,revisionId:strategy.draftRevision.id,message:'Melhore o posicionamento sem executar ações.',clientMessageId:randomUUID()}
    const opened=await rig.request('yux_admin','POST',`${root}/strategies/${strategy.id}/review-conversation`,command)
    expect(opened.statusCode).toBe(202)
    expect(jobs[0].name).toBe('action-engine.processMissionConversation')
    expect(opened.body.conversation.currentBrief.companyStrategyReview.revisionId).toBe(strategy.draftRevision.id)
    let result:any
    await runWithDatabaseRequestContext({role:'yux_admin',organizationIds:[org],serviceRole:'worker'},async()=>{
      result=await handleActionEngineProcessMissionConversation(worker,{MISSION_CONVERSATIONS_ENABLED:true} as AppEnv,jobs[0].data,{invokeTurn:async(_env,request)=>{
        expect(request.operationalContext?.companyStrategyReview).toMatchObject({workingDraft:content})
        return {schemaVersion:1,kind:'message',reply:'Proposta de revisão preparada.',understood:{},questions:[],readiness:{status:'needs_information',knownFacts:[],assumptions:[],missing:[]},brief:{packKeys:[],scopeHints:[],constraints:{},acceptanceCriteria:[]},suggestedActions:[],sources:[],strategyProposal:{strategyId:strategy.id,baseRevisionId:strategy.draftRevision.id,baseStrategyVersion:strategy.version,content:{...content,title:'Revisão do agente'},sourceRefs:[]},retrievalTraceId:randomUUID(),contextHash:'b'.repeat(64),usage:{inputTokens:0,outputTokens:0,totalTokens:0}}
      }})
    })
    expect(result.blocked).not.toBe(true)
    const reference=result.conversation.messages.at(-1).structuredPayload.strategyProposalReference
    expect(reference.proposalId).toBeTruthy()
    expect(result.conversation.currentBrief.companyStrategyReview.revisionId).toBe(strategy.draftRevision.id)
    const manual=await rig.request('yux_admin','PUT',`${root}/strategies/${strategy.id}/draft`,{content:{...content,title:'Edição manual mais recente'},expectedVersion:strategy.version,idempotencyKey:randomUUID()})
    expect(manual.statusCode).toBe(200)
    const stale=await rig.request('yux_admin','POST',`${root}/strategy-proposals/${reference.proposalId}/apply`,{expectedStrategyVersion:strategy.version,idempotencyKey:randomUUID()})
    expect(stale.statusCode).toBe(409)
    expect((await rig.request('yux_admin','GET',`${root}/strategies/${strategy.id}`)).body.draftRevision.content.title).toBe('Edição manual mais recente')
    expect((await rig.request('yux_admin','POST',`${root}/strategies/${strategy.id}/review-conversation`,command)).statusCode).toBe(409)
    expect(await rig.providerCalls()).toHaveLength(0)
  } finally {await raw.end();await rig.close()}
})
