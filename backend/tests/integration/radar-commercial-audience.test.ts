import pg from 'pg'
import {randomUUID} from 'node:crypto'
import {beforeAll,afterAll,describe,it,expect} from 'vitest'
import {buildServer} from '../../src/server.js'
import {createContextAwarePool} from '../../src/db/client.js'
import {fixtureIds,fixtureUsers,fixturePassword,seedIntegrationFixtures} from './support/fixtures.js'
import {createRadarCampaign} from '../../src/modules/radar/repository.js'
import type {AuthUser} from '../../src/auth/routes.js'
import {connectionString,activateCaptureSearch} from '../support/radar-capture-fixture.js'
import {dispatchRadarResearchRequest} from '../../src/modules/radar/research-requests.js'
import {executeRadarCandidateResearch} from '../../src/modules/radar/research-service.js'

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
 it('stops an accepted request with a useful waiting state when its user loses write permission',async()=>{
  const had=(await pool.query("SELECT 1 FROM public.role_permissions WHERE role_key='client_admin' AND permission_key='radar:manage'")).rows.length>0
  try{
   await pool.query("INSERT INTO public.role_permissions(role_key,permission_key) VALUES('client_admin','radar:manage') ON CONFLICT DO NOTHING")
   const requestId=randomUUID()
   const accepted=await app.inject({method:'POST',url:`/api/radar/campaigns/${campaignId}/research-requests`,headers:{cookie:cookies.get('client_admin_A')!},payload:{organizationId:fixtureIds.organizationA,criteriaRevision:1,requestId,candidateIds:[candidateId],intent:'resume'}})
   expect(accepted.statusCode).toBe(202)
   await pool.query("DELETE FROM public.role_permissions WHERE role_key='client_admin' AND permission_key='radar:manage'")
   const request=(await pool.query('SELECT id FROM public.radar_research_requests WHERE request_id=$1',[requestId])).rows[0]
   let jobs=0
   const result=await dispatchRadarResearchRequest(pool,{} as never,{organizationId:fixtureIds.organizationA,researchRequestId:request.id},{add:async()=>{jobs++}} as never)
   expect(jobs).toBe(0);expect(result).toMatchObject({state:'waiting',items:[{candidateId,state:'waiting'}]})
   expect((await pool.query('SELECT reason_code FROM public.radar_research_request_items WHERE research_request_id=$1',[request.id])).rows[0].reason_code).toBe('radar_forbidden')
  }finally{if(had)await pool.query("INSERT INTO public.role_permissions(role_key,permission_key) VALUES('client_admin','radar:manage') ON CONFLICT DO NOTHING")}
 })
 it.each(['yux_operator','client_admin_A','client_member_A'])('denies operational budget approval by direct HTTP to %s',async user=>{
  const result=await app.inject({method:'POST',url:`/api/radar/admin/research-requests/${randomUUID()}/authorize-budget`,headers:{cookie:cookies.get(user)!},payload:{organizationId:fixtureIds.organizationA,expectedBudgetRevision:1,authorizationId:randomUUID()}})
  expect(result.statusCode).toBe(403);expect(result.body).not.toMatch(/cost|budgetRevision|brave|serper|policy/)
 })
 it('executes an entitled client Admin research request without technical overrides or provider calls for saved facts',async()=>{
  const prior=(await pool.query('SELECT search_configuration FROM public.radar_campaigns WHERE id=$1',[campaignId])).rows[0].search_configuration
  const hadPermission=(await pool.query("SELECT 1 FROM public.role_permissions WHERE role_key='client_admin' AND permission_key='radar:manage'")).rows.length>0
  await pool.query("INSERT INTO public.role_permissions(role_key,permission_key) VALUES('client_admin','radar:manage') ON CONFLICT DO NOTHING")
  await activateCaptureSearch(pool)
  const candidate=(await pool.query(`INSERT INTO public.radar_candidate_records(organization_id,campaign_id,source_type,title,dedupe_key,normalized_payload) VALUES($1,$2,'manual','Empresa Alfa',$3,'{"cnpj":"12345678000190","tradeName":"Empresa Alfa","city":"Curitiba","state":"PR"}') RETURNING id`,[fixtureIds.organizationA,campaignId,randomUUID()])).rows[0]
  try{
   await pool.query(`UPDATE public.radar_campaigns SET search_configuration=jsonb_set(jsonb_set(jsonb_set(search_configuration,'{research,enabled}','true'),'{research,webSearchEnabled}','true'),'{sources,enrichWithBrave}','false') WHERE id=$1`,[campaignId])
   const requestId=randomUUID()
   const response=await app.inject({method:'POST',url:`/api/radar/campaigns/${campaignId}/research-requests`,headers:{cookie:cookies.get('client_admin_A')!},payload:{organizationId:fixtureIds.organizationA,criteriaRevision:1,requestId,candidateIds:[candidate.id],intent:'resume'}})
   expect(response.statusCode).toBe(202)
   const request=(await pool.query('SELECT id FROM public.radar_research_requests WHERE request_id=$1',[requestId])).rows[0]
   await dispatchRadarResearchRequest(pool,{} as never,{organizationId:fixtureIds.organizationA,researchRequestId:request.id},{add:async()=>({id:'fixture'})} as never)
   const item=(await pool.query('SELECT * FROM public.radar_research_request_items WHERE research_request_id=$1',[request.id])).rows[0]
   expect(item).toMatchObject({reason_code:null,run_id:expect.any(String)})
   const page={url:'https://alfa.example/',text:'Empresa Alfa CNPJ 12.345.678/0001-90. Contato compras@alfa.example',observedAt:new Date().toISOString()}
   await pool.query('UPDATE public.radar_candidate_research_runs SET output=$2 WHERE id=$1',[item.run_id,JSON.stringify({readerVersion:4,readingComplete:true,discoveryLocked:true,pages:[page],discovery:{association:'confirmed',websiteUrl:page.url,hits:[],suggestions:[],limitations:[],queries:1}})])
   let calls=0
   await executeRadarCandidateResearch(pool,{} as never,{organizationId:fixtureIds.organizationA,runId:item.run_id},undefined,{web:async()=>{calls++;return[]},local:async()=>{calls++;return[]},runtime:async()=>{calls++;throw Error('unexpected_provider_call')}})
   expect(calls).toBe(0)
   expect((await pool.query('SELECT normalized_payload FROM public.radar_candidate_records WHERE id=$1',[candidate.id])).rows[0].normalized_payload).toMatchObject({websiteUrl:page.url,websiteStatus:'verified_present'})
  }finally{await pool.query('DELETE FROM public.radar_candidate_records WHERE id=$1',[candidate.id]);await pool.query('UPDATE public.radar_campaigns SET search_configuration=$2 WHERE id=$1',[campaignId,JSON.stringify(prior)]);if(!hadPermission)await pool.query("DELETE FROM public.role_permissions WHERE role_key='client_admin' AND permission_key='radar:manage'")}
 })
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
