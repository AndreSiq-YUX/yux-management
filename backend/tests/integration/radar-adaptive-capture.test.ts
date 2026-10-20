import {describe,it,expect} from 'vitest'
import {randomUUID} from 'node:crypto'
import pg from 'pg'
import {createContextAwarePool} from '../../src/db/client.js'
import {runWithDatabaseRequestContext} from '../../src/db/request-context.js'
import {captureFixture as baseCaptureFixture,connectionString,organizationId,admin,available} from '../support/radar-capture-fixture.js'
import {startRadarCaptureOperation} from '../../src/modules/radar/capture-operation.js'
import {advanceRadarCaptureDiscovery} from '../../src/modules/radar/capture-discovery.js'
import {radarRegistryDiscoveryCandidate} from '../../src/modules/radar/discovery-providers.js'
import {getRadarCapturePreflight} from '../../src/modules/radar/capture-preflight.js'
import {getRadarCaptureOperation} from '../../src/modules/radar/capture-operation.js'
import {dispatchRadarCaptureOperation,resumeRadarCaptureOperation} from '../../src/modules/radar/capture-dispatch.js'
import {executeRadarCandidateResearch} from '../../src/modules/radar/research-service.js'
async function captureFixture(){
 const fixture=await baseCaptureFixture()
 await fixture.pool.query(`UPDATE radar_campaigns SET search_configuration=jsonb_set(search_configuration,'{qualification,includeAnyTerms}','["atividade configurada"]') WHERE id=$1`,[fixture.campaign.id])
 return fixture
}

