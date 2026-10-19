import {describe,it,expect} from 'vitest'
import {captureFixture,connectionString,admin,organizationId} from './support/radar-capture-fixture.js'
import {fixtureUsers} from './integration/support/fixtures.js'
import {resolveRadarSearchConfiguration} from '../src/modules/radar/search-configuration.js'
import {runRadarCnpjaAdvancedSearch,evaluateRadarSourceGovernance,recordRadarSourceUsage,findRadarDataSource} from '../src/modules/radar/repository.js'
import {searchCnpjaAdvancedPage} from '../src/modules/radar/cnpjaClient.js'
import {company} from './support/radar-capture-fixture.js'
import {buildServer} from '../src/server.js'
import {createContextAwarePool} from '../src/db/client.js'
import pg from 'pg'
import {fixturePassword} from './integration/support/fixtures.js'
import {runWithDatabaseRequestContext} from '../src/db/request-context.js'
import {startRadarCaptureOperation} from '../src/modules/radar/capture-operation.js'
import {getRadarCapturePreflight} from '../src/modules/radar/capture-preflight.js'
import {randomUUID} from 'node:crypto'
import {available as availability} from './support/radar-capture-fixture.js'
const modulePath='../src/modules/radar/operational-limits.js',api=await import(modulePath).catch(()=>({}))
const defaults={maxNewCompaniesPerLot:1000,maxPagesPerScope:10,maxDiscoveryQueriesPerLot:100,maxDiscoveryPageSize:10,maxVerificationBatch:25,maxSearchQueriesPerCompany:5,maxPublicPagesPerCompany:10,maxCampaignDailyQueries:1000,maxSourceDailyQueries:1000,maxResearchFreshnessDays:30,maxContinuationIdleMinutes:60}

describe('Radar operational policy',()=>{
 it('accepts safe integer capacities above int4 rather than treating storage as a product quota',()=>{
  expect(api.radarOperationalLimitsSchema.safeParse({...defaults,maxNewCompaniesPerLot:3_000_000_000}).success).toBe(true)
 })
 it('does not truncate a configurable 25-record provider page',async()=>{
  const records=Array.from({length:25},(_,i)=>({taxId:String(10000000000000+i),company:{name:'Fixture'}}))
  const result=await searchCnpjaAdvancedPage({apiKey:'fake',limit:25,fetchImpl:async()=>new Response(JSON.stringify({records,next:'next-fixture'}),{status:200})})
  expect(result.candidates).toHaveLength(25)
 })
 it('permits larger operational values only when authorized by the Admin policy',()=>{
  expect(api.validateRadarOperationalConfiguration).toBeTypeOf('function')
  const config=resolveRadarSearchConfiguration({batch:{pageSize:25,maxPagesPerScope:30,maxQueriesPerBatch:500,verificationLimit:80},research:{maxSearchQueriesPerCandidate:20,maxPagesPerCandidate:50,freshnessDays:60}})
  expect(()=>api.validateRadarOperationalConfiguration(config,defaults)).toThrow('radar_operational_limit_exceeded')
  expect(()=>api.validateRadarOperationalConfiguration(config,{...defaults,maxDiscoveryPageSize:25,maxPagesPerScope:30,maxDiscoveryQueriesPerLot:500,maxVerificationBatch:80,maxSearchQueriesPerCompany:20,maxPublicPagesPerCompany:50,maxResearchFreshnessDays:60})).not.toThrow()
 })
 it.each([0,-1,1.5,Number.MAX_SAFE_INTEGER+1,NaN,Infinity])('rejects an invalid policy value %s',value=>{
  expect(api.radarOperationalLimitsSchema).toBeDefined()
  expect(api.radarOperationalLimitsSchema.safeParse({...defaults,maxPagesPerScope:value}).success).toBe(false)
 })
 it.each(['yux_operator','client_admin_A','client_member_A'])('never exposes the global policy to %s',async role=>{
  expect(api.getRadarOperationalLimits).toBeTypeOf('function')
  await expect(api.getRadarOperationalLimits({query:async()=>{throw Error('must_not_query')}} as never,fixtureUsers[role as keyof typeof fixtureUsers])).rejects.toMatchObject({statusCode:403})
 })
})

