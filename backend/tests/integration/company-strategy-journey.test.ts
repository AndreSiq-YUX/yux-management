import {randomUUID} from 'node:crypto'
import pg from 'pg'
import {expect,it} from 'vitest'
import {createIntegrationRig} from './support/rig.js'
import {fixtureUsers} from './support/fixtures.js'
import {createContextAwarePool} from '../../src/db/client.js'
import {runWithDatabaseRequestContext} from '../../src/db/request-context.js'
import {createMissionConversation} from '../../src/modules/action-engine/mission-conversations.js'
import {handleActionEngineProcessMissionConversation} from '../../src/jobs/handlers/action-engine.js'
import {getCompanyStrategyContext} from '../../src/modules/company-strategy/context.js'
import type {AppEnv} from '../../src/config/env.js'
it('runs three distinct strategy journeys without execution, leaks or paid providers',async()=>{
 const rig=await createIntegrationRig({queueMode:'stub'})
 const raw=new pg.Pool({connectionString:rig.serviceDatabaseUrl('yux_worker')})
 const worker=createContextAwarePool(raw,'worker')
 try{
  for(const [title,objective] of [['Representante multimarcas','Captar cozinhas industriais para linhas autorizadas'],['Sites YUX','Captar empresas que precisam de um novo site'],['Oficina mecânica','Aumentar agendamentos de revisões preventivas']]){
   const org=rig.ids.organizationA,root=`/api/company-intelligence/organizations/${org}`
   const content={schemaVersion:1 as const,title,objective,summary:'Definir prioridades por público, região, oferta e condições comerciais.',sections:[{id:randomUUID(),kind:'diagnosis' as const,title:'Diagnóstico interno',body:'Margem reservada e prioridades de negociação.',agentUse:'internal' as const},{id:randomUUID(),kind:'constraints' as const,title:'Orientação ao atendimento',body:'Confirmar disponibilidade e entrega antes de prometer uma oferta.',agentUse:'external_guidance' as const}],references:{productIds:[],documentIds:[]}}
   let turn:any
   await runWithDatabaseRequestContext({role:'client_admin',organizationIds:[org],serviceRole:'worker'},async()=>{
    const conversation=await createMissionConversation(worker,{organizationId:org,title,firstMessage:objective,firstMessageClientId:randomUUID(),createdBy:fixtureUsers.client_admin_A.id,idempotencyKey:randomUUID()})
    turn=await handleActionEngineProcessMissionConversation(worker,{MISSION_CONVERSATIONS_ENABLED:true} as AppEnv,{conversationId:conversation.id,organizationId:org,requestedVersion:conversation.version},{invokeTurn:async()=>({schemaVersion:1,kind:'message',reply:'Proposta consultiva disponível para revisão.',understood:{},questions:[],readiness:{status:'needs_information',knownFacts:[],assumptions:[],missing:[]},brief:{packKeys:[],scopeHints:[],constraints:{},acceptanceCriteria:[]},suggestedActions:[],sources:[],strategyProposal:{content,sourceRefs:[]},retrievalTraceId:randomUUID(),contextHash:'e'.repeat(64),usage:{inputTokens:0,outputTokens:0,totalTokens:0}})})
   })
   expect(turn.blocked).not.toBe(true)
   expect(turn.conversation.missionId).toBeFalsy()
   const reference=turn.conversation.messages.at(-1).structuredPayload.strategyProposalReference
   const draft=await rig.request('client_admin_A','POST',`${root}/strategy-proposals/${reference.proposalId}/apply`,{expectedStrategyVersion:null,idempotencyKey:randomUUID()})
   expect(draft.statusCode).toBe(200)
   expect(draft.body.publishedRevision).toBeNull()
   const publish=async(strategy:any)=>rig.request('client_admin_A','POST',`${root}/strategies/${strategy.id}/publish`,{expectedVersion:strategy.version,revisionId:strategy.draftRevision.id,expectedContentHash:strategy.draftRevision.contentHash,idempotencyKey:randomUUID()})
   const first=(await publish(draft.body)).body
   const context=async(profileKey:string,audience:'client_user'|'external_contact')=>runWithDatabaseRequestContext({role:'client_admin',organizationIds:[org],serviceRole:'worker'},()=>getCompanyStrategyContext(worker,{organizationId:org,profileKey,audience,query:objective,strategyIds:[first.id]}))
   const missions=await context('growth_strategist','client_user'),marketing=await context('copywriter','client_user'),sdr=await context('ai_sdr_comercial_1','external_contact')
   for(const result of [missions,marketing,sdr])expect(result.context.selected[0].revisionId).toBe(first.publishedRevision.id)
   expect(JSON.stringify(sdr)).not.toContain('Margem reservada')
   const manual=(await rig.request('client_admin_A','PUT',`${root}/strategies/${first.id}/draft`,{expectedVersion:first.version,content:{...content,summary:'Uma direção revisada ainda não publicada para os agentes.'},idempotencyKey:randomUUID()})).body
   expect((await context('copywriter','client_user')).context.selected[0].revisionId).toBe(first.publishedRevision.id)
   const second=(await publish(manual)).body
   expect((await context('growth_strategist','client_user')).context.selected[0].revisionId).toBe(second.publishedRevision.id)
   const history=(await rig.request('client_admin_A','GET',`${root}/strategies/${first.id}/revisions`)).body
   expect(history.find((item:any)=>item.id===first.publishedRevision.id).content.summary).toBe(content.summary)
  }
  expect(await rig.providerCalls()).toHaveLength(0)
 }finally{await raw.end();await rig.close()}
})
