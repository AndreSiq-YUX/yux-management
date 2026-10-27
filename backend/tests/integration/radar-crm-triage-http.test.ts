import {randomUUID} from 'node:crypto'
import {it,expect} from 'vitest'
import {createIntegrationRig} from './support/rig.js'

it('delivers discovery triage over HTTP only for YUX admin, with scoped commercial customer data',async()=>{
 const rig=await createIntegrationRig({queueMode:'stub'})
 try{
  const org=rig.ids.organizationA
  for(const key of ['crm','radar'])await rig.sql(`INSERT INTO public.contract_modules(contract_id,module_key,enabled) VALUES($1,$2,TRUE) ON CONFLICT(contract_id,module_key) DO UPDATE SET enabled=TRUE`,[rig.ids.contractA,key])
  const instance=(await rig.sql(`INSERT INTO public.crm_instances(organization_id,contract_id,status) VALUES($1,$2,'active') ON CONFLICT(contract_id) DO UPDATE SET status='active' RETURNING id`,[org,rig.ids.contractA])).rows[0].id
  const pipeline=(await rig.sql(`INSERT INTO public.crm_pipelines(organization_id,crm_instance_id,name,is_active) VALUES($1,$2,$3,TRUE) RETURNING id`,[org,instance,`HTTP triage ${randomUUID()}`])).rows[0].id
  const stage=(await rig.sql(`INSERT INTO public.crm_pipeline_stages(pipeline_id,key,name,order_index,is_active) VALUES($1,'discovery','Descobertas a qualificar',0,TRUE) RETURNING id`,[pipeline])).rows[0].id
  const campaign=(await rig.sql(`INSERT INTO public.radar_campaigns(organization_id,name,campaign_type,target_segment,offer_type,target_states) VALUES($1,$2,'regional_b2b','Empresas','Alimentos',ARRAY['SP']) RETURNING id`,[org,`HTTP triage ${randomUUID()}`])).rows[0].id
  const candidate=(await rig.sql(`INSERT INTO public.radar_candidate_records(organization_id,campaign_id,source_type,title,dedupe_key,normalized_payload) VALUES($1,$2,'manual','Brave Transportes',$3,$4::jsonb) RETURNING id`,[org,campaign,randomUUID(),JSON.stringify({targetStatus:'review',provider:'private-provider',apiKey:'private-key',cnpj:'12345678000190'})])).rows[0].id
  const url=`/api/radar/campaigns/${campaign}/deliver-to-crm`
  const body={organizationId:org,configurationRevision:1,candidateIds:[candidate],destination:{crmInstanceId:instance,pipelineId:pipeline,stageId:stage},requestId:randomUUID(),deliveryMode:'discovery_triage'}
  for(const role of ['yux_operator','client_admin_A','client_member_A'] as const)expect((await rig.request(role,'POST',url,body)).statusCode).toBe(403)
  expect((await rig.request('yux_admin','POST',url,{...body,destination:{...body.destination,stageId:randomUUID()}})).statusCode).toBe(403)
  const result=await rig.request('yux_admin','POST',url,body)
  expect(result.statusCode).toBe(200);expect(result.body.items[0].status).toBe('created')
  const leadId=result.body.items[0].leadId
  for(const role of ['yux_admin','yux_operator','client_admin_A','client_member_A'] as const){
   const list=await rig.request(role,'GET',`/api/crm/leads?organizationId=${org}&pipelineId=${pipeline}`)
   expect(list.statusCode).toBe(200)
   const lead=list.body.find((item:any)=>item.id===leadId)
   expect(lead.name).toBe('Brave Transportes')
   expect(lead.attributionContext).toMatchObject({radarCnpj:'12345678000190',qualificationStatus:'pending'})
   expect(JSON.stringify(lead)).not.toMatch(/private-provider|private-key|apiKey/)
  }
  const foreign=await rig.request('client_admin_B','GET',`/api/crm/leads?organizationId=${org}&pipelineId=${pipeline}`)
  expect(foreign.statusCode).toBe(200);expect(foreign.body).toEqual([])
 }finally{await rig.close()}
},30000)
