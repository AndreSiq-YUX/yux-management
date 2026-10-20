import {describe,expect,it} from 'vitest'
import {randomUUID} from 'node:crypto'
import {captureFixture,connectionString,organizationId,admin} from '../support/radar-capture-fixture.js'
import pg from 'pg'
import {buildServer} from '../../src/server.js'
import {createContextAwarePool} from '../../src/db/client.js'
import {fixtureUsers,fixturePassword} from './support/fixtures.js'
import {runWithDatabaseRequestContext} from '../../src/db/request-context.js'
import {startRadarCaptureOperation,getRadarCaptureOperation} from '../../src/modules/radar/capture-operation.js'
import {dispatchRadarResearchRequest} from '../../src/modules/radar/research-requests.js'
import {executeRadarCandidateResearch} from '../../src/modules/radar/research-service.js'
const api=await import('../../src/modules/radar/administrative-research.js') as Record<string,any>

async function pausedGroup(){
 const f=await captureFixture(),receiptIds:string[]=[],candidateIds:string[]=[],routeIds:string[]=[]
 await f.pool.query(`UPDATE public.radar_campaigns SET search_configuration=jsonb_set(jsonb_set(search_configuration,'{research,presenceResolutionEnabled}','true'),'{research,semanticQualificationEnabled}','true') WHERE id=$1`,[f.campaign.id])
 for(const action of ['radar_presence_resolution','radar_business_qualification'])routeIds.push((await f.pool.query(`INSERT INTO public.model_routing_rules(agent_type,organization_id,provider,model_name,max_input_tokens,max_output_tokens) VALUES($1,$2,'openrouter','fixture-approved',16000,8000) RETURNING id`,[action,organizationId])).rows[0].id)
 for(let i=0;i<7;i++){
  const candidate=(await f.pool.query(`INSERT INTO public.radar_candidate_records(organization_id,campaign_id,source_type,title,dedupe_key,normalized_payload) VALUES($1,$2,'manual',$3,$4,'{}') RETURNING id`,[organizationId,f.campaign.id,`Empresa recuperação ${i}`,randomUUID()])).rows[0]
  const run=(await f.pool.query(`INSERT INTO public.radar_candidate_research_runs(organization_id,campaign_id,candidate_id,requested_by,configuration_revision,status) VALUES($1,$2,$3,$4,1,'blocked') RETURNING id`,[organizationId,f.campaign.id,candidate.id,admin.id])).rows[0]
  const key=i===6?'presence':'semantic',action=key==='presence'?'radar_presence_resolution':'radar_business_qualification',digest='a'.repeat(64),requestId=`${run.id}${key==='presence'?':presence':''}:${digest}`
  await f.pool.query('UPDATE public.radar_candidate_research_runs SET calls=$2 WHERE id=$1',[run.id,JSON.stringify({[key]:{status:'uncertain',source:action,evidenceHash:digest,requestId}})])
  const owner=randomUUID(),receipt=(await f.pool.query(`INSERT INTO public.radar_analysis_receipts(organization_id,action,request_id,input_hash,owner_token,status,input_request) VALUES($1,$2,$3,$4,$5,'uncertain','{}') RETURNING id`,[organizationId,action,requestId,digest,owner])).rows[0]
  candidateIds.push(candidate.id);receiptIds.push(receipt.id)
  if(i<2)await f.pool.query(`INSERT INTO public.radar_effect_receipts(organization_id,effect_key,attempt,analysis_receipt_id,owner_token,input_hash,lease_until,transport_outcome,validation_outcome,billing_outcome,response_body,usage,failure_code) VALUES($1,$2,1,$3,$4,$5,NOW()-INTERVAL '1 minute','received','invalid','known',$6,'{"costUsd":0.001}','output_truncated')`,[organizationId,randomUUID(),receipt.id,owner,digest,JSON.stringify({content:'{"targetStatus":',finish_reason:'length'})])
 }
 const input={organizationId,campaignId:f.campaign.id,configurationRevision:1,requestId:randomUUID(),expiresAt:new Date(Date.now()+3600000).toISOString(),acknowledgePreviousChargeMayExist:true,receiptIds}
 return{...f,receiptIds,candidateIds,routeIds,input,async close(){await f.pool.query('DELETE FROM public.radar_analysis_retry_authorizations WHERE campaign_id=$1',[f.campaign.id]);await f.pool.query('DELETE FROM public.radar_analysis_receipts WHERE id=ANY($1::uuid[])',[receiptIds]);await f.pool.query('DELETE FROM public.model_routing_rules WHERE id=ANY($1::uuid[])',[routeIds]);await f.close()}}
}
describe.skipIf(!connectionString)('administrative resume from seven mixed blocked analyses',()=>{
 it('registers all seven atomically per analysis and reuses grants and durable requests after reload',async()=>{
  expect(api.resumeRadarAdministrativeResearch).toBeTypeOf('function')
  const f=await pausedGroup()
  try{
   const first=await api.resumeRadarAdministrativeResearch(f.pool,admin,f.input)
   expect(first.items.map((item:any)=>item.state)).toEqual(Array(7).fill('queued'))
   const again=await api.resumeRadarAdministrativeResearch(f.pool,admin,{...f.input,requestId:randomUUID()})
   expect(again.items.map((item:any)=>item.requestId)).toEqual(first.items.map((item:any)=>item.requestId))
   for(const table of ['radar_analysis_retry_authorizations','radar_research_requests','radar_capture_outbox'])expect(Number((await f.pool.query(`SELECT COUNT(*) n FROM public.${table} WHERE campaign_id=$1`,[f.campaign.id])).rows[0].n)).toBe(7)
   expect((await f.pool.query("SELECT status FROM public.radar_analysis_receipts WHERE id=ANY($1::uuid[])",[f.receiptIds])).rows.every(row=>row.status==='uncertain')).toBe(true)
   expect(Number((await f.pool.query('SELECT COUNT(*) n FROM public.radar_effect_receipts WHERE analysis_receipt_id=ANY($1::uuid[])',[f.receiptIds])).rows[0].n)).toBe(2)
  }finally{await f.close()}
 })
 it('reuses one grant and one durable request per analysis when two tabs resume concurrently',async()=>{
  const f=await pausedGroup()
  try{
   const [first,second]=await Promise.all([api.resumeRadarAdministrativeResearch(f.pool,admin,f.input),api.resumeRadarAdministrativeResearch(f.pool,admin,{...f.input,requestId:randomUUID()})])
   expect(first.items.every((item:any)=>item.state==='queued')).toBe(true)
   expect(second.items.map((item:any)=>item.requestId)).toEqual(first.items.map((item:any)=>item.requestId))
   for(const table of ['radar_analysis_retry_authorizations','radar_research_requests','radar_capture_outbox'])expect(Number((await f.pool.query(`SELECT COUNT(*) n FROM public.${table} WHERE campaign_id=$1`,[f.campaign.id])).rows[0].n)).toBe(7)
  }finally{await f.close()}
 })
 it('keeps six resumable companies moving when one stage is disabled and returns its exact reason',async()=>{
  expect(api.resumeRadarAdministrativeResearch).toBeTypeOf('function')
  const f=await pausedGroup()
  try{
   await f.pool.query(`UPDATE public.radar_campaigns SET search_configuration=jsonb_set(search_configuration,'{research,presenceResolutionEnabled}','false') WHERE id=$1`,[f.campaign.id])
   const result=await api.resumeRadarAdministrativeResearch(f.pool,admin,f.input)
   expect(result.items.filter((item:any)=>item.state==='queued')).toHaveLength(6)
   expect(result.items.find((item:any)=>item.receiptId===f.receiptIds[6])).toMatchObject({state:'waiting',reason:'radar_analysis_retry_stage_disabled'})
   expect(Number((await f.pool.query('SELECT COUNT(*) n FROM public.radar_analysis_retry_authorizations WHERE campaign_id=$1',[f.campaign.id])).rows[0].n)).toBe(6)
  }finally{await f.close()}
 })
 it('permits fresh explicit approval after a model revision without changing or consuming old grants',async()=>{
  expect(api.resumeRadarAdministrativeResearch).toBeTypeOf('function')
  const f=await pausedGroup()
  try{
   const single={...f.input,receiptIds:[f.receiptIds[0]]},first=await api.resumeRadarAdministrativeResearch(f.pool,admin,single)
   await f.pool.query("UPDATE public.model_routing_rules SET model_name='fixture-revised' WHERE id=ANY($1::uuid[])",[f.routeIds])
   const next=await api.resumeRadarAdministrativeResearch(f.pool,admin,{...single,requestId:randomUUID()})
   expect(next.items[0].state).toBe('queued');expect(next.items[0].requestId).not.toBe(first.items[0].requestId)
   const grants=(await f.pool.query('SELECT consumed_at,policy_hash FROM public.radar_analysis_retry_authorizations WHERE previous_analysis_receipt_id=$1',[f.receiptIds[0]])).rows
   expect(grants).toHaveLength(2);expect(grants.every(row=>row.consumed_at===null)).toBe(true);expect(new Set(grants.map(row=>row.policy_hash)).size).toBe(2)
  }finally{await f.close()}
 })
 it('denies missing consent, non-global administrators and foreign receipts before writing any approval',async()=>{
  expect(api.resumeRadarAdministrativeResearch).toBeTypeOf('function')
  const f=await pausedGroup()
  try{
   for(const role of ['yux_operator','client_admin','client_member'])await expect(api.resumeRadarAdministrativeResearch(f.pool,{...admin,role},f.input)).rejects.toMatchObject({statusCode:403})
   await expect(api.resumeRadarAdministrativeResearch(f.pool,admin,{...f.input,acknowledgePreviousChargeMayExist:false})).rejects.toThrow()
   await expect(api.resumeRadarAdministrativeResearch(f.pool,admin,{...f.input,receiptIds:[...f.receiptIds,randomUUID()]})).rejects.toMatchObject({statusCode:403})
   expect(Number((await f.pool.query('SELECT COUNT(*) n FROM public.radar_analysis_retry_authorizations WHERE campaign_id=$1',[f.campaign.id])).rows[0].n)).toBe(0)
  }finally{await f.close()}
 })
 it('rolls back approval when one durable item cannot be registered, without rolling back other companies',async()=>{
  const f=await pausedGroup(),name=`test_retry_${randomUUID().replaceAll('-','')}`
  try{
   await f.pool.query(`CREATE FUNCTION private.${name}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.candidate_id='${f.candidateIds[2]}'::uuid THEN RAISE EXCEPTION 'fixture_registration_failure'; END IF; RETURN NEW; END $$`)
   await f.pool.query(`CREATE TRIGGER ${name} BEFORE INSERT ON public.radar_research_request_items FOR EACH ROW EXECUTE FUNCTION private.${name}()`)
   const result=await api.resumeRadarAdministrativeResearch(f.pool,admin,f.input)
   expect(result.items.filter((item:any)=>item.state==='queued')).toHaveLength(6)
   expect(result.items[2]).toMatchObject({state:'waiting',reason:'radar_research_request_registration_failed'})
   expect(Number((await f.pool.query('SELECT COUNT(*) n FROM public.radar_analysis_retry_authorizations WHERE candidate_id=$1',[f.candidateIds[2]])).rows[0].n)).toBe(0)
   expect(Number((await f.pool.query('SELECT COUNT(*) n FROM public.radar_research_requests WHERE campaign_id=$1',[f.campaign.id])).rows[0].n)).toBe(6)
  }finally{await f.pool.query(`DROP TRIGGER IF EXISTS ${name} ON public.radar_research_request_items`);await f.pool.query(`DROP FUNCTION IF EXISTS private.${name}()`);await f.close()}
 })
 it('registers the selected seven through real HTTP with the restricted API role, denying the other three roles',async()=>{
  const f=await pausedGroup(),url=new URL(connectionString!);url.username='yux_api'
  const pool=createContextAwarePool(new pg.Pool({connectionString:url.toString()}),'api'),jobs:string[]=[]
  const app=await buildServer({NODE_ENV:'test',DATABASE_URL:connectionString!,REDIS_URL:'redis://127.0.0.1:1',SESSION_COOKIE_NAME:'yux_session',SESSION_SECRET:'radar-admin-resume-fixture-secret',CORS_ORIGIN:'http://localhost:3000',PORT:4000},
   {pool,jobQueue:{add:async(name:string)=>{jobs.push(name);return{id:'fixture'}},close:async()=>{}},redisPing:async()=>'PONG'})
  try{
   for(const role of ['yux_operator','client_admin_A','client_member_A','yux_admin'] as const){
    const login=await app.inject({method:'POST',url:'/api/auth/login',payload:{email:fixtureUsers[role].email,password:fixturePassword}})
    expect(login.statusCode).toBe(200)
    const response=await app.inject({method:'POST',url:'/api/radar/admin/research-operations/resume',headers:{cookie:String(login.headers['set-cookie']).split(';')[0]},payload:f.input})
    expect(response.statusCode,response.body).toBe(role==='yux_admin'?202:403)
    if(role==='yux_admin')expect(response.json().items.every((item:any)=>item.state==='queued')).toBe(true)
    else expect(response.body).not.toMatch(/model|provider|policy_hash|receiptId/)
   }
   expect(jobs).toEqual(Array(7).fill('radar.advanceResearchRequest'))
   expect((await f.pool.query("SELECT has_table_privilege('yux_api','public.radar_analysis_receipts','UPDATE') allowed")).rows[0].allowed).toBe(false)
  }finally{await app.close();await pool.end();await f.close()}
 })
 it('advances a blocked company through the restricted worker and updates its original lot without discovery',async()=>{
  const f=await pausedGroup(),url=new URL(connectionString!);url.username='yux_worker'
  const worker=createContextAwarePool(new pg.Pool({connectionString:url.toString()}),'worker')
  const scoped=<T>(action:()=>Promise<T>)=>runWithDatabaseRequestContext({role:'client_member',organizationIds:[organizationId],serviceRole:'worker'},action)
  const newReceipts:string[]=[]
  try{
   await f.pool.query(`UPDATE public.radar_campaigns SET search_configuration=jsonb_set(search_configuration,'{research,semanticQualificationEnabled}','false') WHERE id=$1`,[f.campaign.id])
   const op=await startRadarCaptureOperation(f.pool,admin,{organizationId,campaignId:f.campaign.id,configurationRevision:1,requestedCount:7,requestId:randomUUID()},{availability:async()=>({allowed:true,reasons:[],semanticQualificationEnabled:false,maximumCostPerCandidate:1,maxQueriesPerCandidate:3})})
   await f.pool.query(`INSERT INTO public.radar_capture_items(organization_id,campaign_id,operation_id,candidate_id,run_id,status,blocker) SELECT organization_id,campaign_id,$1,candidate_id,id,'blocked','radar_presence_previous_request_uncertain' FROM public.radar_candidate_research_runs WHERE campaign_id=$2`,[op.operationId,f.campaign.id])
   await f.pool.query("UPDATE public.radar_capture_operations SET status='blocked',discovery_stopped=TRUE,discovery_reason='target_met' WHERE id=$1",[op.operationId])
   const candidateId=f.candidateIds[6],run=(await f.pool.query('SELECT id FROM public.radar_candidate_research_runs WHERE candidate_id=$1',[candidateId])).rows[0]
   const page={url:'https://alfarecovery.example/',text:'Empresa recuperação 6 fornece refeições coletivas. Contato compras@alfarecovery.example.',observedAt:new Date().toISOString()}
   await f.pool.query('UPDATE public.radar_candidate_research_runs SET output=$2 WHERE id=$1',[run.id,JSON.stringify({readingComplete:true,readerVersion:4,discoveryLocked:true,pages:[page],discovery:{association:'review',hits:[],suggestions:[],limitations:[],queries:1}})])
   const registered=await api.resumeRadarAdministrativeResearch(f.pool,admin,{...f.input,receiptIds:[f.receiptIds[6]]})
   expect(registered.items[0].state).toBe('queued')
   const parent=(await f.pool.query('SELECT id FROM public.radar_research_requests WHERE request_id=$1',[registered.items[0].requestId])).rows[0]
   await scoped(()=>dispatchRadarResearchRequest(worker,{} as never,{organizationId,researchRequestId:parent.id},{add:async()=>({id:'fixture'})}))
   expect((await getRadarCaptureOperation(f.pool,admin,organizationId,op.operationId)).counts.researching).toBe(1)
   let calls=0
   const runtime=async(_env:unknown,path:string,body:any)=>{
    calls++;expect(path).toBe('/radar/resolve-presence')
    const owner=randomUUID(),client=await f.pool.connect(),result={candidateId:body.evidence[0].id,scope:'establishment',reason:'A fonte identifica a empresa pesquisada.',claims:[{evidenceId:body.evidence[0].id,excerpt:page.text}]}
    try{
     await client.query('BEGIN');await client.query('SET LOCAL ROLE yux_runtime')
     await client.query("SELECT set_config('app.service_role','runtime',TRUE),set_config('app.current_orgs',$1,TRUE)",[`{${organizationId}}`])
     const claimed=(await client.query('SELECT * FROM private.claim_radar_retry_receipt($1,$2,$3,$4,$5,$6)',[organizationId,'radar_presence_resolution',body.request_id,'f'.repeat(64),owner,JSON.stringify(body)])).rows[0]
     expect(claimed.claimed).toBe(true);newReceipts.push(claimed.receipt.id)
     await client.query("UPDATE public.radar_analysis_receipts SET status='completed',result=$2,lease_until=NULL WHERE id=$1",[claimed.receipt.id,JSON.stringify(result)]);await client.query('COMMIT')
    }catch(cause){await client.query('ROLLBACK');throw cause}finally{client.release()}
    return result
   }
   const noDiscovery=async()=>{throw Error('unexpected_rediscovery')}
   await scoped(()=>executeRadarCandidateResearch(worker,{} as never,{organizationId,runId:run.id},undefined,{runtime:runtime as never,web:noDiscovery,local:noDiscovery,collect:async()=>[page]}))
   const stored=(await f.pool.query('SELECT calls,output,status FROM public.radar_candidate_research_runs WHERE id=$1',[run.id])).rows[0]
   expect(stored.calls.presence.status,JSON.stringify(stored)).toBe('completed');expect(calls).toBe(1)
   expect(stored.output.siteAssociation).toBe('confirmed')
   expect((await getRadarCaptureOperation(f.pool,admin,organizationId,op.operationId)).counts.blocked).toBe(6)
   await scoped(()=>dispatchRadarResearchRequest(worker,{} as never,{organizationId,researchRequestId:parent.id},{add:async()=>({id:'fixture'})}))
   expect(calls).toBe(1)
  }finally{await f.pool.query('DELETE FROM public.radar_analysis_retry_authorizations WHERE campaign_id=$1',[f.campaign.id]);await f.pool.query('DELETE FROM public.radar_analysis_receipts WHERE id=ANY($1::uuid[])',[newReceipts]);await worker.end();await f.close()}
 })
})
