import {describe,it,expect} from 'vitest'
import {randomUUID} from 'node:crypto'
import {captureFixture,connectionString,admin,organizationId,available,company} from '../support/radar-capture-fixture.js'
import {startRadarCaptureOperation,getRadarCaptureOperation} from '../../src/modules/radar/capture-operation.js'
import {advanceRadarCaptureDiscovery} from '../../src/modules/radar/capture-discovery.js'
import {reconcileRadarCaptureOutbox,resumeRadarCaptureOperation,dispatchRadarCaptureOperation} from '../../src/modules/radar/capture-dispatch.js'
import {startRadarCandidateResearch,executeRadarCandidateResearch} from '../../src/modules/radar/research-service.js'
import {authorizeRadarAnalysisRetries} from '../../src/modules/radar/analysis-retry-authorizations.js'
import {getRadarOperationalLimits,updateRadarOperationalLimits} from '../../src/modules/radar/operational-limits.js'
const api=await import('../../src/modules/radar/research-requests.js').catch(()=>({})) as Record<string,any>
describe.skipIf(!connectionString)('durable research request outbox',()=>{
 it('amends a waiting intent that never allocated a child without getting stuck in resume_pending',async()=>{
  const f=await captureFixture()
  try{
   const candidateId=(await f.pool.query(`INSERT INTO public.radar_candidate_records(organization_id,campaign_id,source_type,title,dedupe_key,normalized_payload) VALUES($1,$2,'manual','Empresa fixture',$3,'{}') RETURNING id`,[organizationId,f.campaign.id,randomUUID()])).rows[0].id
   const requestId=randomUUID()
   await api.queueRadarResearchRequest(f.pool,admin,{organizationId,campaignId:f.campaign.id,candidateIds:[candidateId],requestId,criteriaRevision:1,intent:'resume'})
   const request=(await f.pool.query('SELECT id FROM public.radar_research_requests WHERE request_id=$1',[requestId])).rows[0]
   await f.pool.query("UPDATE public.radar_research_request_items SET state='waiting',reason_code='source_limit_exceeded' WHERE research_request_id=$1",[request.id])
   await f.pool.query("UPDATE public.radar_research_requests SET status='waiting' WHERE id=$1",[request.id])
   await api.authorizeRadarResearchBudget(f.pool,admin,{organizationId,requestId,expectedBudgetRevision:1,authorizationId:randomUUID()})
   let queued=0
   await api.dispatchRadarResearchRequest(f.pool,{} as never,{organizationId,researchRequestId:request.id},{add:async()=>{queued++}})
   const item=(await f.pool.query('SELECT * FROM public.radar_research_request_items WHERE research_request_id=$1',[request.id])).rows[0]
   expect(queued).toBe(1);expect(item).toMatchObject({state:'running',reason_code:null,resume_pending:false})
  }finally{await f.close()}
 })
 it('round-trips capacities beyond int4 as exact JSON numbers without changing global PostgreSQL parsers',async()=>{
  const f=await captureFixture()
  try{
   const requestId=randomUUID(),op=await startRadarCaptureOperation(f.pool,admin,{organizationId,campaignId:f.campaign.id,configurationRevision:1,requestId,requestedCount:1},{availability:available})
   await f.pool.query('UPDATE public.radar_capture_operations SET requested_count=3000000000 WHERE id=$1',[op.operationId])
   await f.pool.query('UPDATE public.radar_capture_requests SET requested_count=3000000000 WHERE operation_id=$1',[op.operationId])
   const result=await getRadarCaptureOperation(f.pool,admin,organizationId,op.operationId)
   expect(result.counts.requested).toBe(3_000_000_000)
   expect((await startRadarCaptureOperation(f.pool,admin,{organizationId,campaignId:f.campaign.id,configurationRevision:1,requestId,requestedCount:3_000_000_000},{availability:available})).operationId).toBe(op.operationId)
  }finally{await f.close()}
 })
 it('increases the same waiting intent without rebasing its consumed searches or repeating discovery',async()=>{
  const f=await captureFixture()
  try{
   const candidateId=(await f.pool.query(`INSERT INTO public.radar_candidate_records(organization_id,campaign_id,source_type,title,dedupe_key,normalized_payload) VALUES($1,$2,'manual','Empresa fixture',$3,'{}') RETURNING id`,[organizationId,f.campaign.id,randomUUID()])).rows[0].id
   const requestId=randomUUID()
   await api.queueRadarResearchRequest(f.pool,admin,{organizationId,campaignId:f.campaign.id,candidateIds:[candidateId],requestId,criteriaRevision:1,intent:'resume'})
   const request=(await f.pool.query('SELECT * FROM public.radar_research_requests WHERE request_id=$1',[requestId])).rows[0]
   await api.dispatchRadarResearchRequest(f.pool,{} as never,{organizationId,researchRequestId:request.id},{add:async()=>{}})
   const item=(await f.pool.query('SELECT * FROM public.radar_research_request_items WHERE research_request_id=$1',[request.id])).rows[0]
   await f.pool.query("UPDATE public.radar_candidate_research_runs SET status='partial',calls=$2,output=$3 WHERE id=$1",[item.run_id,JSON.stringify({used:{source:'brave_web_search',status:'completed',result:[]}}),JSON.stringify({quality:{readyForReview:false}})])
   await f.pool.query("UPDATE public.radar_research_request_items SET state='waiting' WHERE id=$1",[item.id])
   await f.pool.query("UPDATE public.radar_research_requests SET status='waiting' WHERE id=$1",[request.id])
   await f.pool.query(`UPDATE public.radar_campaigns SET search_configuration=jsonb_set(search_configuration,'{research,maxSearchQueriesPerCandidate}','5') WHERE id=$1`,[f.campaign.id])
   const input={organizationId,requestId,expectedBudgetRevision:1,authorizationId:randomUUID()}
   expect(api.authorizeRadarResearchBudget).toBeTypeOf('function')
   await api.authorizeRadarResearchBudget(f.pool,admin,input)
   await api.authorizeRadarResearchBudget(f.pool,admin,input)
   const amended=(await f.pool.query('SELECT * FROM public.radar_research_request_items WHERE id=$1',[item.id])).rows[0]
   expect(amended.research_budget.baselineKeys).toEqual(item.research_budget.baselineKeys)
   expect(amended.research_budget.baselineRunId).toBe(item.research_budget.baselineRunId)
   expect(amended.research_budget.policy.maxSearchQueriesPerCandidate).toBe(5)
   expect((await f.pool.query('SELECT budget_revision,budget_authorizations FROM public.radar_research_requests WHERE id=$1',[request.id])).rows[0]).toMatchObject({budget_revision:2,budget_authorizations:[expect.objectContaining({authorizationId:input.authorizationId})]})
   await expect(api.authorizeRadarResearchBudget(f.pool,{...admin,role:'client_admin'},{...input,authorizationId:randomUUID(),expectedBudgetRevision:2})).rejects.toMatchObject({statusCode:403})
   await expect(api.authorizeRadarResearchBudget(f.pool,admin,{...input,authorizationId:randomUUID()})).rejects.toThrow('radar_intent_budget_stale')
   await api.dispatchRadarResearchRequest(f.pool,{} as never,{organizationId,researchRequestId:request.id},{add:async()=>{}})
   expect((await f.pool.query('SELECT status FROM public.radar_candidate_research_runs WHERE id=$1',[item.run_id])).rows[0].status).toBe('queued')
   expect((await f.pool.query('SELECT COUNT(*) AS n FROM public.radar_candidate_research_runs WHERE candidate_id=$1',[candidateId])).rows[0].n).toBe('1')
  }finally{await f.close()}
 })
 it('keeps the logical request size separate from the editable dispatch window',async()=>{
  const f=await captureFixture(),before=await getRadarOperationalLimits(f.pool,admin);let policy=before
  try{
   policy=await updateRadarOperationalLimits(f.pool,admin,{expectedVersion:before.version,limits:{...before.limits,maxNewCompaniesPerLot:20,maxVerificationBatch:2}})
   const ids:string[]=[]
   for(let index=0;index<5;index++)ids.push((await f.pool.query(`INSERT INTO public.radar_candidate_records(organization_id,campaign_id,source_type,title,dedupe_key,normalized_payload) VALUES($1,$2,'manual',$3,$4,'{}') RETURNING id`,[organizationId,f.campaign.id,`Empresa fixture ${index}`,randomUUID()])).rows[0].id)
   const requestId=randomUUID()
   await api.queueRadarResearchRequest(f.pool,admin,{organizationId,campaignId:f.campaign.id,candidateIds:ids,requestId,criteriaRevision:1,intent:'resume'})
   const request=(await f.pool.query('SELECT id FROM public.radar_research_requests WHERE request_id=$1',[requestId])).rows[0]
   const jobs=new Set<string>()
   const dispatch=()=>api.dispatchRadarResearchRequest(f.pool,{} as never,{organizationId,researchRequestId:request.id},{add:async(_name:string,_data:unknown,options:{jobId:string})=>{jobs.add(options.jobId)}})
   await dispatch()
   const count=async()=>Number((await f.pool.query('SELECT COUNT(*) AS n FROM public.radar_research_request_items WHERE research_request_id=$1 AND run_id IS NOT NULL',[request.id])).rows[0].n)
   expect(await count()).toBe(2)
   await dispatch();await dispatch()
   expect(await count()).toBe(5);expect(jobs.size).toBe(5)
   expect((await f.pool.query('SELECT COUNT(*) AS n FROM public.radar_research_requests WHERE request_id=$1',[requestId])).rows[0].n).toBe('1')
  }finally{if(policy.version!==before.version)await updateRadarOperationalLimits(f.pool,admin,{expectedVersion:policy.version,limits:before.limits,costPolicy:before.costPolicy});await f.close()}
 })
 it.each([['request','partial'],['capture','partial'],['request','succeeded'],['capture','succeeded']])('authorizes additional search for an explicit %s resume of %s insufficient research without erasing earlier calls or advancing discovery',async(mode,oldStatus)=>{
  const f=await captureFixture()
  try{
   const op=await startRadarCaptureOperation(f.pool,admin,{organizationId,campaignId:f.campaign.id,configurationRevision:1,requestId:randomUUID(),requestedCount:1},{availability:available})
   const prospect=company()
   await advanceRadarCaptureDiscovery(f.pool,{} as never,{organizationId,operationId:op.operationId},{availability:available,searchPage:async()=>({candidates:[prospect]}),loadSecret:async()=>'fixture'})
   const item=(await getRadarCaptureOperation(f.pool,admin,organizationId,op.operationId)).items[0]
   const run=await startRadarCandidateResearch(f.pool,admin,{organizationId,candidateId:item.candidateId,configurationRevision:1})
   const history=Object.fromEntries(Array.from({length:5},(_,index)=>[`old-${index}`,{source:'brave_web_search',status:'completed',result:[]}]))
   await f.pool.query('UPDATE public.radar_candidate_research_runs SET status=$3,calls=$2,output=$4 WHERE id=$1',[run.runId,JSON.stringify(history),oldStatus,JSON.stringify({quality:{readyForReview:false},siteAssociation:'review'})])
   await f.pool.query("INSERT INTO public.radar_source_usage_counters(organization_id,campaign_id,source_type,units,estimated_cost) VALUES($1,$2,'brave_web_search',5,.05)",[organizationId,f.campaign.id])
   const requestId=randomUUID()
   if(mode==='request'){
    await api.queueRadarResearchRequest(f.pool,admin,{organizationId,campaignId:f.campaign.id,candidateIds:[item.candidateId],requestId,criteriaRevision:1,intent:'resume'})
    const request=(await f.pool.query('SELECT id FROM public.radar_research_requests WHERE request_id=$1',[requestId])).rows[0]
    await api.dispatchRadarResearchRequest(f.pool,{} as never,{organizationId,researchRequestId:request.id},{add:async()=>{}})
   }else{
    await f.pool.query("UPDATE public.radar_capture_items SET status='insufficient',blocker='candidate_search_limit_reached',run_id=$2 WHERE id=$1",[item.id,run.runId])
    await f.pool.query("UPDATE public.radar_capture_operations SET status='blocked' WHERE id=$1",[op.operationId])
    await resumeRadarCaptureOperation(f.pool,admin,{organizationId,operationId:op.operationId,configurationRevision:1,requestId},{availability:available,workerReady:async()=>true})
    await dispatchRadarCaptureOperation(f.pool,{} as never,{organizationId,operationId:op.operationId},{add:async()=>({id:'fixture'})} as never,undefined,{availability:available,discover:async()=>{throw Error('unexpected_rediscovery')}})
   }
   const page={url:'https://sintetica.example/',text:`Empresa sintética CNPJ ${prospect.taxId}. Contato compras@sintetica.example`,observedAt:new Date().toISOString()}
   let searches=0
   await executeRadarCandidateResearch(f.pool,{} as never,{organizationId,runId:run.runId},undefined,{loadSecret:async()=>'fixture',web:async()=>{searches++;return[{url:page.url,title:'Empresa sintética',snippets:[page.text],observedAt:page.observedAt}]},collect:async()=>[page]})
   expect(searches).toBeGreaterThan(0);expect(searches).toBeLessThanOrEqual(3)
   const stored=(await f.pool.query('SELECT calls FROM public.radar_candidate_research_runs WHERE id=$1',[run.runId])).rows[0]
   for(const [key,call] of Object.entries(history))expect(stored.calls[key]).toEqual(call)
   const added=Object.entries(stored.calls).filter(([key])=>!Object.hasOwn(history,key)).map(([,call])=>call as {costEstimate?:unknown})
   expect(added).toHaveLength(searches)
   expect(added[0].costEstimate).toMatchObject({amountBrl:'0.01',originalAmount:'0.01',currency:'BRL',estimated:true})
   expect((await f.pool.query('SELECT normalized_payload FROM public.radar_candidate_records WHERE id=$1',[item.candidateId])).rows[0].normalized_payload.websiteUrl).toBe(page.url)
   expect(Number((await f.pool.query("SELECT units FROM public.radar_source_usage_counters WHERE campaign_id=$1 AND source_type='brave_web_search'",[f.campaign.id])).rows[0].units)).toBe(5+searches)
   expect((await getRadarCaptureOperation(f.pool,admin,organizationId,op.operationId)).queries).toBe(1)
  }finally{await f.close()}
 })
 it('rolls back the search reservation and never calls a provider after losing the run lease',async()=>{
  const f=await captureFixture()
  try{
   const op=await startRadarCaptureOperation(f.pool,admin,{organizationId,campaignId:f.campaign.id,configurationRevision:1,requestId:randomUUID(),requestedCount:1},{availability:available})
   await advanceRadarCaptureDiscovery(f.pool,{} as never,{organizationId,operationId:op.operationId},{availability:available,searchPage:async()=>({candidates:[company()]}),loadSecret:async()=>'fixture'})
   const item=(await getRadarCaptureOperation(f.pool,admin,organizationId,op.operationId)).items[0]
   const run=await startRadarCandidateResearch(f.pool,admin,{organizationId,candidateId:item.candidateId,configurationRevision:1})
   const usage=async()=>Number((await f.pool.query('SELECT COALESCE(SUM(units),0) AS units FROM public.radar_source_usage_counters WHERE campaign_id=$1',[f.campaign.id])).rows[0].units)
   const before=await usage(),newOwner=randomUUID();let requests=0,stolen=false
   await executeRadarCandidateResearch(f.pool,{} as never,{organizationId,runId:run.runId},undefined,{loadSecret:async()=>{
    if(!stolen){stolen=true;await f.pool.query("UPDATE public.radar_candidate_research_runs SET lease_id=$2,lease_until=NOW()+INTERVAL '6 minutes' WHERE id=$1",[run.runId,newOwner])}
    return'fixture-not-real'
   },web:async()=>{requests++;return[]},collect:async()=>[]})
   expect(stolen).toBe(true);expect(requests).toBe(0);expect(await usage()).toBe(before)
   expect((await f.pool.query('SELECT lease_id FROM public.radar_candidate_research_runs WHERE id=$1',[run.runId])).rows[0].lease_id).toBe(newOwner)
  }finally{await f.close()}
 })
 it('consumes a retry only in the runtime receipt transaction with exact tenant/company/model-policy and only once',async()=>{
  const f=await captureFixture(),receipts:string[]=[]
  let routeId:string|undefined,extraRouteId:string|undefined
  try{
   await f.pool.query(`UPDATE public.radar_campaigns SET search_configuration=jsonb_set(search_configuration,'{research,presenceResolutionEnabled}','true') WHERE id=$1`,[f.campaign.id])
   routeId=(await f.pool.query("INSERT INTO public.model_routing_rules(agent_type,organization_id,provider,model_name,max_input_tokens,max_output_tokens) VALUES('radar_presence_resolution',$1,'openrouter','fixture-authorized',16000,1800) RETURNING id",[organizationId])).rows[0].id
   const op=await startRadarCaptureOperation(f.pool,admin,{organizationId,campaignId:f.campaign.id,configurationRevision:1,requestId:randomUUID(),requestedCount:1},{availability:available})
   await advanceRadarCaptureDiscovery(f.pool,{} as never,{organizationId,operationId:op.operationId},{availability:available,searchPage:async()=>({candidates:[company()]}),loadSecret:async()=>'fixture'})
   const item=(await getRadarCaptureOperation(f.pool,admin,organizationId,op.operationId)).items[0]
   const run=await startRadarCandidateResearch(f.pool,admin,{organizationId,candidateId:item.candidateId,configurationRevision:1})
   const old=(await f.pool.query("INSERT INTO public.radar_analysis_receipts(organization_id,action,request_id,input_hash,owner_token,status) VALUES($1,'radar_presence_resolution',$2,$3,$4,'uncertain') RETURNING id",[organizationId,`${run.runId}:presence:old-hash`,'a'.repeat(64),randomUUID()])).rows[0]
   receipts.push(old.id)
   await f.pool.query('UPDATE public.radar_candidate_research_runs SET calls=$2 WHERE id=$1',[run.runId,JSON.stringify({presence:{status:'uncertain',evidenceHash:'old-hash'}})])
   const authorization=await authorizeRadarAnalysisRetries(f.pool,admin,{organizationId,campaignId:f.campaign.id,configurationRevision:1,requestId:randomUUID(),expiresAt:new Date(Date.now()+3600000).toISOString(),acknowledgePreviousChargeMayExist:true,items:[{candidateId:item.candidateId,previousReceiptId:old.id}]})
   const grant=(await f.pool.query('SELECT * FROM public.radar_analysis_retry_authorizations WHERE id=$1',[authorization.items[0].authorizationId])).rows[0]
   const retry={authorization_id:grant.id,candidate_id:item.candidateId,campaign_id:f.campaign.id,configuration_revision:1,policy_hash:grant.policy_hash}
   const consume=async(overrides:object={},role='yux_runtime')=>{
    const client=await f.pool.connect(),receiptId=randomUUID(),owner=randomUUID()
    try{
     await client.query('BEGIN');await client.query(`SET LOCAL ROLE ${role==='yux_api'?'yux_api':'yux_runtime'}`)
     await client.query("SELECT set_config('app.service_role','runtime',TRUE),set_config('app.current_role','yux_admin',TRUE),set_config('app.current_orgs',$1,TRUE)",[`{${organizationId}}`])
     const tenant=(await f.pool.query('SELECT client_id FROM public.organizations WHERE id=$1',[organizationId])).rows[0]
     await client.query(`INSERT INTO public.radar_analysis_receipts(id,organization_id,action,request_id,input_hash,owner_token,status,input_request,lease_until) VALUES($1,$2,'radar_presence_resolution',$3,$4,$5,'reserved',$6,NOW()+INTERVAL '6 minutes')`,[receiptId,organizationId,randomUUID(),'b'.repeat(64),owner,JSON.stringify({client_id:tenant.client_id,retry_authorization:{...retry,...overrides}})])
     await client.query('SELECT private.consume_radar_analysis_retry($1,$2)',[receiptId,owner]);await client.query('COMMIT');receipts.push(receiptId);return receiptId
    }catch(cause){await client.query('ROLLBACK');throw cause}finally{client.release()}
   }
   await expect(consume({candidate_id:randomUUID()})).rejects.toThrow('radar_analysis_retry_authorization_invalid')
   await f.pool.query("UPDATE public.radar_analysis_retry_authorizations SET approved_at=NOW()-INTERVAL '2 hours',expires_at=NOW()-INTERVAL '1 hour' WHERE id=$1",[grant.id])
   await expect(consume()).rejects.toThrow('radar_analysis_retry_authorization_invalid')
   await f.pool.query('UPDATE public.radar_analysis_retry_authorizations SET approved_at=$2,expires_at=$3 WHERE id=$1',[grant.id,grant.approved_at,grant.expires_at])
   await expect(consume({},'yux_api')).rejects.toMatchObject({code:'42501'})
   await f.pool.query("UPDATE public.model_routing_rules SET model_name='different-fixture' WHERE id=$1",[routeId])
   await expect(consume()).rejects.toThrow('radar_analysis_retry_policy_changed')
   await f.pool.query("UPDATE public.model_routing_rules SET model_name='fixture-authorized' WHERE id=$1",[routeId])
   extraRouteId=(await f.pool.query("INSERT INTO public.model_routing_rules(agent_type,organization_id,provider,model_name) VALUES('radar_presence_resolution',$1,'openrouter','extra-fixture') RETURNING id",[organizationId])).rows[0].id
   await expect(consume()).rejects.toThrow('radar_analysis_retry_policy_changed')
   await f.pool.query('DELETE FROM public.model_routing_rules WHERE id=$1',[extraRouteId]);extraRouteId=undefined
   expect((await f.pool.query('SELECT consumed_at FROM public.radar_analysis_retry_authorizations WHERE id=$1',[grant.id])).rows[0].consumed_at).toBeNull()
   const receiptId=await consume()
   expect((await f.pool.query('SELECT consumed_by_analysis_receipt_id FROM public.radar_analysis_retry_authorizations WHERE id=$1',[grant.id])).rows[0].consumed_by_analysis_receipt_id).toBe(receiptId)
   await expect(consume()).rejects.toThrow('radar_analysis_retry_authorization_invalid')
   expect((await f.pool.query('SELECT status FROM public.radar_analysis_receipts WHERE id=$1',[old.id])).rows[0].status).toBe('uncertain')
  }finally{
   if(extraRouteId)await f.pool.query('DELETE FROM public.model_routing_rules WHERE id=$1',[extraRouteId])
   if(routeId)await f.pool.query('DELETE FROM public.model_routing_rules WHERE id=$1',[routeId])
   await f.pool.query('DELETE FROM public.radar_analysis_retry_authorizations WHERE campaign_id=$1 AND organization_id=$2',[f.campaign.id,organizationId])
   await f.pool.query('DELETE FROM public.radar_analysis_receipts WHERE id=ANY($1::uuid[])',[receipts]);await f.close()
  }
 })
 it('carries durable per-company approval through the real worker and does not replay a completed retry',async()=>{
  const f=await captureFixture(),receipts:string[]=[];let routeId:string|undefined
  try{
   await f.pool.query(`UPDATE public.radar_campaigns SET search_configuration=jsonb_set(search_configuration,'{research,presenceResolutionEnabled}','true') WHERE id=$1`,[f.campaign.id])
   routeId=(await f.pool.query("INSERT INTO public.model_routing_rules(agent_type,organization_id,provider,model_name) VALUES('radar_presence_resolution',$1,'openrouter','fixture-runtime-retry') RETURNING id",[organizationId])).rows[0].id
   const op=await startRadarCaptureOperation(f.pool,admin,{organizationId,campaignId:f.campaign.id,configurationRevision:1,requestId:randomUUID(),requestedCount:1},{availability:available})
   await advanceRadarCaptureDiscovery(f.pool,{} as never,{organizationId,operationId:op.operationId},{availability:available,searchPage:async()=>({candidates:[company()]}),loadSecret:async()=>'fixture'})
   const item=(await getRadarCaptureOperation(f.pool,admin,organizationId,op.operationId)).items[0]
   const run=await startRadarCandidateResearch(f.pool,admin,{organizationId,candidateId:item.candidateId,configurationRevision:1})
   const old=(await f.pool.query("INSERT INTO public.radar_analysis_receipts(organization_id,action,request_id,input_hash,owner_token,status) VALUES($1,'radar_presence_resolution',$2,$3,$4,'uncertain') RETURNING id",[organizationId,`${run.runId}:presence:old-hash`,'a'.repeat(64),randomUUID()])).rows[0]
   receipts.push(old.id)
   const page={url:'https://brand.example/',text:'Marca sintética. Serviços para empresas. Contato compras@brand.example.',observedAt:new Date().toISOString()}
   await f.pool.query('UPDATE public.radar_candidate_research_runs SET calls=$2,output=$3 WHERE id=$1',[run.runId,JSON.stringify({presence:{status:'uncertain',source:'radar_presence_resolution',evidenceHash:'old-hash'}}),JSON.stringify({readingComplete:true,readerVersion:4,discoveryLocked:true,pages:[page],discovery:{association:'review',hits:[],suggestions:[],limitations:[],queries:1}})])
   const authorization=await authorizeRadarAnalysisRetries(f.pool,admin,{organizationId,campaignId:f.campaign.id,configurationRevision:1,requestId:randomUUID(),expiresAt:new Date(Date.now()+3600000).toISOString(),acknowledgePreviousChargeMayExist:true,items:[{candidateId:item.candidateId,previousReceiptId:old.id}]})
   const requestId=randomUUID()
   await api.queueRadarResearchRequest(f.pool,admin,{organizationId,campaignId:f.campaign.id,candidateIds:[item.candidateId],requestId,criteriaRevision:1,intent:'resume',analysisAuthorizationId:authorization.analysisAuthorizationId})
   const request=(await f.pool.query('SELECT id FROM public.radar_research_requests WHERE request_id=$1',[requestId])).rows[0]
   await api.dispatchRadarResearchRequest(f.pool,{} as never,{organizationId,researchRequestId:request.id},{add:async()=>{}})
   let runtimeCalls=0
   const runtime=async(_env:unknown,path:string,body:Record<string,any>)=>{
    expect(path).toBe('/radar/resolve-presence');runtimeCalls++
    expect(body.retry_authorization).toMatchObject({authorization_id:authorization.items[0].authorizationId,candidate_id:item.candidateId})
    expect(body.request_id).toContain(`:retry:${authorization.items[0].authorizationId}`)
    const client=await f.pool.connect(),owner=randomUUID()
    const result={candidateId:body.evidence[0].id,scope:'establishment',reason:'Fonte sintética associa a marca à empresa.',claims:[{evidenceId:body.evidence[0].id,excerpt:page.text}]}
    try{
     await client.query('BEGIN');await client.query('SET LOCAL ROLE yux_runtime')
     await client.query("SELECT set_config('app.service_role','runtime',TRUE),set_config('app.current_role','yux_operator',TRUE),set_config('app.current_orgs',$1,TRUE)",[`{${organizationId}}`])
     const claimed=(await client.query('SELECT * FROM private.claim_radar_retry_receipt($1,$2,$3,$4,$5,$6)',[organizationId,'radar_presence_resolution',body.request_id,'f'.repeat(64),owner,JSON.stringify(body)])).rows[0]
     expect(claimed.claimed).toBe(true);receipts.push(claimed.receipt.id)
     await client.query("UPDATE public.radar_analysis_receipts SET status='completed',result=$2,lease_until=NULL WHERE id=$1",[claimed.receipt.id,JSON.stringify(result)]);await client.query('COMMIT')
    }catch(cause){await client.query('ROLLBACK');throw cause}finally{client.release()}
    return result
   }
   const noSearch=async()=>{throw Error('unexpected_discovery_call')}
   await executeRadarCandidateResearch(f.pool,{} as never,{organizationId,runId:run.runId},undefined,{runtime:runtime as never,web:noSearch,local:noSearch,collect:async()=>[page]})
   const stored=(await f.pool.query('SELECT * FROM public.radar_candidate_research_runs WHERE id=$1',[run.runId])).rows[0]
   expect(stored.output.siteAssociation).toBe('confirmed');expect(stored.calls.presence.status).toBe('completed');expect(runtimeCalls).toBe(1)
   await executeRadarCandidateResearch(f.pool,{} as never,{organizationId,runId:run.runId},undefined,{runtime:runtime as never,web:noSearch,local:noSearch})
   expect(runtimeCalls).toBe(1)
   expect((await f.pool.query('SELECT status FROM public.radar_analysis_receipts WHERE id=$1',[old.id])).rows[0].status).toBe('uncertain')
  }finally{if(routeId)await f.pool.query('DELETE FROM public.model_routing_rules WHERE id=$1',[routeId]);await f.pool.query('DELETE FROM public.radar_analysis_retry_authorizations WHERE campaign_id=$1 AND organization_id=$2',[f.campaign.id,organizationId]);await f.pool.query('DELETE FROM public.radar_analysis_receipts WHERE id=ANY($1::uuid[])',[receipts]);await f.close()}
 })
 it('commits exactly one intent for concurrent double click, survives queue failure and dispatches the same child without rediscovery',async()=>{
  expect(api.queueRadarResearchRequest).toBeTypeOf('function')
  const f=await captureFixture()
  try{
   const op=await startRadarCaptureOperation(f.pool,admin,{organizationId,campaignId:f.campaign.id,configurationRevision:1,requestId:randomUUID(),requestedCount:2},{availability:available})
   await advanceRadarCaptureDiscovery(f.pool,{} as never,{organizationId,operationId:op.operationId},{availability:available,searchPage:async()=>({candidates:[company(),company()]}),loadSecret:async()=>'fixture'})
   const candidates=(await getRadarCaptureOperation(f.pool,admin,organizationId,op.operationId)).items.map(item=>item.candidateId)
   const input={organizationId,campaignId:f.campaign.id,criteriaRevision:1,candidateIds:candidates,requestId:randomUUID(),intent:'resume'}
   const both=await Promise.all([api.queueRadarResearchRequest(f.pool,admin,input),api.queueRadarResearchRequest(f.pool,admin,input)])
   expect(both[0].requestId).toBe(both[1].requestId)
   expect((await f.pool.query('SELECT * FROM public.radar_research_requests WHERE request_id=$1',[input.requestId])).rows).toHaveLength(1)
   const row=(await f.pool.query('SELECT id FROM public.radar_research_requests WHERE request_id=$1',[input.requestId])).rows[0]
   expect((await f.pool.query('SELECT * FROM public.radar_capture_outbox WHERE research_request_id=$1',[row.id])).rows).toHaveLength(1)
   const queue={add:async()=>{throw Error('queue unavailable')}}
   await api.dispatchRadarResearchRequest(f.pool,{} as never,{organizationId,researchRequestId:row.id},queue)
   const items=(await f.pool.query('SELECT * FROM public.radar_research_request_items WHERE research_request_id=$1 ORDER BY id',[row.id])).rows
   expect(items.every(item=>item.run_id)).toBe(true)
   const runIds=items.map(item=>item.run_id)
   const jobs:Array<{name:string;data:any;options:any}>=[]
   await api.dispatchRadarResearchRequest(f.pool,{} as never,{organizationId,researchRequestId:row.id},{add:async(name:string,data:any,options:any)=>{jobs.push({name,data,options})}})
   await api.dispatchRadarResearchRequest(f.pool,{} as never,{organizationId,researchRequestId:row.id},{add:async(name:string,data:any,options:any)=>{jobs.push({name,data,options})}})
   expect([...new Set(jobs.map(job=>job.data.runId))].sort()).toEqual([...runIds].sort())
   expect(new Set(jobs.map(job=>job.options.jobId)).size).toBe(2)
   await f.pool.query("UPDATE public.radar_candidate_research_runs SET status='running',lease_id=$2,lease_until=NOW()-INTERVAL '1 second' WHERE id=$1",[runIds[0],randomUUID()])
   await api.dispatchRadarResearchRequest(f.pool,{} as never,{organizationId,researchRequestId:row.id},{add:async(name:string,data:any,options:any)=>{jobs.push({name,data,options})}})
   expect((await f.pool.query('SELECT status FROM public.radar_candidate_research_runs WHERE id=$1',[runIds[0]])).rows[0].status).toBe('queued')
   expect((await f.pool.query('SELECT COUNT(*) AS n FROM public.radar_candidate_research_runs WHERE id=ANY($1::uuid[])',[runIds])).rows[0].n).toBe('2')
   await f.pool.query('UPDATE public.radar_capture_outbox SET next_dispatch_at=NOW() WHERE research_request_id=$1',[row.id])
   await reconcileRadarCaptureOutbox(f.pool,{add:async(name:string,data:any)=>{jobs.push({name,data,options:{}})}} as never,1)
   expect(jobs.some(job=>job.name==='radar.advanceResearchRequest'&&job.data.researchRequestId===row.id)).toBe(true)
   await expect(api.queueRadarResearchRequest(f.pool,admin,{...input,candidateIds:candidates.slice(0,1)})).rejects.toThrow('radar_research_request_conflict')
   await expect(api.queueRadarResearchRequest(f.pool,admin,{...input,requestId:randomUUID(),candidateIds:[randomUUID()]})).rejects.toThrow('radar_research_request_scope_invalid')
  }finally{await f.close()}
 })
})
