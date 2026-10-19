import pg from 'pg'
import {randomUUID} from 'node:crypto'
import {beforeAll,afterAll,describe,it,expect} from 'vitest'
import {buildServer} from '../../src/server.js'
import {createContextAwarePool} from '../../src/db/client.js'
import {fixtureIds,fixtureUsers,fixturePassword,seedIntegrationFixtures} from './support/fixtures.js'
import {createRadarCampaign} from '../../src/modules/radar/repository.js'
import type {AuthUser} from '../../src/auth/routes.js'
import {connectionString} from '../support/radar-capture-fixture.js'

describe.skipIf(!connectionString)('Radar commercial HTTP audience with isolated PostgreSQL',()=>{
 const pool=new pg.Pool({connectionString});let app:Awaited<ReturnType<typeof buildServer>>,apiPool:pg.Pool,campaignId:string,candidateId:string
 const cookies=new Map<string,string>()
 beforeAll(async()=>{
  await seedIntegrationFixtures(pool)
  await pool.query(`INSERT INTO public.contract_modules(contract_id,module_key,enabled) VALUES($1,'radar',TRUE) ON CONFLICT(contract_id,module_key) DO UPDATE SET enabled=TRUE`,[fixtureIds.contractA])
  campaignId=(await createRadarCampaign(pool,fixtureUsers.yux_admin as AuthUser,{organizationId:fixtureIds.organizationA,name:'Campanha comercial',targetSegment:'Empresas',targetStates:['SP'],campaignType:'regional_b2b',offerType:'Massas'})).id
  candidateId=(await pool.query(`INSERT INTO public.radar_candidate_records(organization_id,campaign_id,source_type,title,dedupe_key,normalized_payload) VALUES($1,$2,'cnpja_advanced_search','Brave Transportes',$3,$4::jsonb) RETURNING id`,[fixtureIds.organizationA,campaignId,randomUUID(),JSON.stringify({cnpj:'1128426000198',city:'Poá',state:'SP',braveSourceUrl:'https://api.search.brave.com',sourceType:'cnpja_advanced_search',model:'OpenRouter',futureInternalField:'private',websiteUrl:'https://empresa.example/',websiteStatus:'unverified'})])).rows[0].id
  const url=new URL(connectionString!);url.username='yux_api'
  apiPool=createContextAwarePool(new pg.Pool({connectionString:url.toString()}),'api')
  app=await buildServer({NODE_ENV:'test',DATABASE_URL:connectionString!,REDIS_URL:'redis://127.0.0.1:1',SESSION_COOKIE_NAME:'yux_session',SESSION_SECRET:'local-commercial-test-secret-at-least-32',CORS_ORIGIN:'http://localhost:3000',PORT:4000},{pool:apiPool,jobQueue:{add:async()=>{throw Error('no_external_effects')},close:async()=>{}},redisPing:async()=>'PONG'})
  for(const key of ['yux_admin','yux_operator','client_admin_A','client_member_A','client_admin_B'] as const){
   const login=await app.inject({method:'POST',url:'/api/auth/login',payload:{email:fixtureUsers[key].email,password:fixturePassword}})
   expect(login.statusCode).toBe(200)
   cookies.set(key,String(login.headers['set-cookie']).split(';')[0])
  }
 })
 afterAll(async()=>{await app?.close();await apiPool?.end();if(campaignId)await pool.query('DELETE FROM public.radar_campaigns WHERE id=$1',[campaignId]);await pool.end()})
 const get=(path:string,user:string)=>app.inject({method:'GET',url:`/api/radar${path}`,headers:{cookie:cookies.get(user)!}})
 it.each(['yux_admin','yux_operator','client_admin_A','client_member_A'])('keeps a durable research request after queue loss and hides technical internals at POST/GET: %s',async user=>{
  const requestId=randomUUID()
  const response=await app.inject({method:'POST',url:`/api/radar/campaigns/${campaignId}/research-requests`,headers:{cookie:cookies.get(user)!},payload:{organizationId:fixtureIds.organizationA,criteriaRevision:1,requestId,candidateIds:[candidateId],intent:'resume'}})
  const role=user==='client_member_A'?'client_member':'client_admin'
  const permitted=user.startsWith('yux_')||(await pool.query("SELECT 1 FROM public.role_permissions WHERE role_key=$1 AND permission_key='radar:manage'",[role])).rows.length>0
  expect(response.statusCode).toBe(permitted?202:403)
  if(!permitted)return
  expect(response.json()).toMatchObject({requestId,state:'accepted',items:[{candidateId,state:'accepted'}]})
  expect((await pool.query('SELECT COUNT(*) AS n FROM public.radar_research_requests WHERE request_id=$1',[requestId])).rows[0].n).toBe('1')
  const read=await get(`/campaigns/${campaignId}/research-requests/${requestId}?organizationId=${fixtureIds.organizationA}`,user)
  expect(read.statusCode).toBe(200)
  expect(read.body).not.toMatch(/OpenRouter|brave|cnpja|serper|model|provider|cost|lease|intent_hash|requested_by|analysis_authorization/i)
  const foreign=await get(`/campaigns/${campaignId}/research-requests/${requestId}?organizationId=${fixtureIds.organizationA}`,'client_admin_B')
  expect([403,404]).toContain(foreign.statusCode)
  if(user!=='yux_admin'){
   const consent=await app.inject({method:'POST',url:`/api/radar/campaigns/${campaignId}/research-requests`,headers:{cookie:cookies.get(user)!},payload:{organizationId:fixtureIds.organizationA,criteriaRevision:1,requestId:randomUUID(),candidateIds:[candidateId],intent:'resume',allowSemanticRefresh:true}})
   expect(consent.statusCode).toBe(403)
  }
 })
 it.each(['yux_admin','yux_operator','client_admin_A','client_member_A','client_admin_B'])('restricts lot capacity diagnostics at the direct HTTP boundary: %s',async user=>{
  const response=await app.inject({method:'POST',url:`/api/radar/campaigns/${campaignId}/capture-preflight`,headers:{cookie:cookies.get(user)!},payload:{organizationId:fixtureIds.organizationA,configurationRevision:1,requestedCount:1}})
  expect(response.statusCode).toBe(user==='yux_admin'?200:403)
  if(user==='yux_admin')expect(response.json()).toHaveProperty('warnings')
  else expect(response.body).not.toMatch(/remainingQueries|researchCapacity|plannedMaximumQueries|brave|serper|policy/i)
 })
 it.each(['yux_operator','client_admin_A','client_member_A'])('withholds catalog and operational diagnostics from %s',async user=>{
  for(const path of [`/data-sources?organizationId=${fixtureIds.organizationA}`,`/campaigns/${campaignId}/research-availability?organizationId=${fixtureIds.organizationA}`,`/campaigns/${campaignId}/runs`]){
   const response=await get(path,user);expect(response.statusCode).toBe(403);expect(response.body).not.toMatch(/brave|cnpja|serper|model|cost|provider/i)
  }
 })
 it.each(['client_admin_A','client_member_A','yux_operator'])('returns useful candidates and campaign criteria without internals to %s',async user=>{
  const candidates=await get(`/campaigns/${campaignId}/candidates`,user)
  expect(candidates.statusCode).toBe(200);expect(candidates.json()).toMatchObject([{title:'Brave Transportes',facts:{cnpj:'1128426000198',city:'Poá'}}])
  expect(candidates.body).not.toMatch(/cnpja|braveSource|api.search|OpenRouter|normalizedPayload|futureInternalField/)
  const campaigns=await get(`/campaigns?organizationId=${fixtureIds.organizationA}`,user)
  expect(campaigns.statusCode).toBe(200);expect(campaigns.body).not.toMatch(/budgetLimit|dailyLimit|searchConfiguration|sources|webSearchProviders/)
 })
 it('keeps full source metadata accessible only to the system Admin',async()=>{
  const response=await get(`/campaigns/${campaignId}/candidates`,'yux_admin')
  expect(response.statusCode).toBe(200);expect(response.json()[0]).toHaveProperty('normalizedPayload.model','OpenRouter')
 })
 it('denies cross-tenant results before commercial projection',async()=>{
  const response=await get(`/campaigns/${campaignId}/candidates`,'client_admin_B')
  expect(response.statusCode).toBe(403);expect(response.body).not.toContain('1128426000198')
 })
 it('returns only business research metrics and no provider costs',async()=>{
  const response=await get(`/campaigns/${campaignId}/research-metrics?organizationId=${fixtureIds.organizationA}&from=2026-10-01&to=2026-10-15`,'client_admin_A')
  expect(response.statusCode).toBe(200);expect(response.json()).toMatchObject({companies:0,identified:0,withUsefulContact:0,readyForReview:0})
  expect(response.body).not.toMatch(/sources|aiReported|aiCost|searchQueries|Estimated|currencyNote/)
 })
 it('does not reveal a stored provider failure through a company research response',async()=>{
  await pool.query(`INSERT INTO public.radar_candidate_research_runs(organization_id,campaign_id,candidate_id,requested_by,configuration_revision,status,error_code,output) VALUES($1,$2,$3,$4,1,'blocked','brave_provider_inactive',$5::jsonb)`,[fixtureIds.organizationA,campaignId,candidateId,fixtureUsers.yux_admin.id,JSON.stringify({discovery:{association:'review',hits:[],suggestions:[],limitations:[],queries:0},contacts:[],pages:[],limitations:['OpenRouter error'],activity:{status:'inconclusive',signals:[],limitation:'Brave unavailable'}})])
  const response=await get(`/candidates/${candidateId}/research?organizationId=${fixtureIds.organizationA}`,'client_admin_A')
  expect(response.statusCode).toBe(200);expect(response.json()).toMatchObject({status:'blocked',pendingMessage:'Pesquisa aguardando a equipe responsável'})
  expect(response.json().facts.tradeName).toBe('Brave Transportes')
  expect(response.body).not.toMatch(/brave_provider|OpenRouter|model|availability|error_code|calls|tlsDiagnostics/i)
 })
})
