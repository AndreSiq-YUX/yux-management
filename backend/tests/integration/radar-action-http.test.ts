import { expect,it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { createIntegrationRig } from './support/rig.js'

it('offers Radar only to the current Admin on an enabled organization and rejects direct unauthorized intents',async()=>{
 const rig=await createIntegrationRig({queueMode:'stub',radarActionEngine:true})
 try{
  await rig.sql("INSERT INTO public.contract_modules(contract_id,module_key,enabled) VALUES($1,'radar',TRUE),($1,'action_engine',TRUE) ON CONFLICT(contract_id,module_key) DO UPDATE SET enabled=TRUE",[rig.ids.contractA])
  await rig.sql("INSERT INTO public.memberships(user_id,organization_id,role_key) VALUES('40000000-0000-4000-8000-000000000002',$1,'yux_manager') ON CONFLICT(user_id,organization_id) DO NOTHING",[rig.ids.organizationA])
  const intent={organizationId:rig.ids.organizationA,contractId:rig.ids.contractA,objective:'Pesquisar empresas no Radar Comercial',mode:'assisted',quickStart:'radar_prospecting',
   allowedModules:['radar'],maxTotalCostBrl:'50',maxHumanHours:'1',deadlineAt:new Date(Date.now()+86400000).toISOString(),
   radarParameters:{campaign:{name:'Pesquisa assistida',targetSegment:'Indústria',targetStates:['PR'],offerType:'Consultoria'},requestedCount:10}}
  let missionId=''
  const approvalId=randomUUID()
  for(const role of ['yux_admin','yux_operator','client_admin_A','client_member_A'] as const){
   const catalog=await rig.request(role,'GET',`/api/action-engine/action-pack-catalog?organizationId=${rig.ids.organizationA}`)
   expect(catalog.statusCode,role+JSON.stringify(catalog.body)).toBe(200)
   expect(catalog.body.some((pack:{key:string})=>pack.key==='radar_prospecting')).toBe(role==='yux_admin')
   const result=await rig.request(role,'POST','/api/action-engine/missions/intents',intent,{'idempotency-key':`radar-http-${role}`})
   expect(result.statusCode,JSON.stringify(result.body)).toBe(role==='yux_admin'?201:403)
   if(role==='yux_admin'){
    expect(result.body.packSelection.packs[0].key).toBe('radar_prospecting')
    missionId=result.body.id
    await rig.sql("INSERT INTO public.action_approvals(id,organization_id,mission_id,approval_type,subject_hash,requested_payload) VALUES($1,$2,$3,'action',$4,$5::jsonb)",[approvalId,rig.ids.organizationA,missionId,'a'.repeat(64),JSON.stringify({commercialPreview:{campaignName:'CNPJá Comércio',requestedCount:25,targetStates:['PR'],configurationRevision:2,criteriaRevision:3,maximumBudgetBrl:'50',provider:{token:'private-secret'}}})])
   }
   const approvals=await rig.request(role,'GET',`/api/action-engine/missions/${missionId}/approvals?organizationId=${rig.ids.organizationA}`)
   expect(approvals.statusCode,role+JSON.stringify(approvals.body)).toBe(200)
   const preview=approvals.body.find((item:{id:string})=>item.id===approvalId)?.requestedPayload.commercialPreview
   expect(preview).toMatchObject({campaignName:'CNPJá Comércio',requestedCount:25,targetStates:['PR']})
   expect(preview.maximumBudgetBrl).toBe(role==='yux_admin'?'50':undefined)
   expect(JSON.stringify(preview)).not.toContain('private-secret')
  }
  const other=await rig.request('yux_admin','POST','/api/action-engine/missions/intents',{...intent,organizationId:rig.ids.organizationB,contractId:rig.ids.contractB},{'idempotency-key':'other-org'})
  expect(other.statusCode).toBe(403)
  for(const mode of ['autonomous','shadow','prepare']){
   const unavailable=await rig.request('yux_admin','POST','/api/action-engine/missions/intents',{...intent,mode},{'idempotency-key':mode})
   expect(unavailable.statusCode,mode+JSON.stringify(unavailable.body)).toBe(403)
  }
  const ambiguous=await rig.request('yux_admin','POST','/api/action-engine/missions/intents',{...intent,quickStart:undefined,objective:'Crie uma campanha'},{'idempotency-key':'ambiguous'})
  expect(ambiguous.statusCode).toBe(409)
  expect(await rig.providerCalls()).toHaveLength(0)
 }finally{await rig.close()}
})
