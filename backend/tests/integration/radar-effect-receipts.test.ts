import {describe,expect,it} from 'vitest'
import pg from 'pg'
import {randomUUID} from 'node:crypto'
import {captureFixture,connectionString,organizationId} from '../support/radar-capture-fixture.js'
import {fixtureIds,fixtureUsers,fixturePassword} from './support/fixtures.js'
import {buildServer} from '../../src/server.js'
import {createContextAwarePool} from '../../src/db/client.js'
import {runWithDatabaseRequestContext} from '../../src/db/request-context.js'
import {recordRadarEffectResponse} from '../../src/modules/radar/effect-receipts.js'
import {admin,available,company} from '../support/radar-capture-fixture.js'
import {startRadarCaptureOperation,getRadarCaptureOperation} from '../../src/modules/radar/capture-operation.js'
import {advanceRadarCaptureDiscovery} from '../../src/modules/radar/capture-discovery.js'
import {startRadarCandidateResearch} from '../../src/modules/radar/research-service.js'
import {queueRadarResearchRequest} from '../../src/modules/radar/research-requests.js'
import {getRadarOperationalLimits,updateRadarOperationalLimits} from '../../src/modules/radar/operational-limits.js'
const authorization=await import('../../src/modules/radar/analysis-retry-authorizations.js').catch(()=>({})) as Record<string,any>

