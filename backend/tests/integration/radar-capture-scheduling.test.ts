import {describe,it,expect} from 'vitest'
import {randomUUID} from 'node:crypto'
import pg from 'pg'
import {captureFixture,connectionString,organizationId,admin,available} from '../support/radar-capture-fixture.js'
import {createContextAwarePool} from '../../src/db/client.js'
import {runWithDatabaseRequestContext} from '../../src/db/request-context.js'
import {startRadarCaptureOperation,getRadarCaptureOperation} from '../../src/modules/radar/capture-operation.js'
import {advanceRadarCaptureDiscovery} from '../../src/modules/radar/capture-discovery.js'
import {dispatchRadarCaptureOperation} from '../../src/modules/radar/capture-dispatch.js'
import {reconcileRadarCaptureOutbox as maintainRadar} from '../../src/jobs/handlers/maintenance.js'
import {reconcileRadarCaptureSummary} from '../../src/modules/radar/capture-reconciliation.js'
import {executeRadarCandidateResearch} from '../../src/modules/radar/research-service.js'
import {radarRegistryDiscoveryCandidate} from '../../src/modules/radar/discovery-providers.js'
import {fixtureIds} from './support/fixtures.js'
import {createRadarCampaign} from '../../src/modules/radar/repository.js'
import {CnpjaSearchHttpError} from '../../src/modules/radar/cnpjaClient.js'

