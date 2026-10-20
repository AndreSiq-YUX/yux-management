import {randomUUID} from 'node:crypto'
import {describe,it,expect} from 'vitest'
import {captureFixture,connectionString,organizationId,admin} from '../support/radar-capture-fixture.js'
import {upsertAdminLlmRoute,storePlatformProviderSecret} from '../../src/modules/platform/adminRepository.js'
import {getRadarOperationalLimits,updateRadarOperationalLimits} from '../../src/modules/radar/operational-limits.js'
import {researchRadarGaps} from '../../src/modules/radar/deep-research.js'

describe.skipIf(!connectionString)('Agent estimated budget with actual PostgreSQL and simulated transport',()=>{
 for(const mode of ['success','timeout','overrun','authorization_denied'] as const)it(`reserves before ${mode}, scopes every effect and never buys the same call twice`,async()=>{
  const f=await captureFixture(),policy=await getRadarOperationalLimits(f.pool,admin);let routeId:string|undefined
  try{
   await updateRadarOperationalLimits(f.pool,admin,{expectedVersion:policy.version,limits:policy.limits,costPolicy:{usdToBrl:'5',rateAsOf:'2026-10-20T12:00:00Z',rateSource:'manual',marginPercent:'0'}})
   const provider=(await f.pool.query(`INSERT INTO platform_provider_connections(provider_type,provider_key,display_name,status,public_config,is_default) VALUES('llm','perplexity','Fixture','active','{"retentionLicensed":true,"agentResearchLicensed":true}',TRUE) ON CONFLICT(provider_type,provider_key,environment) DO UPDATE SET status='active',public_config=EXCLUDED.public_config RETURNING id`)).rows[0]
   await storePlatformProviderSecret(f.pool,{providerConnectionId:provider.id,secretKind:'api_key',value:'synthetic-only'},`provider-key:${Buffer.alloc(32,7).toString('base64')}`)
   routeId=(await upsertAdminLlmRoute(f.pool,{agentType:'radar_deep_research',organizationId,provider:'perplexity',kind:'research',modelName:'fixture/model',researchConfig:{enabled:true,allowEstimatedBudget:true,estimatedUsdPerAttempt:.01,budgetUsdPerResearch:.02,budgetUsdPerCampaign:1,maxAttempts:1}})).id
   const candidate=(await f.pool.query(`INSERT INTO radar_candidate_records(organization_id,campaign_id,source_type,title,dedupe_key,normalized_payload) VALUES($1,$2,'manual','Empresa Alfa',$3,'{}') RETURNING id`,[organizationId,f.campaign.id,randomUUID()])).rows[0]
   const lease=randomUUID(),run=(await f.pool.query(`INSERT INTO radar_candidate_research_runs(organization_id,campaign_id,candidate_id,requested_by,configuration_revision,status,lease_id,lease_until) VALUES($1,$2,$3,$4,1,'running',$5,NOW()+INTERVAL '5 minutes') RETURNING id`,[organizationId,f.campaign.id,candidate.id,admin.id,lease])).rows[0]
   const input={organizationId,candidateId:candidate.id,revision:1,gaps:['website'],context:{identity:{name:'Empresa Alfa'}}},requests:unknown[]=[]
   const actual=mode==='overrun'?.03:.006
   const deps={env:{} as any,runId:run.id,leaseId:lease,authorize:async()=>{if(mode==='authorization_denied')throw Error('radar_campaign_not_active')},runtime:async(_env:any,path:string,payload:any)=>{
    requests.push(payload)
    expect(path).toBe('/radar/deep-research')
    expect(Number((await f.pool.query("SELECT estimated_cost FROM radar_source_usage_counters WHERE campaign_id=$1 AND source_type='perplexity_agent'",[f.campaign.id])).rows[0].estimated_cost)).toBe(.05)
    if(mode==='timeout')throw Error('synthetic_timeout')
    return{response:{id:'p1',output:[{type:'search_results',contents:[{id:1,source:'web',url:'https://alfa.example/',snippet:'Empresa Alfa contato público.'}]}]},usage:{costUsd:actual},budget:{usedUsd:actual,exceeded:mode==='overrun'}}
   }}
   if(mode==='authorization_denied'){
    await expect(researchRadarGaps(f.pool,admin,input,deps as any)).rejects.toThrow('radar_campaign_not_active')
    expect((await f.pool.query("SELECT units FROM radar_source_usage_counters WHERE campaign_id=$1 AND source_type='perplexity_agent'",[f.campaign.id])).rows).toEqual([])
   }else if(mode==='timeout'){
    await expect(researchRadarGaps(f.pool,admin,input,deps as any)).rejects.toThrow('synthetic_timeout')
    await expect(researchRadarGaps(f.pool,admin,input,deps as any)).rejects.toThrow('radar_research_call_uncertain')
   }else{
    expect((await researchRadarGaps(f.pool,admin,input,deps as any)).evidence).toHaveLength(1)
    await researchRadarGaps(f.pool,admin,input,deps as any)
    expect(Number((await f.pool.query("SELECT estimated_cost FROM radar_source_usage_counters WHERE campaign_id=$1 AND source_type='perplexity_agent'",[f.campaign.id])).rows[0].estimated_cost)).toBe(actual*5)
    await expect(researchRadarGaps(f.pool,admin,{...input,candidateId:randomUUID()},deps as any)).rejects.toThrow('radar_candidate_not_found')
   }
   expect(requests).toHaveLength(mode==='authorization_denied'?0:1)
  }finally{
   const current=await getRadarOperationalLimits(f.pool,admin);await updateRadarOperationalLimits(f.pool,admin,{expectedVersion:current.version,limits:policy.limits,costPolicy:policy.costPolicy})
   if(routeId)await f.pool.query('DELETE FROM model_routing_rules WHERE id=$1',[routeId]);await f.close()
  }
 })
})