describe.skipIf(!connectionString)('protected Radar effect responses',()=>{
 it('records one explicit batch approval linked to the old uncertain receipts without changing their result or consuming credit',async()=>{
  expect(authorization.authorizeRadarAnalysisRetries).toBeTypeOf('function')
  const f=await captureFixture(),receiptIds:string[]=[],originalPolicy=await getRadarOperationalLimits(f.pool,admin)
  let routeId:string|undefined,foreignReceiptId:string|undefined
  try{
   await f.pool.query(`UPDATE public.radar_campaigns SET search_configuration=jsonb_set(search_configuration,'{research,presenceResolutionEnabled}','true') WHERE id=$1`,[f.campaign.id])
   routeId=(await f.pool.query("INSERT INTO public.model_routing_rules(agent_type,organization_id,provider,model_name,max_input_tokens,max_output_tokens) VALUES('radar_presence_resolution',$1,'openrouter','fixture-retry-policy',16000,1800) RETURNING id",[organizationId])).rows[0].id
   const batch=await startRadarCaptureOperation(f.pool,admin,{organizationId,campaignId:f.campaign.id,configurationRevision:1,requestId:randomUUID(),requestedCount:2},{availability:available})
   await advanceRadarCaptureDiscovery(f.pool,{} as never,{organizationId,operationId:batch.operationId},{availability:available,searchPage:async()=>({candidates:[company(),company()]}),loadSecret:async()=>'fixture'})
   const items=[]
   for(const item of (await getRadarCaptureOperation(f.pool,admin,organizationId,batch.operationId)).items){
    const run=await startRadarCandidateResearch(f.pool,admin,{organizationId,candidateId:item.candidateId,configurationRevision:1})
    const requestId=`${run.runId}:presence:${'a'.repeat(64)}`
    await f.pool.query(`UPDATE public.radar_candidate_research_runs SET status='partial',calls=$2 WHERE id=$1`,[run.runId,JSON.stringify({presence:{status:'uncertain',source:'radar_presence_resolution',evidenceHash:'a'.repeat(64)}})])
    const receipt=(await f.pool.query("INSERT INTO public.radar_analysis_receipts(organization_id,action,request_id,input_hash,owner_token,status) VALUES($1,'radar_presence_resolution',$2,$3,$4,'uncertain') RETURNING id",[organizationId,requestId,'b'.repeat(64),randomUUID()])).rows[0]
    receiptIds.push(receipt.id);items.push({candidateId:item.candidateId,previousReceiptId:receipt.id})
   }
   // Two companies remain one logical intent even when the worker handles one
   // at a time. The dispatch window must not reject this approval.
   await updateRadarOperationalLimits(f.pool,admin,{expectedVersion:originalPolicy.version,limits:{...originalPolicy.limits,maxVerificationBatch:1}})
   const input={organizationId,campaignId:f.campaign.id,configurationRevision:1,requestId:randomUUID(),expiresAt:new Date(Date.now()+3600000).toISOString(),acknowledgePreviousChargeMayExist:true,items}
   const result=await authorization.authorizeRadarAnalysisRetries(f.pool,admin,input)
   expect(result.analysisAuthorizationId).toBe(input.requestId)
   expect(result.items).toHaveLength(2)
   const selected=await queueRadarResearchRequest(f.pool,admin,{organizationId,campaignId:f.campaign.id,requestId:randomUUID(),criteriaRevision:1,intent:'resume',candidateIds:[items[0].candidateId],analysisAuthorizationId:result.analysisAuthorizationId})
   expect(selected).toMatchObject({state:'accepted',items:[{candidateId:items[0].candidateId}]})
   expect(await authorization.authorizeRadarAnalysisRetries(f.pool,admin,input)).toEqual(result)
   expect((await f.pool.query('SELECT COUNT(*) AS n FROM public.radar_analysis_retry_authorizations WHERE request_id=$1',[input.requestId])).rows[0].n).toBe('2')
   expect((await f.pool.query('SELECT status,result FROM public.radar_analysis_receipts WHERE id=ANY($1::uuid[])',[receiptIds])).rows.every(row=>row.status==='uncertain'&&row.result===null)).toBe(true)
   expect((await f.pool.query('SELECT COUNT(*) AS n FROM public.radar_effect_receipts WHERE analysis_receipt_id=ANY($1::uuid[])',[receiptIds])).rows[0].n).toBe('0')
   await expect(authorization.authorizeRadarAnalysisRetries(f.pool,admin,{...input,configurationRevision:2})).rejects.toThrow('radar_campaign_configuration_changed')
   await expect(authorization.authorizeRadarAnalysisRetries(f.pool,admin,{...input,items:items.slice(0,1)})).rejects.toThrow('radar_analysis_retry_request_conflict')
   await expect(authorization.authorizeRadarAnalysisRetries(f.pool,admin,{...input,requestId:randomUUID(),expiresAt:new Date(Date.now()-3600000).toISOString()})).rejects.toThrow('radar_analysis_retry_authorization_expired')
   await expect(authorization.authorizeRadarAnalysisRetries(f.pool,admin,{...input,requestId:randomUUID(),items:[{candidateId:items[0].candidateId,previousReceiptId:items[1].previousReceiptId}]})).rejects.toThrow('radar_analysis_retry_scope_invalid')
   await expect(authorization.authorizeRadarAnalysisRetries(f.pool,admin,{...input,requestId:randomUUID()})).rejects.toThrow('radar_analysis_retry_already_authorized')
   foreignReceiptId=(await f.pool.query("INSERT INTO public.radar_analysis_receipts(organization_id,action,request_id,input_hash,owner_token,status) VALUES($1,'radar_presence_resolution',$2,$3,$4,'reserved') RETURNING id",[fixtureIds.organizationA,randomUUID(),'d'.repeat(64),randomUUID()])).rows[0].id
   await expect(f.pool.query('UPDATE public.radar_analysis_retry_authorizations SET consumed_by_analysis_receipt_id=$2,consumed_at=NOW() WHERE id=$1',[result.items[0].authorizationId,foreignReceiptId])).rejects.toMatchObject({code:'23503'})
   const apiUrl=new URL(connectionString!);apiUrl.username='yux_api'
   const apiPool=createContextAwarePool(new pg.Pool({connectionString:apiUrl.toString()}),'api')
   const app=await buildServer({NODE_ENV:'test',DATABASE_URL:connectionString!,REDIS_URL:'redis://127.0.0.1:1',SESSION_COOKIE_NAME:'yux_session',SESSION_SECRET:'fixture-analysis-retry-secret-at-least-32',CORS_ORIGIN:'http://localhost:3000',PORT:4000},{pool:apiPool,jobQueue:{add:async()=>{throw Error('approval_must_not_enqueue_or_spend')},close:async()=>{}},redisPing:async()=>'PONG'})
   try{
    const {campaignId:_campaignId,...body}=input
    for(const role of ['yux_operator','client_admin_A','client_member_A','yux_admin'] as const){
     const login=await app.inject({method:'POST',url:'/api/auth/login',payload:{email:fixtureUsers[role].email,password:fixturePassword}})
     expect(login.statusCode).toBe(200)
     const response=await app.inject({method:'POST',url:`/api/radar/campaigns/${f.campaign.id}/analysis-retries`,headers:{cookie:String(login.headers['set-cookie']).split(';')[0]},payload:body})
     expect(response.statusCode).toBe(role==='yux_admin'?200:403)
     if(role!=='yux_admin')expect(response.body).not.toMatch(/policy_snapshot|previousReceipt|model|openrouter|effect_key/)
     else expect(response.json()).toEqual(result)
    }
   }finally{await app.close();await apiPool.end()}
  }finally{const policy=await getRadarOperationalLimits(f.pool,admin);await updateRadarOperationalLimits(f.pool,admin,{expectedVersion:policy.version,limits:originalPolicy.limits,costPolicy:originalPolicy.costPolicy});if(receiptIds.length)await f.pool.query('DELETE FROM public.radar_analysis_receipts WHERE id=ANY($1::uuid[])',[receiptIds]);if(foreignReceiptId)await f.pool.query('DELETE FROM public.radar_analysis_receipts WHERE id=$1',[foreignReceiptId]);if(routeId)await f.pool.query('DELETE FROM public.model_routing_rules WHERE id=$1',[routeId]);await f.close()}
 })
 it('stores a response once under the current owner/lease, keeps backend read-only and isolates tenants',async()=>{
  const f=await captureFixture(),owner=randomUUID(),requestId=randomUUID(),effectKey=`radar_presence_resolution:${requestId}`,lease=new Date(Date.now()+300000).toISOString()
  const runtimeUrl=new URL(connectionString!);runtimeUrl.username='yux_runtime'
  const readerUrl=new URL(connectionString!);readerUrl.username='yux_worker'
  const runtime=createContextAwarePool(new pg.Pool({connectionString:runtimeUrl.toString()}),'runtime'),reader=createContextAwarePool(new pg.Pool({connectionString:readerUrl.toString()}),'worker')
  const scoped=<T>(fn:()=>Promise<T>,org:string=organizationId)=>runWithDatabaseRequestContext({role:'client_member',organizationIds:[org],serviceRole:'runtime'},fn)
  let analysisId:string|undefined
  try{
   expect((await f.pool.query("SELECT to_regclass('public.radar_effect_receipts') AS relation")).rows[0].relation).not.toBeNull()
   analysisId=(await f.pool.query("INSERT INTO public.radar_analysis_receipts(organization_id,action,request_id,input_hash,owner_token,status) VALUES($1,'radar_presence_resolution',$2,$3,$4,'reserved') RETURNING id",[organizationId,requestId,'a'.repeat(64),owner])).rows[0].id
   const insert=()=>scoped(()=>runtime.query(`INSERT INTO public.radar_effect_receipts(organization_id,effect_key,attempt,analysis_receipt_id,owner_token,input_hash,lease_until) VALUES($1,$2,1,$3,$4,$5,$6) ON CONFLICT(organization_id,effect_key,attempt) DO NOTHING RETURNING id`,[organizationId,effectKey,analysisId,owner,'a'.repeat(64),lease]))
   const claims=await Promise.all([insert(),insert()])
   expect(claims.flatMap(result=>result.rows)).toHaveLength(1)
   const input={schemaVersion:1 as const,organizationId,effectKey,attempt:1,analysisReceiptId:analysisId!,ownerToken:owner,leaseUntil:lease,inputHash:'a'.repeat(64),transportOutcome:'received' as const,validationOutcome:'invalid' as const,billingOutcome:'known' as const,responseBody:{content:'{',finish_reason:'length',authorization:'must-not-be-stored'},usage:{inputTokens:10,outputTokens:5,costUsd:.001},failureCode:'output_truncated'}
   await scoped(()=>recordRadarEffectResponse(runtime as never,input))
   await expect(scoped(()=>recordRadarEffectResponse(runtime as never,{...input,ownerToken:randomUUID()}))).rejects.toThrow('radar_effect_receipt_lease_lost')
   const rows=(await scoped(()=>reader.query('SELECT * FROM public.radar_effect_receipts WHERE effect_key=$1',[effectKey]))).rows
   expect(rows[0]).toMatchObject({transport_outcome:'received',validation_outcome:'invalid',billing_outcome:'known',failure_code:'output_truncated',response_body:{content:'{',finish_reason:'length'}})
   expect(rows[0].response_body).not.toHaveProperty('authorization')
   expect((await scoped(()=>runtime.query('SELECT * FROM public.radar_effect_receipts WHERE effect_key=$1',[effectKey]),fixtureIds.organizationA)).rows).toHaveLength(0)
   await expect(scoped(()=>reader.query("UPDATE public.radar_effect_receipts SET response_body='{}' WHERE effect_key=$1",[effectKey]))).rejects.toMatchObject({code:'42501'})
   await f.pool.query("UPDATE public.radar_effect_receipts SET lease_until=NOW()-INTERVAL '1 minute' WHERE effect_key=$1",[effectKey])
   await expect(scoped(()=>recordRadarEffectResponse(runtime as never,input))).rejects.toThrow('radar_effect_receipt_lease_lost')
  }finally{if(analysisId)await f.pool.query('DELETE FROM public.radar_analysis_receipts WHERE id=$1',[analysisId]);await runtime.end();await reader.end();await f.close()}
 })
})
