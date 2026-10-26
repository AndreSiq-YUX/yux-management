import {randomUUID} from 'node:crypto'
import pg from 'pg'
import {expect,it} from 'vitest'
import {createIntegrationRig} from './support/rig.js'
import {fixtureUsers} from './support/fixtures.js'
import {createContextAwarePool} from '../../src/db/client.js'
import {runWithDatabaseRequestContext} from '../../src/db/request-context.js'
import {createMissionConversation,completeAgentConversationTurn} from '../../src/modules/action-engine/mission-conversations.js'
it('protects the entire private strategy conversation at HTTP and PostgreSQL boundaries',async()=>{
 const rig=await createIntegrationRig({queueMode:'stub',missionConversations:true})
 const raw=new pg.Pool({connectionString:rig.serviceDatabaseUrl('yux_worker')}),db=createContextAwarePool(raw,'worker')
 const reader=new pg.Pool({connectionString:rig.serviceDatabaseUrl('yux_api')})
 const org=rig.ids.organizationA,actor=fixtureUsers.client_admin_A.id
 try{
  await rig.sql("INSERT INTO public.contract_modules(contract_id,module_key,enabled) SELECT id,'action_engine',true FROM public.contracts WHERE client_id IN (SELECT client_id FROM public.organizations WHERE id IN ($1,$2)) ON CONFLICT(contract_id,module_key) DO UPDATE SET enabled=true",[org,rig.ids.organizationB])
  await rig.sql("INSERT INTO public.memberships(user_id,organization_id,role_key) VALUES($1,$2,'yux_manager') ON CONFLICT(user_id,organization_id) DO UPDATE SET role_key='yux_manager'",[fixtureUsers.yux_operator.id,org])
  const conversations:any[]=[]
  await runWithDatabaseRequestContext({role:'client_admin',organizationIds:[org],serviceRole:'worker'},async()=>{
   for(const kind of ['ordinary','review','proposal']){
    const conversation=await createMissionConversation(db,{organizationId:org,title:kind==='review'?'Título reservado do rascunho':kind,firstMessage:'Conversa de homologação',firstMessageClientId:randomUUID(),createdBy:actor,idempotencyKey:randomUUID(),...(kind==='review'?{initialBrief:{companyStrategyReview:{strategyId:randomUUID(),revisionId:randomUUID(),expectedVersion:1}}}:{})})
    const turn=await completeAgentConversationTurn(db,{organizationId:org,conversationId:conversation.id,expectedVersion:conversation.version,status:'awaiting_user',messageKind:'text',content:kind==='ordinary'?'Resposta comum':'Trecho reservado da estratégia não publicada',structuredPayload:kind==='proposal'?{strategyProposal:{content:{schemaVersion:1,title:'Estratégia privada',objective:'Proteger as informações em revisão',summary:'Esta estratégia não publicada deve permanecer privada.',sections:[],references:{productIds:[],documentIds:[],representedBusinessIds:[]}},sourceRefs:[]}}:{},sourceRefs:[],harnessRunId:randomUUID(),contextHash:'d'.repeat(64),currentBrief:{},contextReadiness:{},...(kind==='proposal'?{strategyProposalAccess:{organizationId:org,actorId:actor,role:'client_admin' as const}}:{})})
    conversations.push({...turn,kind})
   }
  })
  for(const role of ['yux_admin','yux_operator','client_admin_A','client_member_A'] as const){
   const list=await rig.request(role,'GET',`/api/action-engine/mission-conversations?organizationId=${org}`)
   expect(list.statusCode,role).toBe(200)
   for(const conversation of conversations){
    const allowed=role!=='client_member_A'||conversation.kind==='ordinary'
    expect(list.body.some((item:any)=>item.id===conversation.id)).toBe(allowed)
    const response=await rig.request(role,'GET',`/api/action-engine/mission-conversations/${conversation.id}?organizationId=${org}`)
    expect(response.statusCode).toBe(allowed?200:404)
    if(!allowed)expect(JSON.stringify(response.body)).not.toContain('reservado')
   }
  }
  for(const role of ['yux_admin','yux_operator','client_admin','client_member']){
   const client=await reader.connect()
   try{
    await client.query('BEGIN');await client.query("SELECT set_config('app.service_role','api',true),set_config('app.current_role',$1,true),set_config('app.current_orgs',$2,true)",[role,`{${org}}`])
    for(const conversation of conversations){
     const expected=role!=='client_member'||conversation.kind==='ordinary'
     expect((await client.query('SELECT id FROM public.action_mission_conversations WHERE id=$1',[conversation.id])).rows.length>0).toBe(expected)
     expect((await client.query('SELECT content,structured_payload FROM public.action_mission_conversation_messages WHERE conversation_id=$1',[conversation.id])).rows.length>0).toBe(expected)
    }
   }finally{await client.query('ROLLBACK');client.release()}
  }
  expect((await rig.request('client_admin_B','GET',`/api/action-engine/mission-conversations/${conversations[2].id}?organizationId=${rig.ids.organizationB}`)).statusCode).toBe(404)
 }finally{await reader.end();await raw.end();await rig.close()}
})