describe.skipIf(!connectionString)('adaptive v2 capture preserves actual paid pages and v1 semantics',()=>{
 it('does not buy discovery for a qualified target with no way to qualify companies',async()=>{
  const f=await captureFixture()
  try{
   await f.pool.query(`UPDATE radar_campaigns SET search_configuration=search_configuration||'{"discovery":{"enabled":true,"sourceOrder":["cnpja_advanced_search"],"terms":[]},"qualification":{"includeAnyTerms":[],"includeAllTerms":[],"requireCnaeMatch":false}}'::jsonb WHERE id=$1`,[f.campaign.id])
   const result=await getRadarCapturePreflight(f.pool,admin,{organizationId,campaignId:f.campaign.id,configurationRevision:1,requestedCount:2},{availability:available})
   expect(result).toMatchObject({allowed:false,blockers:expect.arrayContaining([expect.objectContaining({code:'radar_discovery_qualification_criteria_required'})])})
  }finally{await f.close()}
 })
 it('recovers a captured reply after parser interruption without buying again, even when new search capacity is exhausted',async()=>{
  const f=await captureFixture()
  try{
   await f.pool.query(`UPDATE radar_campaigns SET search_configuration=jsonb_set(search_configuration,'{discovery}','{"enabled":true,"sourceOrder":["cnpja_advanced_search"],"terms":[]}'::jsonb) WHERE id=$1`,[f.campaign.id])
   const start=await startRadarCaptureOperation(f.pool,admin,{organizationId,campaignId:f.campaign.id,configurationRevision:1,requestedCount:1,requestId:randomUUID()},{availability:available})
   const env={PROVIDER_SECRET_ENCRYPTION_KEY_B64:Buffer.alloc(32,7).toString('base64')} as never;let purchases=0
   const adaptiveDiscover=async(input:any)=>{purchases++;await input.onResponse({records:[{taxId:'37335118000180',company:{name:'Empresa Alfa'},address:{municipality:'Curitiba',state:'PR'}}]});throw Error('synthetic_parser_interrupted')}
   await advanceRadarCaptureDiscovery(f.pool,env,{organizationId,operationId:start.operationId},{availability:available,adaptiveDiscover})
   const exhausted=async()=>({allowed:false,reasons:[{code:'source_limit_exceeded',message:'fixture',resolution:'fixture'}]})
   await resumeRadarCaptureOperation(f.pool,admin,{organizationId,operationId:start.operationId,configurationRevision:1,requestId:randomUUID()},{availability:exhausted})
   for(let i=0;i<2;i++)await advanceRadarCaptureDiscovery(f.pool,env,{organizationId,operationId:start.operationId},{availability:exhausted,adaptiveDiscover})
   expect(purchases).toBe(1)
   expect((await getRadarCaptureOperation(f.pool,admin,organizationId,start.operationId)).counts.admitted).toBe(1)
   expect((await f.pool.query('SELECT status,response_body FROM radar_discovery_pages WHERE operation_id=$1',[start.operationId])).rows[0]).toMatchObject({status:'admitted',response_body:{records:expect.any(Array)}})
  }finally{await f.close()}
 })
 it('advances the frozen geography window when a region reaches its page cap, without skipping the next state',async()=>{
  const f=await captureFixture(),old=(await f.pool.query('SELECT configuration FROM radar_discovery_policy WHERE singleton')).rows[0].configuration
  try{
   await f.pool.query(`UPDATE radar_discovery_policy SET configuration=jsonb_set(configuration,'{windowSize}','1') WHERE singleton`)
   await f.pool.query(`UPDATE radar_campaigns SET target_states=ARRAY['PR','SP'],search_configuration=search_configuration||'{"discovery":{"enabled":true,"sourceOrder":["cnpja_advanced_search"],"terms":[]},"batch":{"pageSize":10,"maxPagesPerScope":1,"maxQueriesPerBatch":5}}'::jsonb WHERE id=$1`,[f.campaign.id])
   const start=await startRadarCaptureOperation(f.pool,admin,{organizationId,campaignId:f.campaign.id,configurationRevision:1,requestedCount:2,requestId:randomUUID()},{availability:available})
   const states:string[]=[],env={PROVIDER_SECRET_ENCRYPTION_KEY_B64:Buffer.alloc(32,7).toString('base64')} as never
   const adaptiveDiscover=async(input:any)=>{states.push(input.scope.state);expect(input.continuation).toBeUndefined();return{candidates:[],documents:[],exhaustion:'more' as const,continuation:{token:'next-in-this-state'}}}
   for(let i=0;i<4;i++)await advanceRadarCaptureDiscovery(f.pool,env,{organizationId,operationId:start.operationId},{availability:available,adaptiveDiscover})
   expect(states).toEqual(['PR','SP'])
  }finally{await f.pool.query('UPDATE radar_discovery_policy SET configuration=$1::jsonb WHERE singleton',[JSON.stringify(old)]);await f.close()}
 })
 it('finishes 20 qualified companies through real child workers, preserving three excluded registrations and all paid surplus',async()=>{
  const f=await captureFixture()
  const url=new URL(connectionString!);url.username='yux_worker'
  const rawWorker=new pg.Pool({connectionString:url.toString()}),worker=createContextAwarePool(rawWorker,'worker')
  const scoped=<T>(action:()=>Promise<T>)=>runWithDatabaseRequestContext({role:'client_member',organizationIds:[organizationId],serviceRole:'worker'},action)
  try{
   await f.pool.query(`UPDATE radar_campaigns SET search_configuration=search_configuration||$2::jsonb WHERE id=$1`,[f.campaign.id,JSON.stringify({discovery:{enabled:true,sourceOrder:['cnpja_advanced_search'],terms:[]},sources:{enrichWithBrave:false,inspectWebsite:true},qualification:{includeAnyTerms:['atividade configurada'],excludeTerms:['tabacaria']},research:{enabled:true,webSearchEnabled:true,localSearchOrder:'disabled',maxSearchQueriesPerCandidate:1,maxPagesPerCandidate:2}})])
   const taxId=(index:number)=>{let value=`81234567${String(index).padStart(4,'0')}`;for(let digit=0;digit<2;digit++){const sum=[...value].reverse().reduce((sum,char,i)=>sum+Number(char)*(i%8+2),0),rest=sum%11;value+=rest<2?'0':String(11-rest)}return value}
   const prospects=Array.from({length:23},(_,index)=>radarRegistryDiscoveryCandidate({taxId:taxId(index+1),legalName:`Empresa Alfa ${index+1}`,city:'Curitiba',state:'PR',cnaes:[],websiteStatus:'unknown',rawPayload:{}})!)
   const start=await startRadarCaptureOperation(f.pool,admin,{organizationId,campaignId:f.campaign.id,configurationRevision:1,requestedCount:20,requestId:randomUUID()},{availability:available})
   const env={PROVIDER_SECRET_ENCRYPTION_KEY_B64:Buffer.alloc(32,7).toString('base64')} as never;let discoveries=0
   const executionQueue={add:async(_name:string,data:any)=>executeRadarCandidateResearch(worker,env,data,undefined,{loadSecret:async()=> 'synthetic',web:async input=>{const index=Number(/(\d+)$/.exec(input.query)?.[1]??1);return[{url:`https://empresa-${index}.example/`,title:`Empresa Alfa ${index}`,snippets:[`Empresa Alfa ${index} CNPJ ${taxId(index)}`],observedAt:'2026-10-20T12:00:00Z'}]},collect:async url=>{const index=Number(/empresa-(\d+)/.exec(url)?.[1]);return[{url,text:`Somos Empresa Alfa ${index} CNPJ ${taxId(index)} ${index<=3?'tabacaria':'atividade configurada'} . Contato: compras@empresa-${index}.example`,observedAt:'2026-10-20T12:00:00Z'}]}})}
   const jobs=new Set<string>();let yields=0
   const queue={add:async(name:string,data:any,options:{jobId:string})=>{
    expect(jobs.has(options.jobId)).toBe(false);jobs.add(options.jobId)
    const before=Object.keys((await f.pool.query('SELECT calls FROM radar_candidate_research_runs WHERE id=$1',[data.runId])).rows[0].calls).length
    const result=await executionQueue.add(name,data)
    const after=Object.keys((await f.pool.query('SELECT calls FROM radar_candidate_research_runs WHERE id=$1',[data.runId])).rows[0].calls).length
    expect(after-before).toBeLessThanOrEqual(1)
    if('yielded' in result&&result.yielded)yields++
    return result
   }}
   for(let turn=0;turn<20;turn++){
    const result=await scoped(()=>dispatchRadarCaptureOperation(worker,env,{organizationId,operationId:start.operationId},queue as never,undefined,{availability:available,discover:(pool,env,input)=>advanceRadarCaptureDiscovery(pool,env,input,{availability:available,adaptiveDiscover:async()=>{discoveries++;return{candidates:prospects,documents:[],exhaustion:'exhausted'}}})}))
    if(result?.status==='completed')break
   }
   const result=await getRadarCaptureOperation(f.pool,admin,organizationId,start.operationId)
   const diagnostics=(await f.pool.query(`SELECT candidate.title,review.target_status,review.reasons,run.output->'discovery' AS discovery,run.output->'limitations' AS limitations,run.output->'siteAssociation' AS association FROM radar_candidate_records candidate LEFT JOIN radar_b2b_reviews review ON review.candidate_id=candidate.id LEFT JOIN radar_candidate_research_runs run ON run.candidate_id=candidate.id WHERE candidate.campaign_id=$1 ORDER BY candidate.title LIMIT 2`,[f.campaign.id])).rows
   expect(result,JSON.stringify(diagnostics)).toMatchObject({status:'completed',counts:{admitted:23,qualified:20,outsideProfile:3,blocked:0}})
   expect(discoveries).toBe(1)
   expect(yields).toBeGreaterThan(20)
   expect((await f.pool.query('SELECT admitted_offset,status FROM radar_discovery_pages WHERE operation_id=$1',[start.operationId])).rows[0]).toMatchObject({admitted_offset:23,status:'admitted'})
  }finally{await rawWorker.end();await f.close()}
 },30000)
 it('freezes qualified counting, admits a page atomically, and does not repurchase while admitted companies await research',async()=>{
  const f=await captureFixture()
  try{
   await f.pool.query(`UPDATE radar_campaigns SET search_configuration=jsonb_set(search_configuration,'{discovery}','{"enabled":true,"sourceOrder":["cnpja_advanced_search"],"terms":[]}'::jsonb) WHERE id=$1`,[f.campaign.id])
   const start=await startRadarCaptureOperation(f.pool,admin,{organizationId,campaignId:f.campaign.id,configurationRevision:1,requestedCount:2,requestId:randomUUID()},{availability:available})
   expect((await f.pool.query('SELECT pipeline_version,counting_mode FROM radar_capture_operations WHERE id=$1',[start.operationId])).rows[0]).toEqual({pipeline_version:2,counting_mode:'qualified'})
   let calls=0
   const discover=async()=>{calls++;return{candidates:[radarRegistryDiscoveryCandidate({taxId:'37335118000180',legalName:'Empresa Alfa',cnaes:[],websiteStatus:'unknown',rawPayload:{},city:'Curitiba',state:'PR'})!],documents:[],exhaustion:'more' as const,continuation:{token:'next'}}}
   const env={PROVIDER_SECRET_ENCRYPTION_KEY_B64:Buffer.alloc(32,7).toString('base64')} as never
   await advanceRadarCaptureDiscovery(f.pool,env,{organizationId,operationId:start.operationId},{availability:available,adaptiveDiscover:discover} as never)
   // Provider response and admission are separate bounded durable turns.
   expect((await f.pool.query('SELECT status FROM radar_discovery_pages WHERE operation_id=$1',[start.operationId])).rows[0].status).toBe('received')
   await advanceRadarCaptureDiscovery(f.pool,env,{organizationId,operationId:start.operationId},{availability:available,adaptiveDiscover:discover} as never)
   expect((await f.pool.query('SELECT blockers FROM radar_capture_operations WHERE id=$1',[start.operationId])).rows[0].blockers).toEqual([])
   expect((await f.pool.query('SELECT COUNT(*) AS n FROM radar_capture_items WHERE operation_id=$1',[start.operationId])).rows[0].n).toBe('1')
   await advanceRadarCaptureDiscovery(f.pool,env,{organizationId,operationId:start.operationId},{availability:available,adaptiveDiscover:discover} as never)
   expect(calls).toBe(1)
   expect((await f.pool.query('SELECT continuation,status FROM radar_discovery_pages WHERE operation_id=$1',[start.operationId])).rows[0]).toMatchObject({status:'admitted',continuation:{token:'next'}})
   // A discarded registration never fills the qualified target. The SAME lot
   // continues its saved cursor instead of repurchasing the first page.
   const item=(await f.pool.query('SELECT candidate_id FROM radar_capture_items WHERE operation_id=$1',[start.operationId])).rows[0]
   await f.pool.query("UPDATE radar_capture_items SET status='completed' WHERE operation_id=$1",[start.operationId])
   await f.pool.query(`INSERT INTO radar_b2b_reviews(organization_id,campaign_id,candidate_id,configuration_revision,target_status,product_fit,reasons) VALUES($1,$2,$3,1,'not_target','low','{}')`,[organizationId,f.campaign.id,item.candidate_id])
   let token:unknown
   await advanceRadarCaptureDiscovery(f.pool,env,{organizationId,operationId:start.operationId},{availability:available,adaptiveDiscover:async input=>{token=input.continuation;calls++;return{candidates:[],documents:[],exhaustion:'exhausted'}}})
   expect(token).toEqual({token:'next'});expect(calls).toBe(2)
   expect((await getRadarCaptureOperation(f.pool,admin,organizationId,start.operationId)).counts).toMatchObject({qualified:0,outsideProfile:1})
  }finally{await f.close()}
 })
 it('does not require the legacy registry credential for an approved web discovery plan',async()=>{
  const f=await captureFixture()
  try{
   await f.pool.query("UPDATE radar_data_sources SET enabled=FALSE WHERE source_key='cnpja_advanced_search'")
   await f.pool.query("UPDATE platform_provider_connections SET status='disabled' WHERE provider_key='cnpja'")
   await f.pool.query(`UPDATE radar_campaigns SET search_configuration=jsonb_set(search_configuration,'{discovery}','{"enabled":true,"sourceOrder":["brave_web_search"],"terms":[]}'::jsonb) WHERE id=$1`,[f.campaign.id])
   expect((await getRadarCapturePreflight(f.pool,admin,{organizationId,campaignId:f.campaign.id,configurationRevision:1,requestedCount:2},{availability:available})).allowed).toBe(true)
   const result=await startRadarCaptureOperation(f.pool,admin,{organizationId,campaignId:f.campaign.id,configurationRevision:1,requestedCount:2,requestId:randomUUID()},{availability:available})
   expect(result.operationId).toBeTruthy()
  }finally{await f.close()}
 })
 it('requires a fresh explicit restart for expired v2 cursors, preserving original tokens and avoiding invalid repeated calls',async()=>{
  const f=await captureFixture()
  try{
   await f.pool.query(`UPDATE radar_campaigns SET search_configuration=jsonb_set(search_configuration,'{discovery}','{"enabled":true,"sourceOrder":["cnpja_advanced_search"],"terms":[]}'::jsonb) WHERE id=$1`,[f.campaign.id])
   const start=await startRadarCaptureOperation(f.pool,admin,{organizationId,campaignId:f.campaign.id,configurationRevision:1,requestedCount:2,requestId:randomUUID()},{availability:available})
   const env={PROVIDER_SECRET_ENCRYPTION_KEY_B64:Buffer.alloc(32,7).toString('base64')} as never;let calls=0
   const discover=async()=>{calls++;return{candidates:[],documents:[],exhaustion:'more' as const,continuation:{token:'original-token'}}}
   for(let i=0;i<2;i++)await advanceRadarCaptureDiscovery(f.pool,env,{organizationId,operationId:start.operationId},{availability:available,adaptiveDiscover:discover})
   await f.pool.query("UPDATE radar_discovery_pages SET updated_at=NOW()-INTERVAL '2 hours' WHERE operation_id=$1",[start.operationId])
   await advanceRadarCaptureDiscovery(f.pool,env,{organizationId,operationId:start.operationId},{availability:available,adaptiveDiscover:discover})
   expect(calls).toBe(1)
   const input={organizationId,campaignId:f.campaign.id,operationId:start.operationId,configurationRevision:1,requestedCount:2}
   const preflight=await getRadarCapturePreflight(f.pool,admin,input,{availability:available})
   expect(preflight.continuations[0]).toMatchObject({reason:'idle',requiresRestartConfirmation:true})
   await expect(resumeRadarCaptureOperation(f.pool,admin,{organizationId,operationId:start.operationId,configurationRevision:1,requestId:randomUUID()},{availability:available})).rejects.toThrow('radar_capture_continuation_confirmation_required')
   const requestId=randomUUID()
   await resumeRadarCaptureOperation(f.pool,admin,{organizationId,operationId:start.operationId,configurationRevision:1,requestId,continuationAuthorizations:preflight.continuations.map(state=>({scopeKey:state.scopeKey,expectedStateId:state.stateId}))},{availability:available})
   await advanceRadarCaptureDiscovery(f.pool,env,{organizationId,operationId:start.operationId},{availability:available,adaptiveDiscover:async input=>{calls++;expect(input.continuation).toMatchObject({restartAuthorization:{requestId}});return{candidates:[],documents:[],exhaustion:'exhausted'}}})
   expect(calls).toBe(2)
   const original=(await f.pool.query('SELECT continuation,extraction FROM radar_discovery_pages WHERE operation_id=$1 ORDER BY page_number LIMIT 1',[start.operationId])).rows[0]
   expect(original.continuation).toEqual({token:'original-token'});expect(original.extraction.restartAuthorization.requestId).toBe(requestId)
  }finally{await f.close()}
 })
})