describe.skipIf(!connectionString)('Radar persisted policy with isolated PostgreSQL',()=>{
 it('backfills new defaults in the stored policy with an explicit migration audit instead of inventing a human actor',async()=>{
  const f=await captureFixture(),before=await api.getRadarOperationalLimits(f.pool,admin)
  try{
   await f.pool.query("UPDATE public.radar_operational_limits SET limits=limits-'maxDecisionCallsPerCompany'-'maxDeepSearchesPerCompany'-'maxFallbackAttemptsPerEffect' WHERE singleton=TRUE")
   await f.pool.query("SELECT private.backfill_radar_operational_defaults('{\"maxDecisionCallsPerCompany\":3,\"maxDeepSearchesPerCompany\":1,\"maxFallbackAttemptsPerEffect\":1}'::jsonb)")
   const stored=(await f.pool.query('SELECT * FROM public.radar_operational_limits WHERE singleton=TRUE')).rows[0]
   const normalized=await api.loadRadarOperationalLimits(f.pool)
   expect(stored.version).toBe(before.version+1);expect(stored.limits).toEqual(normalized.limits)
   const audit=(await f.pool.query('SELECT * FROM public.radar_operational_limit_audit WHERE policy_version=$1',[stored.version])).rows[0]
   expect(audit).toMatchObject({change_origin:'migration',updated_by:null,new_limits:stored.limits})
   await f.pool.query("SELECT private.backfill_radar_operational_defaults('{\"maxDecisionCallsPerCompany\":3}'::jsonb)")
   expect((await api.loadRadarOperationalLimits(f.pool)).version).toBe(stored.version)
   const client=await f.pool.connect()
   try{await client.query('BEGIN');await client.query('SET LOCAL ROLE yux_api');await expect(client.query("SELECT private.backfill_radar_operational_defaults('{\"unauthorized\":1}'::jsonb)")).rejects.toMatchObject({code:'42501'});await client.query('ROLLBACK')}finally{client.release()}
  }finally{const current=await api.getRadarOperationalLimits(f.pool,admin);await api.updateRadarOperationalLimits(f.pool,admin,{expectedVersion:current.version,limits:before.limits,costPolicy:before.costPolicy});await f.close()}
 })
 it('serializes two simulated source reservations against the same total campaign budget',async()=>{
  const f=await captureFixture()
  try{
   await f.pool.query('UPDATE public.radar_campaigns SET budget_limit=.3 WHERE id=$1',[f.campaign.id])
   const sources=await Promise.all(['brave_web_search','serper_web_search'].map(key=>findRadarDataSource(f.pool,organizationId,key)))
   const outcomes=await Promise.all(sources.map(async source=>{
    if(!source)throw Error('fixture_source_missing')
    // Fixture-only approved prices. No activation or real provider request.
    const simulated={...source,enabled:true,defaultCostPerUnit:.2},client=await f.pool.connect()
    try{
     await client.query('BEGIN')
     const result=await evaluateRadarSourceGovernance(client,organizationId,f.campaign.id,simulated,1,1,true)
     if(result.allowed){await new Promise(done=>setTimeout(done,50));await recordRadarSourceUsage(client,organizationId,f.campaign.id,simulated,1,result.estimatedCost)}
     await client.query('COMMIT');return result.allowed
    }catch(cause){await client.query('ROLLBACK');throw cause}finally{client.release()}
   }))
   expect(outcomes.filter(Boolean)).toHaveLength(1)
   expect(Number((await f.pool.query('SELECT SUM(estimated_cost) AS cost FROM public.radar_source_usage_counters WHERE campaign_id=$1',[f.campaign.id])).rows[0].cost)).toBe(.2)
  }finally{await f.close()}
 })
 it('versions a manual cost policy with audit and CAS, without modifying a frozen estimate',async()=>{
  const f=await captureFixture(),before=await api.getRadarOperationalLimits(f.pool,admin);let current=before
  try{
   const costPolicy={usdToBrl:'5.50',rateAsOf:'2026-10-19T12:00:00Z',rateSource:'manual' as const,marginPercent:'0'}
   current=await api.updateRadarOperationalLimits(f.pool,admin,{expectedVersion:before.version,limits:before.limits,costPolicy})
   expect(current.costPolicy).toEqual(costPolicy)
   const audit=(await f.pool.query('SELECT old_cost_policy,new_cost_policy FROM public.radar_operational_limit_audit WHERE policy_version=$1',[current.version])).rows[0]
   expect(audit.new_cost_policy).toEqual(costPolicy)
   await expect(api.updateRadarOperationalLimits(f.pool,admin,{expectedVersion:before.version,limits:before.limits,costPolicy:{...costPolicy,usdToBrl:'9'}})).rejects.toThrow('radar_operational_policy_stale')
  }finally{if(current.version!==before.version)await api.updateRadarOperationalLimits(f.pool,admin,{expectedVersion:current.version,limits:before.limits,costPolicy:before.costPolicy});await f.close()}
 })
 it('snapshots the approved policy and never raises an existing lot when policy changes',async()=>{
  const f=await captureFixture();const before=await api.getRadarOperationalLimits(f.pool,admin);let version=before.version
  try{
   const op=await startRadarCaptureOperation(f.pool,admin,{organizationId,campaignId:f.campaign.id,configurationRevision:1,requestId:randomUUID(),requestedCount:20},{availability})
   const saved=(await f.pool.query('SELECT configuration_snapshot FROM public.radar_capture_operations WHERE id=$1',[op.operationId])).rows[0].configuration_snapshot
   expect(saved.operationalPolicy).toMatchObject({version:before.version,limits:before.limits})
   const changed=await api.updateRadarOperationalLimits(f.pool,admin,{expectedVersion:version,limits:{...before.limits,maxNewCompaniesPerLot:5,maxPagesPerScope:1}});version=changed.version
   const p=await getRadarCapturePreflight(f.pool,admin,{organizationId,campaignId:f.campaign.id,configurationRevision:1,requestedCount:20,operationId:op.operationId},{availability,workerReady:async()=>true})
   expect(p.limits.maxPagesPerScope).toBe(saved.search_configuration.batch.maxPagesPerScope)
   expect(p.policy).toMatchObject({version:changed.version,limits:{maxNewCompaniesPerLot:5}})
   expect(Number((await f.pool.query('SELECT queries FROM public.radar_capture_operations WHERE id=$1',[op.operationId])).rows[0].queries)).toBe(0)
  }finally{if(version!==before.version)await api.updateRadarOperationalLimits(f.pool,admin,{expectedVersion:version,limits:before.limits});await f.close()}
 })
 it('reserves three billing units but one call for a 25-company page and preserves the inherited page size',async()=>{
  const f=await captureFixture();let before:any,updated:any
  try{
   before=await api.getRadarOperationalLimits(f.pool,admin)
   updated=await api.updateRadarOperationalLimits(f.pool,admin,{expectedVersion:before.version,limits:{...before.limits,maxDiscoveryPageSize:25}})
   const input={organizationId,campaignId:f.campaign.id,regionalState:'PR',expectedRevision:1,limit:25,secretKeyMaterial:'fixture'}
   const first=await runRadarCnpjaAdvancedSearch(f.pool,admin,input,{loadSecret:async()=>'fake',searchPage:async request=>{expect(request.limit).toBe(25);return{candidates:Array.from({length:25},company),nextToken:'page-two'}}})
   const usage=(await f.pool.query('SELECT units,estimated_cost FROM public.radar_source_usage_counters WHERE campaign_id=$1',[f.campaign.id])).rows[0]
   expect(Number(usage.units)).toBe(1);expect(Number(usage.estimated_cost)).toBe(.075)
   await f.pool.query("UPDATE public.radar_campaigns SET budget_limit=.1,search_configuration=jsonb_set(search_configuration,'{batch,pageSize}','3') WHERE id=$1",[f.campaign.id])
   const preflight=await getRadarCapturePreflight(f.pool,admin,{organizationId,campaignId:f.campaign.id,configurationRevision:1,requestedCount:1},{availability,workerReady:async()=>true})
   expect(preflight.blockers).toContainEqual(expect.objectContaining({code:'source_budget_exceeded'}))
   await f.pool.query('UPDATE public.radar_campaigns SET budget_limit=100 WHERE id=$1',[f.campaign.id])
   await runRadarCnpjaAdvancedSearch(f.pool,admin,{...input,limit:3},{loadSecret:async()=>'fake',searchPage:async request=>{expect(request.limit).toBe(25);expect(request.token).toBe('page-two');return{candidates:[]}}})
   expect(first.candidates).toHaveLength(25)
  }finally{if(before&&updated)await api.updateRadarOperationalLimits(f.pool,admin,{expectedVersion:updated.version,limits:before.limits});await f.close()}
 })
 it('protects Admin HTTP and database access to the policy and does not dispatch jobs',async()=>{
  const f=await captureFixture(),url=new URL(connectionString!);url.username='yux_api'
  const pool=createContextAwarePool(new pg.Pool({connectionString:url.toString()}),'api');let jobs=0
  const app=await buildServer({NODE_ENV:'test',DATABASE_URL:connectionString!,REDIS_URL:'redis://127.0.0.1:1',SESSION_COOKIE_NAME:'yux_session',SESSION_SECRET:'radar-policy-test-secret-at-least-32',CORS_ORIGIN:'http://localhost:3000',PORT:4000},{pool,jobQueue:{add:async()=>{jobs++;return{id:'fake'}},close:async()=>{}},redisPing:async()=>'PONG'})
  try{
   for(const role of ['yux_operator','client_admin_A','client_member_A','client_admin_B','yux_admin'] as const){
    const login=await app.inject({method:'POST',url:'/api/auth/login',payload:{email:fixtureUsers[role].email,password:fixturePassword}})
    expect(login.statusCode).toBe(200)
    const headers={cookie:String(login.headers['set-cookie']).split(';')[0]}
    const response=await app.inject({method:'GET',url:'/api/radar/admin/operational-limits',headers})
    expect(response.statusCode).toBe(role==='yux_admin'?200:403)
    if(role!=='yux_admin'){
     expect(response.body).not.toMatch(/maxPagesPerScope|updatedBy|policy_version/)
     expect((await app.inject({method:'PUT',url:'/api/radar/admin/operational-limits',headers,payload:{expectedVersion:1,limits:defaults}})).statusCode).toBe(403)
    }else expect(response.json().limits.maxPagesPerScope).toBeGreaterThan(0)
   }
   for(const role of ['client_admin','client_member','yux_operator'] as const)await runWithDatabaseRequestContext({role,organizationIds:[organizationId]},async()=>{
    expect((await pool.query('SELECT * FROM public.radar_operational_limits')).rows).toHaveLength(0)
    const internal=await api.loadRadarOperationalLimits(pool)
    expect(internal.version).toBe((await api.getRadarOperationalLimits(f.pool,admin)).version)
   })
   expect(jobs).toBe(0)
  }finally{await app.close();await pool.end();await f.close()}
 })
 it('persists a larger ceiling, audits the change and rejects a stale update without starting work',async()=>{
  const f=await captureFixture()
  try{
   expect(api.getRadarOperationalLimits).toBeTypeOf('function')
   const before=await api.getRadarOperationalLimits(f.pool,admin)
   const next=await api.updateRadarOperationalLimits(f.pool,admin,{expectedVersion:before.version,limits:{...before.limits,maxPagesPerScope:30,maxDiscoveryQueriesPerLot:500,maxVerificationBatch:80}})
   expect(next).toMatchObject({version:before.version+1,limits:{maxPagesPerScope:30,maxDiscoveryQueriesPerLot:500,maxVerificationBatch:80},updatedBy:admin.id})
   expect(await api.getRadarOperationalLimits(f.pool,admin)).toEqual(next)
   await expect(api.updateRadarOperationalLimits(f.pool,admin,{expectedVersion:before.version,limits:before.limits})).rejects.toThrow('radar_operational_policy_stale')
   expect((await f.pool.query('SELECT * FROM public.radar_capture_operations WHERE campaign_id=$1',[f.campaign.id])).rows).toHaveLength(0)
   expect((await f.pool.query('SELECT * FROM public.radar_operational_limit_audit WHERE policy_version=$1',[next.version])).rows).toHaveLength(1)
   await api.updateRadarOperationalLimits(f.pool,admin,{expectedVersion:next.version,limits:before.limits})
  }finally{await f.close()}
 })
})