const modulePath='../../src/modules/radar/capture-scheduling.js'
const scheduling=await import(modulePath).catch(()=>({})) as {repairRadarCaptureScheduling?:(pool:pg.Pool,organizationId:string)=>Promise<number>}
const env={PROVIDER_SECRET_ENCRYPTION_KEY_B64:Buffer.alloc(32,7).toString('base64')} as never
async function fixture(cities?:Array<{city:string;state:string}>){
 const f=await captureFixture()
 const config={...f.campaign.searchConfiguration,...(cities?{cities}:{}),discovery:{enabled:true,sourceOrder:['cnpja_advanced_search'],terms:[]},funnel:{enabled:true,g0:{mode:'off'},g1:{mode:'off'},g3:{mode:'off'},g5:{mode:'off'},agentPolicy:{mode:'off'}},qualification:{includeAnyTerms:['atividade configurada']},research:{...f.campaign.searchConfiguration?.research,localSearchOrder:'disabled',maxSearchQueriesPerCandidate:1,maxPagesPerCandidate:2}}
 await f.pool.query('UPDATE radar_campaigns SET search_configuration=$2::jsonb WHERE id=$1',[f.campaign.id,JSON.stringify(config)])
 const op=await startRadarCaptureOperation(f.pool,admin,{organizationId,campaignId:f.campaign.id,configurationRevision:1,requestedCount:40,requestId:randomUUID()},{availability:available})
 const url=new URL(connectionString!);url.username='yux_worker'
 const rawWorker=new pg.Pool({connectionString:url.toString()}),worker=createContextAwarePool(rawWorker,'worker')
 const scoped=<T>(work:()=>Promise<T>,ids:string[]=[organizationId])=>runWithDatabaseRequestContext({role:'yux_operator',organizationIds:ids,serviceRole:'worker'},work)
 const outbox=async()=>Number((await f.pool.query('SELECT COUNT(*)::int AS n FROM radar_capture_outbox WHERE operation_id=$1',[op.operationId])).rows[0].n)
 return{...f,op,worker,scoped,outbox,async close(){await rawWorker.end();await f.close()}}
}
describe.skipIf(!connectionString)('requested-count scheduling with isolated PostgreSQL',()=>{
 it('continues another valid cursor after a provider rejects one region, without buying the rejected cursor again',async()=>{
  const f=await fixture(['Curitiba','Londrina'].map(city=>({city,state:'PR'})))
  try{
   const calls:Array<{city:string;token?:string}>=[]
   const adaptiveDiscover=async(input:any)=>{
    calls.push({city:input.scope.city,token:input.continuation?.token})
    if(calls.length<=2)return{candidates:[],documents:[],exhaustion:'more' as const,continuation:{token:`next-${input.scope.city}`}}
    if(calls.length===3)throw new CnpjaSearchHttpError('token is invalid or expired',400)
    expect(calls.length).toBe(4);expect(input.scope.city).toBe('Londrina');expect(input.continuation).toEqual({token:'next-Londrina'})
    return{candidates:[radarRegistryDiscoveryCandidate({taxId:'37335118000180',legalName:'Empresa alternativa',city:'Londrina',state:'PR',cnaes:[],websiteStatus:'unknown',rawPayload:{}})!],documents:[],exhaustion:'exhausted' as const}
   }
   for(let turn=0;turn<5;turn++)await advanceRadarCaptureDiscovery(f.pool,env,{organizationId,operationId:f.op.operationId},{availability:available,adaptiveDiscover})
   expect(['queued','discovering']).toContain((await getRadarCaptureOperation(f.pool,admin,organizationId,f.op.operationId)).status)
   expect(await f.outbox()).toBe(1)
   for(let turn=0;turn<2;turn++)await advanceRadarCaptureDiscovery(f.pool,env,{organizationId,operationId:f.op.operationId},{availability:available,adaptiveDiscover})
   expect(calls).toEqual([{city:'Curitiba',token:undefined},{city:'Londrina',token:undefined},{city:'Curitiba',token:'next-Curitiba'},{city:'Londrina',token:'next-Londrina'}])
   expect((await getRadarCaptureOperation(f.pool,admin,organizationId,f.op.operationId)).counts.admitted).toBe(1)
   expect((await f.pool.query("SELECT status,error_code,input->'continuation' AS input_continuation,extraction FROM radar_discovery_pages WHERE operation_id=$1 AND status='rejected'",[f.op.operationId])).rows).toEqual([{status:'rejected',error_code:'radar_discovery_continuation_rejected',input_continuation:{token:'next-Curitiba'},extraction:{}}])
  }finally{await f.close()}
 })
 it.each(['available','only_region','expired_other','uncertain_other'])('repairs only a rejected-cursor parent with an available alternative: %s',async condition=>{
  const cities=(condition==='only_region'?['Curitiba']:['Curitiba','Londrina']).map(city=>({city,state:'PR'})),f=await fixture(cities)
  try{
   let calls=0
   const adaptiveDiscover=async(input:any)=>{
    calls++
    if(input.continuation?.token)throw new CnpjaSearchHttpError('token is invalid or expired',400)
    return{candidates:[],documents:[],exhaustion:'more' as const,continuation:{token:`next-${input.scope.city}`}}
   }
   for(let turn=0;turn<cities.length*2+1;turn++)await advanceRadarCaptureDiscovery(f.pool,env,{organizationId,operationId:f.op.operationId},{availability:available,adaptiveDiscover})
   if(condition==='expired_other')await f.pool.query("UPDATE radar_discovery_pages SET updated_at=NOW()-INTERVAL '2 hours' WHERE operation_id=$1 AND input->'scope'->>'city'='Londrina'",[f.op.operationId])
   if(condition==='uncertain_other')await f.pool.query("UPDATE radar_discovery_pages SET status='uncertain',lease_until=NOW()-INTERVAL '1 hour' WHERE operation_id=$1 AND input->'scope'->>'city'='Londrina'",[f.op.operationId])
   const candidate=(await f.pool.query(`INSERT INTO radar_candidate_records(organization_id,campaign_id,source_type,title,dedupe_key) VALUES($1,$2,'manual','Análise individual preservada',$3) RETURNING id`,[organizationId,f.campaign.id,randomUUID()])).rows[0]
   const oldCalls={presence:{status:'reserved',requestId:randomUUID()}}
   const run=(await f.pool.query(`INSERT INTO radar_candidate_research_runs(organization_id,campaign_id,candidate_id,configuration_revision,requested_by,status,stage,calls) VALUES($1,$2,$3,1,$4,'partial','review',$5) RETURNING id`,[organizationId,f.campaign.id,candidate.id,admin.id,JSON.stringify(oldCalls)])).rows[0]
   await f.pool.query(`INSERT INTO radar_capture_items(organization_id,campaign_id,operation_id,candidate_id,run_id,status,blocker,funnel_outcome,initial_gate_status) VALUES($1,$2,$3,$4,$5,'blocked','radar_research_call_uncertain','technical_failure','pass')`,[organizationId,f.campaign.id,f.op.operationId,candidate.id,run.id])
   await f.pool.query(`UPDATE radar_capture_operations SET status='blocked',blockers='["radar_discovery_continuation_rejected","radar_research_call_uncertain"]',lease_id=NULL,lease_until=NULL WHERE id=$1`,[f.op.operationId])
   await f.pool.query('DELETE FROM radar_capture_outbox WHERE operation_id=$1',[f.op.operationId])
   const before=(await f.pool.query('SELECT queries,research_budget_authorizations,analysis_refresh_authorizations FROM radar_capture_operations WHERE id=$1',[f.op.operationId])).rows[0]
   if(condition==='available'){
    const delivered:string[]=[]
    await f.scoped(()=>maintainRadar(f.worker,{add:async(_name,data)=>{if(typeof data.operationId==='string')delivered.push(data.operationId);return{}}},9),[])
    expect(delivered).toEqual([f.op.operationId])
   }else expect(await f.scoped(()=>scheduling.repairRadarCaptureScheduling!(f.worker,organizationId))).toBe(0)
   expect((await getRadarCaptureOperation(f.pool,admin,organizationId,f.op.operationId)).status).toBe(condition==='available'?'discovering':'blocked')
   expect(await f.outbox()).toBe(condition==='available'?1:0)
   expect((await f.pool.query('SELECT queries,research_budget_authorizations,analysis_refresh_authorizations FROM radar_capture_operations WHERE id=$1',[f.op.operationId])).rows[0]).toEqual(before)
   expect((await f.pool.query('SELECT calls FROM radar_candidate_research_runs WHERE id=$1',[run.id])).rows[0].calls).toEqual(oldCalls)
   expect((await f.pool.query('SELECT status FROM radar_capture_items WHERE operation_id=$1',[f.op.operationId])).rows[0].status).toBe('blocked')
   expect(calls).toBe(cities.length+1)
  }finally{await f.close()}
 })
 it.each(['uncertain_transport','non_cursor_validation'])('keeps global protection for %s',async condition=>{
  const f=await fixture(['Curitiba','Londrina'].map(city=>({city,state:'PR'})))
  try{
   let calls=0
   const adaptiveDiscover=async(input:any)=>{
    calls++
    if(condition==='non_cursor_validation')throw new CnpjaSearchHttpError('invalid initial parameters',400)
    if(input.continuation?.token)throw Error('synthetic_transport_unknown')
    return{candidates:[],documents:[],exhaustion:'more' as const,continuation:{token:`next-${input.scope.city}`}}
   }
   for(let turn=0;turn<6;turn++)await advanceRadarCaptureDiscovery(f.pool,env,{organizationId,operationId:f.op.operationId},{availability:available,adaptiveDiscover})
   const blocker=condition==='non_cursor_validation'?'radar_discovery_parameters_rejected':'synthetic_transport_unknown'
   expect((await getRadarCaptureOperation(f.pool,admin,organizationId,f.op.operationId))).toMatchObject({status:'blocked',blockers:expect.arrayContaining([blocker])})
   expect(calls).toBe(condition==='non_cursor_validation'?1:3)
   const existingDeliveries=await f.outbox()
   expect(await f.scoped(()=>scheduling.repairRadarCaptureScheduling!(f.worker,organizationId))).toBe(0)
   expect(await f.outbox()).toBe(existingDeliveries)
  }finally{await f.close()}
 })
 it('keeps discovery scheduled when only individual companies are blocked',async()=>{
  const f=await fixture()
  try{
   const candidate=(await f.pool.query(`INSERT INTO radar_candidate_records(organization_id,campaign_id,source_type,title,dedupe_key) VALUES($1,$2,'manual','Empresa com análise pendente',$3) RETURNING id`,[organizationId,f.campaign.id,randomUUID()])).rows[0]
   const run=(await f.pool.query(`INSERT INTO radar_candidate_research_runs(organization_id,campaign_id,candidate_id,configuration_revision,requested_by,status,stage,calls) VALUES($1,$2,$3,1,$4,'partial','review','{"presence":{"status":"reserved"}}') RETURNING id`,[organizationId,f.campaign.id,candidate.id,admin.id])).rows[0]
   await f.pool.query(`INSERT INTO radar_capture_items(organization_id,campaign_id,operation_id,candidate_id,run_id,status,blocker,funnel_outcome,initial_gate_status) VALUES($1,$2,$3,$4,$5,'blocked','radar_research_call_uncertain','technical_failure','pass')`,[organizationId,f.campaign.id,f.op.operationId,candidate.id,run.id])
   await f.pool.query("UPDATE radar_capture_operations SET status='discovering',blockers='[\"radar_research_call_uncertain\"]' WHERE id=$1",[f.op.operationId])
   const client=await f.pool.connect()
   try{await client.query('BEGIN');await client.query('SELECT id FROM radar_campaigns WHERE id=$1 FOR UPDATE',[f.campaign.id]);await reconcileRadarCaptureSummary(client,{organizationId,operationId:f.op.operationId,discoveryBlockers:[]});await client.query('COMMIT')}finally{client.release()}
   expect((await getRadarCaptureOperation(f.pool,admin,organizationId,f.op.operationId)).status).toBe('discovering')
   expect((await getRadarCaptureOperation(f.pool,admin,organizationId,f.op.operationId)).blockers).toContain('radar_research_call_uncertain')
   expect(await f.outbox()).toBe(1)
  }finally{await f.close()}
 })
 it('recovers the same 10/40 lot through unused cities despite an expired cursor, preserving both uncertain/invalid analyses',async()=>{
  const cities=['Curitiba','Londrina','Maringá','Cascavel'].map(city=>({city,state:'PR'})),f=await fixture(cities)
  try{
   const taxId=(index:number)=>{let value=`82456891${String(index).padStart(4,'0')}`;for(let digit=0;digit<2;digit++){const sum=[...value].reverse().reduce((sum,char,i)=>sum+Number(char)*(i%8+2),0),rest=sum%11;value+=rest<2?'0':String(11-rest)}return value}
   const prospects=Array.from({length:40},(_,index)=>radarRegistryDiscoveryCandidate({taxId:taxId(index+1),legalName:`Empresa Continuidade ${index+1}`,city:'Curitiba',state:'PR',cnaes:[],websiteStatus:'unknown',rawPayload:{}})!)
   let discoveries=0
   const adaptiveDiscover=async(input:any)=>{const page=discoveries++;expect(input.continuation).toBeUndefined();expect(input.scope.city).toBe(cities[page]?.city);return{candidates:prospects.slice(page*10,page*10+10),documents:[],exhaustion:'more' as const,continuation:{token:`next-${input.scope.city}`}}}
   for(let turn=0;turn<2;turn++)await advanceRadarCaptureDiscovery(f.pool,env,{organizationId,operationId:f.op.operationId},{availability:available,adaptiveDiscover})
   const initial=(await getRadarCaptureOperation(f.pool,admin,organizationId,f.op.operationId)).items
   expect(initial).toHaveLength(10)
   await f.pool.query("UPDATE radar_discovery_pages SET updated_at=NOW()-INTERVAL '2 hours' WHERE operation_id=$1",[f.op.operationId])
   const held:Array<{id:string;calls:unknown}>=[]
   for(const [index,item]of initial.entries()){
    const calls=index===8?{presence:{status:'received_invalid',error:'radar_presence_unverifiable',requestId:'fixture-invalid'}}:index===9?{presence:{status:'reserved',requestId:'fixture-uncertain'}}:{}
    const run=(await f.pool.query(`INSERT INTO radar_candidate_research_runs(organization_id,campaign_id,candidate_id,configuration_revision,requested_by,status,stage,calls,output) VALUES($1,$2,$3,1,$4,'partial','review',$5,'{"quality":{"readyForReview":false}}') RETURNING id`,[organizationId,f.campaign.id,item.candidateId,admin.id,JSON.stringify(calls)])).rows[0]
    if(index>=8)held.push({id:run.id,calls})
    await f.pool.query('UPDATE radar_capture_items SET run_id=$2,status=$3,blocker=$4,funnel_outcome=$5 WHERE id=$1',[item.id,run.id,index<8?'insufficient':'blocked',index===8?'radar_presence_unverifiable':index===9?'radar_research_call_uncertain':null,index<8?'completed_with_gaps':'technical_failure'])
   }
   await f.pool.query("UPDATE radar_capture_operations SET status='discovering',lease_id=NULL,lease_until=NULL,blockers='[\"radar_presence_unverifiable\",\"radar_research_call_uncertain\"]' WHERE id=$1",[f.op.operationId])
   await f.pool.query('DELETE FROM radar_capture_outbox WHERE operation_id=$1',[f.op.operationId])
   const delivered:any[]=[]
   await f.scoped(()=>maintainRadar(f.worker,{add:async(name,data)=>{if(data.operationId===f.op.operationId)delivered.push({name,data});return{}}},1),[])
   expect(delivered).toEqual([{name:'radar.advanceCaptureOperation',data:{organizationId,operationId:f.op.operationId}}])
   expect(await f.outbox()).toBe(1)
   const queue={add:async(_name:string,data:any)=>{
    const run=(await f.pool.query('SELECT candidate_id FROM radar_candidate_research_runs WHERE id=$1',[data.runId])).rows[0]
    expect(initial.map(item=>item.candidateId)).not.toContain(run.candidate_id)
    return executeRadarCandidateResearch(f.worker,env,data,undefined,{loadSecret:async()=>'synthetic',web:async input=>{const index=Number(/(\d+)$/.exec(input.query)?.[1]);return[{url:`https://continuidade-${index}.example/`,title:`Empresa Continuidade ${index}`,snippets:[`Empresa Continuidade ${index} CNPJ ${taxId(index)}`],observedAt:'2026-10-26T12:00:00Z'}]},collect:async url=>{const index=Number(/continuidade-(\d+)/.exec(url)?.[1]);return[{url,text:`Somos Empresa Continuidade ${index} CNPJ ${taxId(index)} atividade configurada. Contato: compras@continuidade-${index}.example`,observedAt:'2026-10-26T12:00:00Z'}]},runtime:async()=>{throw Error('unexpected_model_call')}})
   }}
   for(let turn=0;turn<35;turn++){
    const result=await f.scoped(()=>dispatchRadarCaptureOperation(f.worker,env,{organizationId,operationId:f.op.operationId},queue as never,undefined,{availability:available,discover:(pool,env,input)=>advanceRadarCaptureDiscovery(pool,env,input,{availability:available,adaptiveDiscover})}))
    if(result?.discoveryStopped&&result.counts.admitted===40&&result.counts.researching===0)break
   }
   const result=await getRadarCaptureOperation(f.pool,admin,organizationId,f.op.operationId)
   expect(result).toMatchObject({id:f.op.operationId,status:'blocked',discoveryStopped:true,counts:{requested:40,admitted:40,researching:0,blocked:2}})
   expect(result.counts.completed+(result.counts.completedWithGaps??0)).toBe(38)
   expect(discoveries).toBe(4)
   expect((await f.pool.query('SELECT continuation,extraction FROM radar_discovery_pages WHERE operation_id=$1 ORDER BY created_at,id LIMIT 1',[f.op.operationId])).rows[0]).toMatchObject({continuation:{token:'next-Curitiba'},extraction:{}})
   expect((await f.pool.query('SELECT stage,status FROM radar_candidate_research_runs WHERE campaign_id=$1',[f.campaign.id])).rows).toHaveLength(40)
   expect((await f.pool.query("SELECT COUNT(*)::int AS n FROM radar_candidate_research_runs WHERE campaign_id=$1 AND (stage<>'review' OR status IN('queued','running'))",[f.campaign.id])).rows[0].n).toBe(0)
   for(const saved of held)expect((await f.pool.query('SELECT calls FROM radar_candidate_research_runs WHERE id=$1',[saved.id])).rows[0].calls).toEqual(saved.calls)
   await f.scoped(()=>maintainRadar(f.worker,{add:async()=>{throw Error('unexpected_delivery_after_target')}},2),[])
   expect(await f.outbox()).toBe(0)
   expect(Number((await f.pool.query('SELECT COUNT(*) AS n FROM radar_capture_operations WHERE campaign_id=$1',[f.campaign.id])).rows[0].n)).toBe(1)
  }finally{await f.close()}
 },60000)
 it('repairs an active orphan once under concurrent workers and cannot cross tenant scope',async()=>{
  expect(scheduling.repairRadarCaptureScheduling).toBeTypeOf('function')
  const f=await fixture()
  try{
   await f.pool.query('DELETE FROM radar_capture_outbox WHERE operation_id=$1',[f.op.operationId])
   expect(await f.scoped(()=>scheduling.repairRadarCaptureScheduling!(f.worker,organizationId),[fixtureIds.organizationA])).toBe(0)
   expect(await f.outbox()).toBe(0)
   const results=await Promise.all([f.scoped(()=>scheduling.repairRadarCaptureScheduling!(f.worker,organizationId)),f.scoped(()=>scheduling.repairRadarCaptureScheduling!(f.worker,organizationId))])
   expect(results.reduce((a,b)=>a+b,0)).toBe(1);expect(await f.outbox()).toBe(1)
   expect(await f.scoped(()=>scheduling.repairRadarCaptureScheduling!(f.worker,organizationId))).toBe(0)
   expect((await f.pool.query('SELECT * FROM radar_source_usage_counters WHERE campaign_id=$1',[f.campaign.id])).rows).toEqual([])
  }finally{await f.close()}
 })
 it.each([fixtureIds.organizationA,organizationId])('delivers healthy lots even when repairing an earlier lot in %s fails',async badOrganizationId=>{
  const f=await fixture(),name=`qa_orphan_${randomUUID().replaceAll('-','')}`
  let badCampaignId:string|undefined
  try{
   const badCampaign=await createRadarCampaign(f.pool,admin,{organizationId:badOrganizationId,name:'Scheduling fault fixture',campaignType:'regional_b2b',targetStates:['SP'],targetSegment:'Empresas',offerType:'Oferta'})
   badCampaignId=badCampaign.id
   const bad=(await f.pool.query(`INSERT INTO radar_capture_operations(organization_id,campaign_id,requested_by,request_id,configuration_revision,requested_count,configuration_snapshot,created_at) VALUES($1,$2,$3,$4,1,1,'{}',NOW()-INTERVAL '1 hour') RETURNING id`,[badOrganizationId,badCampaign.id,admin.id,randomUUID()])).rows[0]
   await f.pool.query('DELETE FROM radar_capture_outbox WHERE operation_id=$1',[f.op.operationId])
   await f.pool.query(`CREATE FUNCTION ${name}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id='${bad.id}'::uuid THEN RAISE EXCEPTION 'synthetic_orphan_write_failed'; END IF; RETURN NEW; END $$`)
   await f.pool.query(`CREATE TRIGGER ${name} BEFORE UPDATE ON radar_capture_operations FOR EACH ROW EXECUTE FUNCTION ${name}()`)
   const delivered:string[]=[]
   const result=await f.scoped(()=>maintainRadar(f.worker,{add:async(_name,data)=>{if(typeof data.operationId!=='string')throw Error('unexpected_non_capture_delivery');delivered.push(data.operationId);return{}}},7),[]).catch(cause=>cause)
   expect(delivered).toEqual([f.op.operationId])
   expect(result).toBeInstanceOf(AggregateError)
   expect(result.message).toBe('radar_capture_scheduling_repair_failed')
   expect(await f.outbox()).toBe(1)
   expect((await f.pool.query('SELECT * FROM radar_source_usage_counters WHERE campaign_id=$1',[f.campaign.id])).rows).toEqual([])
  }finally{
   await f.pool.query(`DROP TRIGGER IF EXISTS ${name} ON radar_capture_operations`)
   await f.pool.query(`DROP FUNCTION IF EXISTS ${name}()`)
   if(badCampaignId)await f.pool.query('DELETE FROM radar_campaigns WHERE id=$1',[badCampaignId])
   await f.close()
  }
 })
 it.each(['blocked','partial','completed','historical','revision','paused_campaign','inactive_actor','active_lease','discovery_pending'])('does not reactivate %s without the required authority',async condition=>{
  expect(scheduling.repairRadarCaptureScheduling).toBeTypeOf('function')
  const f=await fixture()
  try{
   await f.pool.query('DELETE FROM radar_capture_outbox WHERE operation_id=$1',[f.op.operationId])
   if(['blocked','partial','completed'].includes(condition))await f.pool.query('UPDATE radar_capture_operations SET status=$2 WHERE id=$1',[f.op.operationId,condition])
   if(condition==='historical')await f.pool.query('UPDATE radar_capture_operations SET historical_closed_at=NOW() WHERE id=$1',[f.op.operationId])
   if(condition==='revision')await f.pool.query('UPDATE radar_campaigns SET configuration_revision=2 WHERE id=$1',[f.campaign.id])
   if(condition==='paused_campaign')await f.pool.query("UPDATE radar_campaigns SET status='paused' WHERE id=$1",[f.campaign.id])
   if(condition==='inactive_actor')await f.pool.query('UPDATE app_users SET is_active=FALSE WHERE id=$1',[admin.id])
   if(condition==='active_lease')await f.pool.query("UPDATE radar_capture_operations SET lease_until=NOW()+INTERVAL '6 minutes' WHERE id=$1",[f.op.operationId])
   if(condition==='discovery_pending')await f.pool.query('UPDATE radar_capture_operations SET discovery_pending=TRUE WHERE id=$1',[f.op.operationId])
   expect(await f.scoped(()=>scheduling.repairRadarCaptureScheduling!(f.worker,organizationId))).toBe(0)
   expect(await f.outbox()).toBe(0)
   if(condition==='discovery_pending')expect((await getRadarCaptureOperation(f.pool,admin,organizationId,f.op.operationId))).toMatchObject({status:'blocked',blockers:['radar_capture_discovery_uncertain']})
  }finally{if(condition==='inactive_actor')await f.pool.query('UPDATE app_users SET is_active=TRUE WHERE id=$1',[admin.id]);await f.close()}
 })
 it.each(['radar_discovery_request_uncertain','source_budget_exceeded','source_limit_exceeded'])('exposes the real discovery blocker %s instead of scheduling an automatic retry',async code=>{
  expect(scheduling.repairRadarCaptureScheduling).toBeTypeOf('function')
  const f=await fixture()
  try{
   await f.pool.query('DELETE FROM radar_capture_outbox WHERE operation_id=$1',[f.op.operationId])
   await f.pool.query("UPDATE radar_capture_operations SET status='discovering',blockers=$2 WHERE id=$1",[f.op.operationId,JSON.stringify([code])])
   expect(await f.scoped(()=>scheduling.repairRadarCaptureScheduling!(f.worker,organizationId))).toBe(0)
   expect((await getRadarCaptureOperation(f.pool,admin,organizationId,f.op.operationId))).toMatchObject({status:'blocked',blockers:[code]})
   expect(await f.outbox()).toBe(0)
  }finally{await f.close()}
 })
})
