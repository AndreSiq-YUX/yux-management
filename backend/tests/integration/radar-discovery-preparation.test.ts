import {describe,it,expect} from 'vitest'
import {randomUUID} from 'node:crypto'
import {captureFixture,connectionString,admin,organizationId,available,company} from '../support/radar-capture-fixture.js'
import {startRadarCaptureOperation,getRadarCaptureOperation} from '../../src/modules/radar/capture-operation.js'
import {advanceRadarCaptureDiscovery} from '../../src/modules/radar/capture-discovery.js'
import {resumeRadarCaptureOperation} from '../../src/modules/radar/capture-dispatch.js'
import {getRadarCapturePreflight} from '../../src/modules/radar/capture-preflight.js'
import {CnpjaPreparationError} from '../../src/modules/radar/cnpjaClient.js'
import {radarRegistryDiscoveryCandidate} from '../../src/modules/radar/discovery-providers.js'

const env={PROVIDER_SECRET_ENCRYPTION_KEY_B64:Buffer.alloc(32,7).toString('base64')} as never
describe.skipIf(!connectionString)('discovery preparation and legacy uncertainty with isolated PostgreSQL',()=>{
 it.each([false,true])('releases the reservation once for a proven unsent request (adaptive=%s)',async adaptive=>{
  const f=await captureFixture()
  try{
   if(adaptive)await f.pool.query(`UPDATE radar_campaigns SET search_configuration=search_configuration||'{"discovery":{"enabled":true,"sourceOrder":["cnpja_advanced_search"],"terms":[]},"qualification":{"includeAnyTerms":["atividade configurada"]}}'::jsonb WHERE id=$1`,[f.campaign.id])
   const start=await startRadarCaptureOperation(f.pool,admin,{organizationId,campaignId:f.campaign.id,configurationRevision:1,requestedCount:40,requestId:randomUUID()},{availability:available})
   let calls=0
   const reject=async()=>{calls++;throw new CnpjaPreparationError('cnpja_municipality_not_found')}
   const dependencies={availability:available,loadSecret:async()=>'fixture',searchPage:reject,adaptiveDiscover:reject}
   const result=await advanceRadarCaptureDiscovery(f.pool,env,{organizationId,operationId:start.operationId},dependencies)
   expect(result.blockers).toContain('cnpja_municipality_not_found')
   const usage=async()=>(await f.pool.query('SELECT units::int AS units,estimated_cost FROM radar_source_usage_counters WHERE campaign_id=$1',[f.campaign.id])).rows
   expect(await usage()).toEqual([expect.objectContaining({units:0,estimated_cost:'0.000000'})])
   // A redelivered worker turn must neither retry a blocked operation nor refund twice.
   await advanceRadarCaptureDiscovery(f.pool,env,{organizationId,operationId:start.operationId},dependencies)
   expect(calls).toBe(1);expect(await usage()).toEqual([expect.objectContaining({units:0,estimated_cost:'0.000000'})])
   if(adaptive)expect((await f.pool.query('SELECT status,cost_estimate_brl::float AS cost,error_code FROM radar_discovery_pages WHERE operation_id=$1',[start.operationId])).rows[0]).toMatchObject({status:'rejected',cost:0,error_code:'cnpja_municipality_not_found'})
   else expect((await f.pool.query('SELECT output_payload FROM radar_enrichment_runs WHERE campaign_id=$1',[f.campaign.id])).rows[0].output_payload).toMatchObject({discoveryOutcome:'not_dispatched',estimatedCost:0,requestStarted:false})
  }finally{await f.close()}
 })
 it('rolls back the rejection receipt too if its reservation cannot be released',async()=>{
  const f=await captureFixture(),suffix=randomUUID().replaceAll('-',''),name=`qa_refund_${suffix}`
  try{
   await f.pool.query(`UPDATE radar_campaigns SET search_configuration=search_configuration||'{"discovery":{"enabled":true,"sourceOrder":["cnpja_advanced_search"],"terms":[]},"qualification":{"includeAnyTerms":["atividade configurada"]}}'::jsonb WHERE id=$1`,[f.campaign.id])
   const start=await startRadarCaptureOperation(f.pool,admin,{organizationId,campaignId:f.campaign.id,configurationRevision:1,requestedCount:1,requestId:randomUUID()},{availability:available})
   // Fault injection in the disposable database: never report a free rejection
   // while its cost/quota reservation remains unreconciled.
   await f.pool.query(`CREATE FUNCTION ${name}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.campaign_id='${f.campaign.id}'::uuid AND NEW.units<OLD.units THEN RAISE EXCEPTION 'synthetic_refund_interrupted'; END IF; RETURN NEW; END $$`)
   await f.pool.query(`CREATE TRIGGER ${name} BEFORE UPDATE ON radar_source_usage_counters FOR EACH ROW EXECUTE FUNCTION ${name}()`)
   await advanceRadarCaptureDiscovery(f.pool,env,{organizationId,operationId:start.operationId},{availability:available,adaptiveDiscover:async()=>{throw new CnpjaPreparationError('cnpja_municipality_not_found')}})
   expect((await f.pool.query('SELECT status,cost_estimate_brl::float AS cost FROM radar_discovery_pages WHERE operation_id=$1',[start.operationId])).rows[0]).toEqual({status:'reserved',cost:.025})
   expect((await f.pool.query('SELECT units::int AS units,estimated_cost::float AS cost FROM radar_source_usage_counters WHERE campaign_id=$1',[f.campaign.id])).rows[0]).toEqual({units:1,cost:.025})
  }finally{
   await f.pool.query(`DROP TRIGGER IF EXISTS ${name} ON radar_source_usage_counters`)
   await f.pool.query(`DROP FUNCTION IF EXISTS ${name}()`)
   await f.close()
  }
 })
 it.each([false,true])('does not refund dispatched units or discard a received reply (responseSaved=%s)',async responseSaved=>{
  const f=await captureFixture()
  try{
   await f.pool.query(`UPDATE radar_campaigns SET search_configuration=search_configuration||'{"discovery":{"enabled":true,"sourceOrder":["cnpja_advanced_search"],"terms":[]},"qualification":{"includeAnyTerms":["atividade configurada"]}}'::jsonb WHERE id=$1`,[f.campaign.id])
   const start=await startRadarCaptureOperation(f.pool,admin,{organizationId,campaignId:f.campaign.id,configurationRevision:1,requestedCount:1,requestId:randomUUID()},{availability:available})
   await advanceRadarCaptureDiscovery(f.pool,env,{organizationId,operationId:start.operationId},{availability:available,adaptiveDiscover:async input=>{
    if(responseSaved)await input.onResponse?.({records:[]})
    throw Object.assign(Error('synthetic_not_billed'),{billingOutcome:'not_billed',requestStarted:true})
   }})
   const expectedCost=responseSaved?.025:0
   expect((await f.pool.query('SELECT status,cost_estimate_brl::float AS cost,response_body FROM radar_discovery_pages WHERE operation_id=$1',[start.operationId])).rows[0]).toMatchObject({status:responseSaved?'received':'rejected',cost:expectedCost,response_body:responseSaved?{records:[]}:null})
   expect((await f.pool.query('SELECT units::int AS units,estimated_cost::float AS cost FROM radar_source_usage_counters WHERE campaign_id=$1',[f.campaign.id])).rows[0]).toEqual({units:1,cost:expectedCost})
  }finally{await f.close()}
 })
 it('keeps a post-send timeout charged and uncertain, then resumes the same forty-company lot only with explicit acknowledgement',async()=>{
  const f=await captureFixture()
  try{
   await f.pool.query(`UPDATE radar_campaigns SET search_configuration=search_configuration||'{"discovery":{"enabled":true,"sourceOrder":["cnpja_advanced_search"],"terms":[]},"qualification":{"includeAnyTerms":["atividade configurada"]}}'::jsonb WHERE id=$1`,[f.campaign.id])
   const start=await startRadarCaptureOperation(f.pool,admin,{organizationId,campaignId:f.campaign.id,configurationRevision:1,requestedCount:40,requestId:randomUUID()},{availability:available})
   let calls=0
   const first=await advanceRadarCaptureDiscovery(f.pool,env,{organizationId,operationId:start.operationId},{availability:available,adaptiveDiscover:async()=>{calls++;throw Error('The operation timed out')}})
   expect(first.blockers).toContain('radar_discovery_request_uncertain')
   const original=(await f.pool.query('SELECT * FROM radar_discovery_pages WHERE operation_id=$1',[start.operationId])).rows[0]
   expect(original).toMatchObject({status:'uncertain',response_body:null,normalized_page:null})
   expect(Number((await f.pool.query('SELECT units FROM radar_source_usage_counters WHERE campaign_id=$1',[f.campaign.id])).rows[0].units)).toBe(1)
   await f.pool.query("UPDATE radar_discovery_pages SET lease_until=NOW()-INTERVAL '1 second' WHERE id=$1",[original.id])
   const input={organizationId,campaignId:f.campaign.id,operationId:start.operationId,configurationRevision:1,requestedCount:40}
   const preflight=await getRadarCapturePreflight(f.pool,admin,input,{availability:available})
   expect(preflight.continuations).toEqual([expect.objectContaining({reason:'uncertain',requiresRestartConfirmation:true})])
   await expect(resumeRadarCaptureOperation(f.pool,admin,{organizationId,operationId:start.operationId,configurationRevision:1,requestId:randomUUID()},{availability:available})).rejects.toThrow('radar_capture_continuation_confirmation_required')
   const requestId=randomUUID()
   await resumeRadarCaptureOperation(f.pool,admin,{organizationId,operationId:start.operationId,configurationRevision:1,requestId,continuationAuthorizations:preflight.continuations.map(state=>({scopeKey:state.scopeKey,expectedStateId:state.stateId}))},{availability:available})
   const prospect=radarRegistryDiscoveryCandidate(company())!
   const discover=async(input:any)=>{calls++;expect(input.continuation.restartAuthorization).toMatchObject({requestId,acknowledgedPreviousCharge:true});return{candidates:[prospect],documents:[],exhaustion:'exhausted' as const}}
   for(let turn=0;turn<2;turn++)await advanceRadarCaptureDiscovery(f.pool,env,{organizationId,operationId:start.operationId},{availability:available,adaptiveDiscover:discover})
   const lot=await getRadarCaptureOperation(f.pool,admin,organizationId,start.operationId)
   expect(lot.counts).toMatchObject({requested:40,admitted:1});expect(calls).toBe(2)
   expect((await f.pool.query('SELECT status,response_body,normalized_page,cost_estimate_brl,extraction FROM radar_discovery_pages WHERE id=$1',[original.id])).rows[0]).toMatchObject({status:'uncertain',response_body:null,normalized_page:null,cost_estimate_brl:original.cost_estimate_brl,extraction:{restartAuthorization:{requestId,acknowledgedPreviousCharge:true}}})
   expect(Number((await f.pool.query('SELECT COUNT(*) AS n FROM radar_capture_operations WHERE campaign_id=$1',[f.campaign.id])).rows[0].n)).toBe(1)
  }finally{await f.close()}
 })
})
