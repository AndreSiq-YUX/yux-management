import {beforeAll,afterAll,describe,it,expect} from 'vitest'
import {spawn,type ChildProcess} from 'node:child_process'
import {createServer} from 'node:net'
import {resolve} from 'node:path'
import {randomUUID} from 'node:crypto'
import {captureFixture,connectionString,organizationId,admin} from '../support/radar-capture-fixture.js'
import {upsertAdminLlmRoute,storePlatformProviderSecret} from '../../src/modules/platform/adminRepository.js'
import {getRadarOperationalLimits,updateRadarOperationalLimits} from '../../src/modules/radar/operational-limits.js'
import {researchRadarGaps} from '../../src/modules/radar/deep-research.js'
import {getRadarAdministrativeResearch} from '../../src/modules/radar/administrative-research.js'
import {authorizeRadarAnalysisRetries} from '../../src/modules/radar/analysis-retry-authorizations.js'
import {queueRadarResearchRequest} from '../../src/modules/radar/research-requests.js'

describe.skipIf(!connectionString)('backend → HTTP runtime → PostgreSQL Agent receipts (synthetic transport)',()=>{
 let child:ChildProcess,env:any,runtimeErrors=''
 beforeAll(async()=>{
  const server=createServer();await new Promise<void>(ok=>server.listen(0,'127.0.0.1',ok));const port=(server.address() as {port:number}).port;await new Promise<void>(ok=>server.close(()=>ok()))
  const cwd=resolve('../workers/marketing-studio-agent-runtime'),libs=resolve('../.superpowers/sdd/2026-10-19-radar-recuperacao-e-experiencia/python-libs')
  child=spawn('python',['tests/support/decision_runtime_server.py'],{cwd,windowsHide:true,env:{...process.env,PYTHONPATH:`${cwd};${libs}`,DATABASE_URL:connectionString!.replace('radar_test@','yux_runtime@'),YUX_AGENT_RUNTIME_TOKEN:'fixture-agent-token',RADAR_DECISION_TEST_PORT:String(port)},stdio:['ignore','pipe','pipe']})
  let errors='';child.stderr?.on('data',chunk=>{errors+=chunk;runtimeErrors+=chunk});env={YUX_AGENT_RUNTIME_URL:`http://127.0.0.1:${port}`,YUX_AGENT_RUNTIME_TOKEN:'fixture-agent-token'}
  for(let n=0;n<100;n++){if(child.exitCode!==null)throw Error(errors);try{if((await fetch(`${env.YUX_AGENT_RUNTIME_URL}/health`,{headers:{authorization:'Bearer fixture-agent-token'}})).ok)return}catch{}await new Promise(ok=>setTimeout(ok,100))}throw Error(errors||'fixture_runtime_not_ready')
 },20000)
 afterAll(()=>child?.kill())
 for(const model of ['fixture/model','fixture/rejected','fixture/timeout'] as const)it(`runs ${model} with no blind replay and an explicit single-use recovery path`,async()=>{
  const f=await captureFixture(),policy=await getRadarOperationalLimits(f.pool,admin);let routeId:string|undefined
  try{
   await updateRadarOperationalLimits(f.pool,admin,{expectedVersion:policy.version,limits:{...policy.limits,maxFallbackAttemptsPerEffect:1},costPolicy:{usdToBrl:'5',rateAsOf:'2026-10-20T12:00:00Z',rateSource:'manual',marginPercent:'0'}})
   const provider=(await f.pool.query(`INSERT INTO platform_provider_connections(provider_type,provider_key,display_name,status,public_config,is_default) VALUES('llm','perplexity','Fixture','active','{"retentionLicensed":true,"agentResearchLicensed":true}',TRUE) ON CONFLICT(provider_type,provider_key,environment) DO UPDATE SET status='active',public_config=EXCLUDED.public_config RETURNING id`)).rows[0]
   await storePlatformProviderSecret(f.pool,{providerConnectionId:provider.id,secretKind:'api_key',value:'synthetic'},`provider-key:${Buffer.alloc(32,7).toString('base64')}`)
   const routeInput={agentType:'radar_deep_research',organizationId,provider:'perplexity',kind:'research' as const,modelName:model,fallbackRoutes:[{provider:'perplexity',modelName:'fixture/reserve'}],researchConfig:{enabled:true,allowEstimatedBudget:true,estimatedUsdPerAttempt:.01,budgetUsdPerResearch:.03,budgetUsdPerCampaign:1,maxAttempts:2}}
   routeId=(await upsertAdminLlmRoute(f.pool,routeInput)).id
   await f.pool.query(`UPDATE radar_campaigns SET search_configuration=jsonb_set(search_configuration,'{research,deepResearchEnabled}','true') WHERE id=$1`,[f.campaign.id])
   const candidate=(await f.pool.query(`INSERT INTO radar_candidate_records(organization_id,campaign_id,source_type,title,dedupe_key,normalized_payload) VALUES($1,$2,'manual','Empresa Alfa',$3,'{}') RETURNING id`,[organizationId,f.campaign.id,randomUUID()])).rows[0]
   const lease=randomUUID(),run=(await f.pool.query(`INSERT INTO radar_candidate_research_runs(organization_id,campaign_id,candidate_id,requested_by,configuration_revision,status,lease_id,lease_until) VALUES($1,$2,$3,$4,1,'running',$5,NOW()+INTERVAL '5 minutes') RETURNING id`,[organizationId,f.campaign.id,candidate.id,admin.id,lease])).rows[0]
   const input={organizationId,candidateId:candidate.id,revision:1,gaps:['website'],context:{identity:{name:'Empresa Alfa'}}},deps={env,runId:run.id,leaseId:lease,authorize:async()=>{}}
   if(model==='fixture/timeout'){
    await expect(researchRadarGaps(f.pool,admin,input,deps)).rejects.toThrow()
    await expect(researchRadarGaps(f.pool,admin,input,deps)).rejects.toThrow()
    const receipt=(await f.pool.query("SELECT * FROM radar_analysis_receipts WHERE organization_id=$1 AND request_id LIKE $2",[organizationId,`${run.id}:%`])).rows[0]
    expect((await f.pool.query('SELECT attempt,transport_outcome FROM radar_effect_receipts WHERE analysis_receipt_id=$1',[receipt.id])).rows).toEqual([{attempt:1,transport_outcome:'uncertain'}])
    const report=await getRadarAdministrativeResearch(f.pool,admin,{organizationId,campaignId:f.campaign.id});expect(report.analyses[0]).toMatchObject({canAuthorizeRetry:true,canRevalidate:false})
    await upsertAdminLlmRoute(f.pool,{...routeInput,id:routeId,modelName:'fixture/model'})
    const authorization=await authorizeRadarAnalysisRetries(f.pool,admin,{organizationId,campaignId:f.campaign.id,configurationRevision:1,requestId:randomUUID(),expiresAt:new Date(Date.now()+3600000).toISOString(),acknowledgePreviousChargeMayExist:true,items:[{candidateId:candidate.id,previousReceiptId:receipt.id}]})
    const requestId=randomUUID()
    await queueRadarResearchRequest(f.pool,admin,{organizationId,campaignId:f.campaign.id,criteriaRevision:1,requestId,intent:'resume',candidateIds:[candidate.id],analysisAuthorizationId:authorization.analysisAuthorizationId})
    await f.pool.query(`UPDATE radar_research_request_items SET run_id=$1 WHERE research_request_id=(SELECT id FROM radar_research_requests WHERE request_id=$2 AND organization_id=$3)`,[run.id,requestId,organizationId])
    expect((await researchRadarGaps(f.pool,admin,input,deps)).evidence).toHaveLength(1)
    expect((await f.pool.query('SELECT consumed_at FROM radar_analysis_retry_authorizations WHERE request_id=$1',[authorization.analysisAuthorizationId])).rows[0].consumed_at).not.toBeNull()
   }else{
    const result=await researchRadarGaps(f.pool,admin,input,deps);expect(result.evidence).toHaveLength(1)
    await researchRadarGaps(f.pool,admin,input,deps)
    const rows=(await f.pool.query(`SELECT effect.transport_outcome FROM radar_effect_receipts effect JOIN radar_analysis_receipts receipt ON receipt.id=effect.analysis_receipt_id WHERE receipt.request_id LIKE $1 ORDER BY effect.attempt`,[`${run.id}:%`])).rows
    expect(rows).toHaveLength(model==='fixture/rejected'?2:1)
    if(model==='fixture/rejected')expect(result.usage).toMatchObject({costUsd:null,costComplete:false,knownSubtotalUsd:.006})
   }
  }catch(cause){throw Error(`${(cause as Error).message}\n${runtimeErrors.slice(-4500)}`)}finally{
   const current=await getRadarOperationalLimits(f.pool,admin);await updateRadarOperationalLimits(f.pool,admin,{expectedVersion:current.version,limits:policy.limits,costPolicy:policy.costPolicy})
   if(routeId)await f.pool.query('DELETE FROM model_routing_rules WHERE id=$1',[routeId]);await f.close()
  }
 },30000)
})
