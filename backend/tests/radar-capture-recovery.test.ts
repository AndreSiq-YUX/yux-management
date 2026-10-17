import {describe,it,expect} from 'vitest'
import {randomUUID} from 'node:crypto'
import {captureFixture,connectionString,admin,organizationId,available,company} from './support/radar-capture-fixture.js'
import {fixtureIds,fixtureUsers} from './integration/support/fixtures.js'
import {startRadarCaptureOperation,getRadarCaptureOperation} from '../src/modules/radar/capture-operation.js'
import {advanceRadarCaptureDiscovery} from '../src/modules/radar/capture-discovery.js'
import {resumeRadarCaptureOperation} from '../src/modules/radar/capture-dispatch.js'
import {CnpjaSearchHttpError} from '../src/modules/radar/cnpjaClient.js'

describe.skipIf(!connectionString)('rejected capture recovery with PostgreSQL',()=>{
 async function setup(){
  const f=await captureFixture()
  const started=await startRadarCaptureOperation(f.pool,admin,{organizationId,campaignId:f.campaign.id,configurationRevision:1,requestId:randomUUID(),requestedCount:20},{availability:available})
  const input={organizationId,operationId:started.operationId}
  const resume={...input,configurationRevision:1,requestId:randomUUID()}
  const op=async()=> (await f.pool.query('SELECT * FROM public.radar_capture_operations WHERE id=$1',[started.operationId])).rows[0]
  const runs=async()=> (await f.pool.query('SELECT * FROM public.radar_enrichment_runs WHERE campaign_id=$1 ORDER BY started_at',[f.campaign.id])).rows
  const fail=async(error:Error)=>advanceRadarCaptureDiscovery(f.pool,{} as never,input,{availability:available,loadSecret:async()=>'fixture',searchPage:async()=>{throw error}})
  const legacy=async()=>{
   await fail(new Error('request validation failed'))
   await f.pool.query(`UPDATE public.radar_enrichment_runs SET input_payload=input_payload-'captureOperationId',output_payload=output_payload-'discoveryOutcome'-'httpStatus' WHERE campaign_id=$1`,[f.campaign.id])
  }
  return{...f,input,resume,op,runs,fail,legacy}
 }

 it.each([400,422])('persists rejection HTTP %i and resumes the same lot without erasing prior companies or usage',async status=>{
  const f=await setup()
  try{
   await f.pool.query(`INSERT INTO public.radar_candidate_records(organization_id,campaign_id,source_type,title,dedupe_key,normalized_payload) VALUES($1,$2,'cnpja_advanced_search','Anterior','old','{"websiteUrl":"https://old.example/"}')`,[organizationId,f.campaign.id])
   const state=await f.fail(new CnpjaSearchHttpError('request validation failed',status))
   expect(state).toMatchObject({status:'blocked',counts:{requested:20,admitted:0},blockers:['radar_capture_discovery_request_rejected']})
   expect(await f.op()).toMatchObject({discovery_pending:false,queries:1})
   expect((await f.runs())[0]).toMatchObject({status:'failed',input_payload:{captureOperationId:f.input.operationId},output_payload:{discoveryOutcome:'rejected',httpStatus:status}})
   await Promise.all([1,2].map(()=>resumeRadarCaptureOperation(f.pool,admin,f.resume,{availability:available})))
   expect(await f.op()).toMatchObject({id:f.input.operationId,status:'queued',resume_generation:1,queries:1,requested_count:20})
   expect((await f.runs())).toHaveLength(1)
   await advanceRadarCaptureDiscovery(f.pool,{} as never,f.input,{availability:available,loadSecret:async()=>'fixture',searchPage:async()=>({candidates:[company()]})})
   expect((await getRadarCaptureOperation(f.pool,admin,organizationId,f.input.operationId)).counts.admitted).toBe(1)
   expect((await f.pool.query("SELECT normalized_payload FROM public.radar_candidate_records WHERE campaign_id=$1 AND dedupe_key='old'",[f.campaign.id])).rows[0].normalized_payload).toEqual({websiteUrl:'https://old.example/'})
   expect((await f.op()).queries).toBe(2)
  }finally{await f.close()}
 })

 it.each([new TypeError('fetch failed'),new CnpjaSearchHttpError('unavailable',503),new Error('request validation failed')])('never clears an uncertain response: %s',async failure=>{
  const f=await setup()
  try{
   await f.fail(failure)
   expect((await f.op()).discovery_pending).toBe(true)
   await expect(resumeRadarCaptureOperation(f.pool,admin,f.resume,{availability:available})).rejects.toThrow('radar_capture_discovery_uncertain')
   expect((await f.runs())).toHaveLength(1)
   expect((await f.op()).discovery_pending).toBe(true)
  }finally{await f.close()}
 })

 it('recovers the single legacy validation rejection only on explicit resume and records its receipt',async()=>{
  const f=await setup()
  try{
   await f.legacy()
   expect((await f.op()).discovery_pending).toBe(true)
   await resumeRadarCaptureOperation(f.pool,admin,f.resume,{availability:available})
   expect(await f.op()).toMatchObject({status:'queued',discovery_pending:false,queries:1,requested_count:20})
   const [run]=await f.runs()
   expect(run).toMatchObject({status:'failed',error_message:'request validation failed',output_payload:{captureRecovery:{operationId:f.input.operationId,reason:'legacy_validation_rejection'}}})
   expect(run.output_payload.captureRecovery.recoveredAt).toBeTruthy()
   expect((await f.runs())).toHaveLength(1)
  }finally{await f.close()}
 })

 it.each(['ambiguous','wrong_revision','different_operation','running','active_lease','has_result'])('refuses unsafe legacy recovery: %s',async mode=>{
  const f=await setup()
  try{
   await f.legacy()
   if(mode==='ambiguous')await f.pool.query(`INSERT INTO public.radar_enrichment_runs(organization_id,campaign_id,status,provider,input_payload,output_payload,started_at) VALUES($1,$2,'running','cnpja_advanced_search','{}','{}',NOW())`,[organizationId,f.campaign.id])
   if(mode==='wrong_revision')await f.pool.query(`UPDATE public.radar_enrichment_runs SET input_payload=jsonb_set(input_payload,'{configurationRevision}','2') WHERE campaign_id=$1`,[f.campaign.id])
   if(mode==='different_operation')await f.pool.query(`UPDATE public.radar_enrichment_runs SET input_payload=jsonb_set(input_payload,'{captureOperationId}',to_jsonb($2::text)) WHERE campaign_id=$1`,[f.campaign.id,randomUUID()])
   if(mode==='running')await f.pool.query("UPDATE public.radar_enrichment_runs SET status='running' WHERE campaign_id=$1",[f.campaign.id])
   if(mode==='active_lease')await f.pool.query("UPDATE public.radar_capture_operations SET lease_id=$2,lease_until=NOW()+INTERVAL '1 minute' WHERE id=$1",[f.input.operationId,randomUUID()])
   if(mode==='has_result')await f.pool.query(`UPDATE public.radar_enrichment_runs SET output_payload=jsonb_set(output_payload,'{candidateCount}','1') WHERE campaign_id=$1`,[f.campaign.id])
   await expect(resumeRadarCaptureOperation(f.pool,admin,f.resume,{availability:available})).rejects.toThrow('radar_capture_discovery_uncertain')
   expect((await f.op()).discovery_pending).toBe(true)
   expect((await f.op()).resume_generation).toBe(0)
  }finally{await f.close()}
 })

 it('does not requeue a rejected lot while its worker still owns an active lease',async()=>{
  const f=await setup()
  try{
   await f.fail(new CnpjaSearchHttpError('request validation failed',422))
   await f.pool.query("UPDATE public.radar_capture_operations SET lease_id=$2,lease_until=NOW()+INTERVAL '1 minute' WHERE id=$1",[f.input.operationId,randomUUID()])
   await expect(resumeRadarCaptureOperation(f.pool,admin,f.resume,{availability:available})).rejects.toThrow('radar_capture_in_progress')
   expect((await f.op()).resume_generation).toBe(0)
  }finally{await f.close()}
 })

 it('recovers a linked rejection receipt without borrowing another operation or account',async()=>{
  const f=await setup()
  try{
   await f.fail(new CnpjaSearchHttpError('request validation failed',422))
   await f.pool.query('UPDATE public.radar_capture_operations SET discovery_pending=TRUE WHERE id=$1',[f.input.operationId])
   await expect(resumeRadarCaptureOperation(f.pool,admin,{...f.resume,organizationId:fixtureIds.organizationA},{availability:available})).rejects.toThrow()
   await expect(resumeRadarCaptureOperation(f.pool,fixtureUsers.client_admin_A as typeof admin,f.resume,{availability:available})).rejects.toThrow()
   expect((await f.op()).discovery_pending).toBe(true)
   await resumeRadarCaptureOperation(f.pool,admin,f.resume,{availability:available})
   expect(await f.op()).toMatchObject({status:'queued',discovery_pending:false})
   expect((await f.runs())[0].output_payload.captureRecovery.reason).toBe('confirmed_validation_rejection')
  }finally{await f.close()}
 })

 it('does not free pending discovery if writing the rejection receipt fails',async()=>{
  const f=await setup()
  const name=`radar_recovery_test_${randomUUID().replaceAll('-','')}`
  try{
   await f.pool.query(`CREATE FUNCTION public.${name}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id='${f.input.operationId}' AND OLD.discovery_pending AND NOT NEW.discovery_pending THEN RAISE EXCEPTION 'simulated_persistence_failure'; END IF; RETURN NEW; END $$`)
   await f.pool.query(`CREATE TRIGGER ${name} BEFORE UPDATE ON public.radar_capture_operations FOR EACH ROW EXECUTE FUNCTION public.${name}()`)
   await f.fail(new CnpjaSearchHttpError('request validation failed',422))
   expect((await f.op()).discovery_pending).toBe(true)
   expect((await f.runs())[0].status).toBe('running')
  }finally{
   await f.pool.query(`DROP TRIGGER IF EXISTS ${name} ON public.radar_capture_operations`)
   await f.pool.query(`DROP FUNCTION IF EXISTS public.${name}()`)
   await f.close()
  }
 })
})
