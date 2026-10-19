import {describe,it,expect} from 'vitest'
import {normalizeRadarCounters} from '../src/modules/radar/numeric-counters.js'
import {randomUUID} from 'node:crypto'
import pg from 'pg'
import {captureFixture,connectionString,admin,organizationId,available,company,activateCaptureSearch} from './support/radar-capture-fixture.js'
import {fixtureIds,fixtureUsers,fixturePassword} from './integration/support/fixtures.js'
import {buildServer} from '../src/server.js'
import {createContextAwarePool} from '../src/db/client.js'
import {startRadarCaptureOperation} from '../src/modules/radar/capture-operation.js'
import {advanceRadarCaptureDiscovery} from '../src/modules/radar/capture-discovery.js'
import {resumeRadarCaptureOperation,dispatchRadarCaptureOperation} from '../src/modules/radar/capture-dispatch.js'
import {getRadarCapturePreflight} from '../src/modules/radar/capture-preflight.js'
import {CnpjaSearchHttpError} from '../src/modules/radar/cnpjaClient.js'

describe.skipIf(!connectionString)('expired capture continuation with PostgreSQL',()=>{
 async function setup(error:Error=new CnpjaSearchHttpError('HTTP 400: request validation failed; token is invalid or expired',400)){
  const f=await captureFixture(),old=company()
  await f.pool.query(`INSERT INTO public.radar_candidate_records(organization_id,campaign_id,source_type,title,dedupe_key,normalized_payload) VALUES($1,$2,'cnpja_advanced_search','Anterior',$3,'{"websiteUrl":"https://old.example/"}')`,[organizationId,f.campaign.id,`cnpj:${old.taxId}`])
  await f.pool.query(`INSERT INTO public.radar_regional_discovery_cursors(organization_id,campaign_id,state,provider,scope_key,next_token,pages_processed,candidates_seen,token_received_at) VALUES($1,$2,'PR','cnpja_advanced_search','v1:PR:all','expired-token',4,40,NOW())`,[organizationId,f.campaign.id])
  const started=await startRadarCaptureOperation(f.pool,admin,{organizationId,campaignId:f.campaign.id,configurationRevision:1,requestId:randomUUID(),requestedCount:20},{availability:available})
  const input={organizationId,operationId:started.operationId},resume={...input,configurationRevision:1,requestId:randomUUID()}
  await advanceRadarCaptureDiscovery(f.pool,{} as never,input,{availability:available,loadSecret:async()=>'fixture',searchPage:async()=>{throw error}})
  const state=async()=>({
   op:normalizeRadarCounters((await f.pool.query('SELECT * FROM public.radar_capture_operations WHERE id=$1',[input.operationId])).rows[0]),
   cursor:normalizeRadarCounters((await f.pool.query('SELECT * FROM public.radar_regional_discovery_cursors WHERE campaign_id=$1',[f.campaign.id])).rows[0]),
   runs:(await f.pool.query('SELECT * FROM public.radar_enrichment_runs WHERE campaign_id=$1 ORDER BY started_at DESC',[f.campaign.id])).rows,
   outbox:(await f.pool.query('SELECT * FROM public.radar_capture_outbox WHERE operation_id=$1',[input.operationId])).rows,
   usage:(await f.pool.query('SELECT * FROM public.radar_source_usage_counters WHERE campaign_id=$1 ORDER BY source_type,usage_date',[f.campaign.id])).rows,
  })
  const preflight=await getRadarCapturePreflight(f.pool,admin,{organizationId,campaignId:f.campaign.id,operationId:started.operationId,configurationRevision:1,requestedCount:20},{availability:available})
  const consent={...resume,restartExpiredContinuation:true,continuationReceiptId:(await state()).runs[0].id,continuationStateId:preflight.continuations[0]?.stateId}
  return{...f,input,resume,consent,old,state}
 }
 const confirmed={restartExpiredContinuation:true}
 it('resumes durable restart after availability fails before a new discovery receipt',async()=>{
  const f=await setup();let calls=0
  try{
   const input={organizationId,campaignId:f.campaign.id,operationId:f.input.operationId,configurationRevision:1,requestedCount:20}
   const p=await getRadarCapturePreflight(f.pool,admin,input,{availability:available})
   await resumeRadarCaptureOperation(f.pool,admin,{...f.resume,continuationAuthorizations:p.continuations.map(s=>({scopeKey:s.scopeKey,expectedStateId:s.stateId}))},{availability:available})
   await dispatchRadarCaptureOperation(f.pool,{} as never,f.input,{add:async()=>{throw Error('unexpected_enqueue')}},undefined,{availability:async()=>{throw Error('radar_research_temporarily_unavailable')}})
   const blocked=await f.state()
   expect(blocked.op).toMatchObject({status:'blocked',queries:1})
   expect(blocked.runs).toHaveLength(1)
   expect(blocked.cursor).toMatchObject({next_token:null,generation:1})
   const restored=await getRadarCapturePreflight(f.pool,admin,input,{availability:available})
   expect(restored.blockers).toEqual([])
   await expect(resumeRadarCaptureOperation(f.pool,admin,{...f.resume,requestId:randomUUID()},{availability:available})).resolves.toMatchObject({status:'queued'})
   expect((await f.state()).runs).toHaveLength(1)
   await advanceRadarCaptureDiscovery(f.pool,{} as never,f.input,{availability:available,loadSecret:async()=>'fixture',searchPage:async request=>{calls++;expect(request.token).toBeUndefined();return{candidates:[company()]}}})
   expect(calls).toBe(1)
   expect((await f.pool.query('SELECT * FROM public.radar_continuation_authorizations WHERE campaign_id=$1',[f.campaign.id])).rows).toHaveLength(1)
  }finally{await f.close()}
 })
 it('requires consent without changing any receipt, cursor, lot or queue',async()=>{
  const f=await setup()
  try{
   const before=await f.state()
   await expect(resumeRadarCaptureOperation(f.pool,admin,f.resume,{availability:available})).rejects.toMatchObject({message:'radar_capture_continuation_confirmation_required',continuationReceiptId:before.runs[0].id})
   expect(await f.state()).toEqual(before)
  }finally{await f.close()}
 })
 it('restarts only the rejected cursor once, auditing consent and preserving count, companies and consumption',async()=>{
  const f=await setup()
  try{
   const before=await f.state()
   await Promise.all([1,2].map(()=>resumeRadarCaptureOperation(f.pool,admin,f.consent,{availability:available})))
   const after=await f.state()
   expect(after.cursor).toMatchObject({next_token:null,completed:false,pages_processed:4,candidates_seen:40})
   expect(after.op).toMatchObject({id:f.input.operationId,status:'queued',requested_count:20,queries:1,scope_pages:{'v1:PR:all':1},resume_generation:1})
   expect(after.usage).toEqual(before.usage)
   expect(after.runs[0].output_payload.captureContinuationRecovery).toMatchObject({operationId:f.input.operationId,requestId:f.resume.requestId,approvedBy:admin.id,scopeKey:'v1:PR:all'})
   expect(JSON.stringify(after.runs[0].output_payload.captureContinuationRecovery)).not.toContain('expired-token')
   const next=company();let receivedToken:unknown='not-called'
   await advanceRadarCaptureDiscovery(f.pool,{} as never,f.input,{availability:available,loadSecret:async()=>'fixture',searchPage:async input=>{receivedToken=input.token;return{candidates:[f.old,next],nextToken:'new-token'}}})
   expect(receivedToken).toBeUndefined()
   await resumeRadarCaptureOperation(f.pool,admin,f.consent,{availability:available})
   expect((await f.state()).cursor.next_token).toBe('new-token')
   expect((await f.state()).op).toMatchObject({queries:2,resume_generation:1})
   expect((await f.pool.query('SELECT candidate_id FROM public.radar_capture_items WHERE operation_id=$1',[f.input.operationId])).rows).toHaveLength(1)
   expect((await f.pool.query('SELECT normalized_payload FROM public.radar_candidate_records WHERE campaign_id=$1 AND dedupe_key=$2',[f.campaign.id,`cnpj:${f.old.taxId}`])).rows[0].normalized_payload).toEqual({websiteUrl:'https://old.example/'})
  }finally{await f.close()}
 })
 it.each(['missing_token','other_message','other_http','other_outcome','wrong_operation','wrong_revision','advanced_cursor','cursor_lease','wrong_scope','ambiguous_scope','later_run'])('rejects unproven or stale consent: %s',async mode=>{
  const f=await setup()
  try{
   if(mode==='missing_token')await f.pool.query("UPDATE public.radar_enrichment_runs SET input_payload=input_payload-'pageToken' WHERE campaign_id=$1",[f.campaign.id])
   if(mode==='other_message')await f.pool.query("UPDATE public.radar_enrichment_runs SET error_message='API key is invalid' WHERE campaign_id=$1",[f.campaign.id])
   if(mode==='other_http')await f.pool.query("UPDATE public.radar_enrichment_runs SET output_payload=jsonb_set(output_payload,'{httpStatus}','422') WHERE campaign_id=$1",[f.campaign.id])
   if(mode==='other_outcome')await f.pool.query("UPDATE public.radar_enrichment_runs SET output_payload=jsonb_set(output_payload,'{discoveryOutcome}','\"uncertain\"') WHERE campaign_id=$1",[f.campaign.id])
   if(mode==='wrong_operation')await f.pool.query("UPDATE public.radar_enrichment_runs SET input_payload=jsonb_set(input_payload,'{captureOperationId}',to_jsonb($2::text)) WHERE campaign_id=$1",[f.campaign.id,randomUUID()])
   if(mode==='wrong_revision')await f.pool.query("UPDATE public.radar_enrichment_runs SET input_payload=jsonb_set(input_payload,'{configurationRevision}','2') WHERE campaign_id=$1",[f.campaign.id])
   if(mode==='advanced_cursor')await f.pool.query("UPDATE public.radar_regional_discovery_cursors SET next_token='newer-token' WHERE campaign_id=$1",[f.campaign.id])
   if(mode==='cursor_lease')await f.pool.query("UPDATE public.radar_regional_discovery_cursors SET lease_id=$2,running_until=NOW()+INTERVAL '1 minute' WHERE campaign_id=$1",[f.campaign.id,randomUUID()])
   if(mode==='wrong_scope')await f.pool.query("UPDATE public.radar_enrichment_runs SET input_payload=jsonb_set(input_payload,'{regionalState}','\"SP\"') WHERE campaign_id=$1",[f.campaign.id])
   if(mode==='ambiguous_scope')await f.pool.query("UPDATE public.radar_capture_operations SET configuration_snapshot=jsonb_set(configuration_snapshot,'{target_states}','[\"PR\",\"PR\"]') WHERE id=$1",[f.input.operationId])
   if(mode==='later_run')await f.pool.query("INSERT INTO public.radar_enrichment_runs(organization_id,campaign_id,status,provider,input_payload,output_payload,started_at) VALUES($1,$2,'running','cnpja_advanced_search','{}','{}',NOW())",[organizationId,f.campaign.id])
   const before=await f.state()
   await expect(resumeRadarCaptureOperation(f.pool,admin,f.consent,{availability:available})).rejects.toThrow('radar_capture_continuation_confirmation_stale')
   expect(await f.state()).toEqual(before)
  }finally{await f.close()}
 })
 it('does not bypass uncertain discovery or tenant, role, revision and worker lease guards',async()=>{
  const f=await setup()
  try{
   const before=await f.state()
   for(const role of ['yux_operator','client_admin_A','client_member_A'] as const)await expect(resumeRadarCaptureOperation(f.pool,fixtureUsers[role] as typeof admin,{...f.resume,...confirmed},{availability:available})).rejects.toThrow()
   await expect(resumeRadarCaptureOperation(f.pool,admin,{...f.resume,...confirmed,organizationId:fixtureIds.organizationA},{availability:available})).rejects.toThrow()
   await expect(resumeRadarCaptureOperation(f.pool,admin,{...f.resume,...confirmed,configurationRevision:2},{availability:available})).rejects.toThrow('radar_campaign_configuration_changed')
   expect(await f.state()).toEqual(before)
   await f.pool.query("UPDATE public.radar_capture_operations SET lease_id=$2,lease_until=NOW()+INTERVAL '1 minute' WHERE id=$1",[f.input.operationId,randomUUID()])
   await expect(resumeRadarCaptureOperation(f.pool,admin,{...f.resume,...confirmed},{availability:available})).rejects.toThrow('radar_capture_in_progress')
  }finally{await f.close()}
  const uncertain=await setup(new TypeError('fetch failed'))
  try{
   const before=await uncertain.state()
   await expect(resumeRadarCaptureOperation(uncertain.pool,admin,{...uncertain.resume,...confirmed},{availability:available})).rejects.toThrow('radar_capture_discovery_uncertain')
   expect(await uncertain.state()).toEqual(before)
  }finally{await uncertain.close()}
 })
 it('rolls back cursor and audit if queueing the lot fails',async()=>{
  const f=await setup(),name=`radar_continuation_${randomUUID().replaceAll('-','')}`
  try{
   const before=await f.state()
   await f.pool.query(`CREATE FUNCTION public.${name}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id='${f.input.operationId}' AND NEW.status='queued' THEN RAISE EXCEPTION 'simulated_queue_failure'; END IF; RETURN NEW; END $$`)
   await f.pool.query(`CREATE TRIGGER ${name} BEFORE UPDATE ON public.radar_capture_operations FOR EACH ROW EXECUTE FUNCTION public.${name}()`)
   await expect(resumeRadarCaptureOperation(f.pool,admin,f.consent,{availability:available})).rejects.toThrow('simulated_queue_failure')
   expect(await f.state()).toEqual(before)
  }finally{await f.pool.query(`DROP TRIGGER IF EXISTS ${name} ON public.radar_capture_operations`);await f.pool.query(`DROP FUNCTION IF EXISTS public.${name}()`);await f.close()}
 })
 it('retains exhausted lot caps instead of buying more searches after approval',async()=>{
  const f=await setup();let calls=0
  try{
   await f.pool.query('UPDATE public.radar_capture_operations SET queries=5 WHERE id=$1',[f.input.operationId])
   await expect(resumeRadarCaptureOperation(f.pool,admin,f.consent,{availability:available})).rejects.toThrow('radar_capture_history_uncertain')
   const result=await advanceRadarCaptureDiscovery(f.pool,{} as never,f.input,{availability:available,loadSecret:async()=>'fixture',searchPage:async()=>{calls++;return{candidates:[]}}})
   expect(result).toMatchObject({status:'blocked',queries:5})
   expect(calls).toBe(0)
  }finally{await f.close()}
 })
 it('requires consent over HTTP and never dispatches or leaks receipts to other roles',async()=>{
  const f=await setup(),url=new URL(connectionString!);url.username='yux_api'
  const pool=createContextAwarePool(new pg.Pool({connectionString:url.toString()}),'api');let dispatched=0
  const app=await buildServer({NODE_ENV:'test',DATABASE_URL:connectionString!,REDIS_URL:'redis://127.0.0.1:1',SESSION_COOKIE_NAME:'yux_session',SESSION_SECRET:'local-continuation-test-secret-at-least-32',CORS_ORIGIN:'http://localhost:3000',PORT:4000},{pool,jobQueue:{add:async()=>{dispatched++;return{id:'fake'}},close:async()=>{}},redisPing:async()=>'PONG'})
  try{
   await activateCaptureSearch(f.pool)
   const cookies=new Map<string,string>()
   const post=async(role:keyof typeof fixtureUsers,consent?:boolean)=>{
    if(!cookies.has(role)){
     const login=await app.inject({method:'POST',url:'/api/auth/login',payload:{email:fixtureUsers[role].email,password:fixturePassword}})
     expect(login.statusCode).toBe(200);cookies.set(role,String(login.headers['set-cookie']).split(';')[0])
    }
    return app.inject({method:'POST',url:`/api/radar/capture-operations/${f.input.operationId}/resume`,headers:{cookie:cookies.get(role)!},payload:{organizationId,configurationRevision:1,requestId:f.resume.requestId,...(consent===undefined?{}:{restartExpiredContinuation:consent}),...(consent?{continuationReceiptId:f.consent.continuationReceiptId,continuationStateId:f.consent.continuationStateId}:{})}})
   }
   for(const role of ['yux_operator','client_admin_A','client_member_A','client_admin_B'] as const){
    const response=await post(role,true)
    expect(response.statusCode).toBe(403)
    expect(response.body).not.toMatch(/expired-token|captureContinuationRecovery|pageToken|cnpja/i)
   }
   expect((await post('yux_admin')).json()).toEqual({error:'radar_capture_continuation_confirmation_required',continuationReceiptId:f.consent.continuationReceiptId,continuationStateId:f.consent.continuationStateId})
   expect(dispatched).toBe(0)
   expect((await post('yux_admin',false)).statusCode).toBe(409)
   const response=await post('yux_admin',true)
   expect(response.statusCode).toBe(202)
   expect(response.json()).toMatchObject({id:f.input.operationId,status:'queued',counts:{requested:20}})
   expect(response.body).not.toMatch(/expired-token|captureContinuationRecovery|pageToken/)
   expect(dispatched).toBe(1)
  }finally{await app.close();await pool.end();await f.close()}
 },20_000)
 it('rejects receipt-only and stale legacy HTTP consent after policy changes without any mutation',async()=>{
  const f=await setup(),url=new URL(connectionString!);url.username='yux_api'
  const pool=createContextAwarePool(new pg.Pool({connectionString:url.toString()}),'api');let dispatched=0
  const app=await buildServer({NODE_ENV:'test',DATABASE_URL:connectionString!,REDIS_URL:'redis://127.0.0.1:1',SESSION_COOKIE_NAME:'yux_session',SESSION_SECRET:'local-continuation-test-secret-at-least-32',CORS_ORIGIN:'http://localhost:3000',PORT:4000},{pool,jobQueue:{add:async()=>{dispatched++;return{id:'fake'}},close:async()=>{}},redisPing:async()=>'PONG'})
  try{
   const login=await app.inject({method:'POST',url:'/api/auth/login',payload:{email:admin.email,password:fixturePassword}})
   expect(login.statusCode).toBe(200)
   const headers={cookie:String(login.headers['set-cookie']).split(';')[0]},path=`/api/radar/capture-operations/${f.input.operationId}/resume`
   const displayed=await app.inject({method:'POST',url:path,headers,payload:{organizationId,configurationRevision:1,requestId:randomUUID()}})
   expect(displayed.statusCode).toBe(409)
   await f.pool.query('UPDATE public.radar_operational_limits SET version=version+1 WHERE singleton=TRUE')
   const before=await f.state()
   for(const binding of [{},{continuationStateId:displayed.json().continuationStateId}]){
    const response=await app.inject({method:'POST',url:path,headers,payload:{organizationId,configurationRevision:1,requestId:randomUUID(),restartExpiredContinuation:true,continuationReceiptId:f.consent.continuationReceiptId,...binding}})
    expect(response.statusCode).toBe(409)
    expect(response.json().error).toBe('radar_capture_continuation_confirmation_stale')
    expect(await f.state()).toEqual(before)
    expect((await f.pool.query('SELECT * FROM public.radar_continuation_authorizations WHERE campaign_id=$1',[f.campaign.id])).rows).toHaveLength(0)
   }
   expect(dispatched).toBe(0)
  }finally{await app.close();await pool.end();await f.close()}
 },20_000)
 it.each(['same_scope','other_scope'])('rejects old consent after a new rejected receipt in %s',async mode=>{
  const f=await setup()
  try{
   await resumeRadarCaptureOperation(f.pool,admin,{...f.consent,requestId:randomUUID()},{availability:available})
   await advanceRadarCaptureDiscovery(f.pool,{} as never,f.input,{availability:available,loadSecret:async()=>'fixture',searchPage:async()=>({candidates:[],nextToken:'new-token'})})
   await advanceRadarCaptureDiscovery(f.pool,{} as never,f.input,{availability:available,loadSecret:async()=>'fixture',searchPage:async()=>{throw new CnpjaSearchHttpError('HTTP 400: token is invalid or expired',400)}})
   if(mode==='other_scope'){
    await f.pool.query("UPDATE public.radar_capture_operations SET configuration_snapshot=jsonb_set(configuration_snapshot,'{target_states}','[\"PR\",\"SP\"]') WHERE id=$1",[f.input.operationId])
    await f.pool.query("UPDATE public.radar_enrichment_runs SET input_payload=jsonb_set(input_payload,'{regionalState}','\"SP\"') WHERE id=(SELECT id FROM public.radar_enrichment_runs WHERE campaign_id=$1 ORDER BY started_at DESC LIMIT 1)",[f.campaign.id])
    await f.pool.query("UPDATE public.radar_regional_discovery_cursors SET scope_key='v1:SP:all',state='SP' WHERE campaign_id=$1",[f.campaign.id])
   }
   const before=await f.state()
   expect(before.runs[0].input_payload.pageToken).toBe('new-token')
   expect(before.runs[0].id).not.toBe(f.consent.continuationReceiptId)
   await expect(resumeRadarCaptureOperation(f.pool,admin,f.consent,{availability:available})).rejects.toThrow('radar_capture_continuation_confirmation_stale')
   expect(await f.state()).toEqual(before)
  }finally{await f.close()}
 })
 it('never accepts unbound consent even for a currently proven expired cursor',async()=>{
  const f=await setup()
  try{
   const before=await f.state()
   await expect(resumeRadarCaptureOperation(f.pool,admin,{...f.resume,...confirmed},{availability:available})).rejects.toThrow('radar_capture_continuation_confirmation_stale')
   expect(await f.state()).toEqual(before)
  }finally{await f.close()}
 })
})
