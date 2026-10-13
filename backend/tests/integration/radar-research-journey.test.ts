import pg from 'pg'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { AuthUser } from '../../src/auth/routes.js'
import type { AppEnv } from '../../src/config/env.js'
import { createContextAwarePool } from '../../src/db/client.js'
import { runWithDatabaseRequestContext } from '../../src/db/request-context.js'
import { seedIntegrationFixtures, fixtureIds, fixtureUsers } from './support/fixtures.js'
import { storePlatformProviderSecret } from '../../src/modules/platform/adminRepository.js'
import { createRadarCampaign, approveRadarB2bProspect, exportRadarB2bProspectsCsv } from '../../src/modules/radar/repository.js'
import { startRadarCandidateResearch, executeRadarCandidateResearch, getRadarCandidateResearch,reopenRadarResearchReview,listRadarResearchHistory } from '../../src/modules/radar/research-service.js'
import { getRadarResearchAvailability } from '../../src/modules/radar/research-availability.js'

// Intentionally separate from production/container suites: never accept a remote or shared database.
const connectionString=process.env.YUX_RADAR_TEST_DATABASE_URL
if(connectionString){const url=new URL(connectionString);if(url.hostname!=='127.0.0.1'||url.pathname!=='/yux_radar_research_test')throw new Error('isolated_radar_test_database_required')}
describe.skipIf(!connectionString)('Radar research with migrated PostgreSQL and service-role RLS',()=>{
  const pool=new pg.Pool({connectionString})
  const workerUrl=connectionString?new URL(connectionString):undefined
  if(workerUrl)workerUrl.username='yux_worker'
  const rawWorker=new pg.Pool({connectionString:workerUrl?.toString()})
  const worker=createContextAwarePool(rawWorker,'worker')
  const admin=fixtureUsers.yux_admin as AuthUser,organizationId=fixtureIds.internalOrg
  const fixtureKey=Buffer.alloc(32,7).toString('base64')
  const scoped=<T>(fn:()=>Promise<T>)=>runWithDatabaseRequestContext({role:'yux_admin',organizationIds:[organizationId],serviceRole:'worker'},fn)
  const jobScope=<T>(fn:()=>Promise<T>)=>runWithDatabaseRequestContext({role:'client_member',organizationIds:[organizationId],serviceRole:'worker'},fn)
  let campaignId:string,candidateId:string,routeId:string,presenceRouteId:string
  beforeAll(async()=>{
    await seedIntegrationFixtures(pool)
    await pool.query('UPDATE public.organizations SET is_internal_growth_workspace=TRUE WHERE id=$1',[organizationId])
    const provider=await pool.query(`INSERT INTO public.platform_provider_connections (provider_type,provider_key,display_name,status,public_config,is_default)
      VALUES ('internal_service','brave_place','Isolated fixture','active',$1::jsonb,TRUE)
      ON CONFLICT (provider_type,provider_key,environment) DO UPDATE SET status='active',public_config=EXCLUDED.public_config RETURNING id`,
    [JSON.stringify({retentionLicensed:true,credentialPurpose:'licensed_retention',clientDeliveryLicensed:true,webSearchLicensed:true})])
    await storePlatformProviderSecret(pool,{providerConnectionId:provider.rows[0].id,secretKind:'api_key',value:'fixture-not-a-real-key'},`provider-key:${fixtureKey}`)
    await pool.query(`UPDATE public.radar_data_sources SET enabled=TRUE,default_cost_per_unit=.01,rate_limit_per_day=100 WHERE source_key='brave_web_search'`)
    await pool.query(`INSERT INTO public.platform_provider_connections (provider_type,provider_key,display_name,status,public_config)
      VALUES ('internal_service','cnpja','Isolated export rights','active','{"clientDeliveryLicensed":true}')
      ON CONFLICT (provider_type,provider_key,environment) DO UPDATE SET public_config=EXCLUDED.public_config`)
    const route=await pool.query(`INSERT INTO public.model_routing_rules (agent_type,organization_id,provider,model_name,max_input_tokens,max_output_tokens)
      VALUES ('radar_business_qualification',$1,'openrouter','fixture-not-a-real-model',16000,4000) RETURNING id`,[organizationId])
    routeId=route.rows[0].id
    presenceRouteId=(await pool.query(`INSERT INTO public.model_routing_rules (agent_type,organization_id,provider,model_name) VALUES ('radar_presence_resolution',$1,'openrouter','fixture-presence') RETURNING id`,[organizationId])).rows[0].id
    const campaign=await createRadarCampaign(pool,admin,{organizationId,name:`Isolated research ${randomUUID()}`,campaignType:'regional_b2b',
      targetSegment:'Empresas de serviços',targetStates:['PR'],offerType:'Automação',dailyLimit:10,budgetLimit:1,
      searchConfiguration:{sources:{enrichWithBrave:false},research:{enabled:true,webSearchEnabled:true,profileEnabled:true,contactPurpose:'suppliers',
        sizeAssessment:{enabled:true,criteria:[{metric:'units',weight:1,maxAgeDays:365,bands:[{min:0,points:0},{min:10,points:80}]}]}}} as never})
    campaignId=campaign.id
    await pool.query('UPDATE public.radar_campaigns SET configuration_revision=2 WHERE id=$1',[campaignId])
    const inserted=await pool.query(`INSERT INTO public.radar_candidate_records (organization_id,campaign_id,source_type,title,dedupe_key,normalized_payload)
      VALUES ($1,$2,'cnpja_advanced_search','Empresa Alfa',$3,$4::jsonb) RETURNING id`,[organizationId,campaignId,randomUUID(),
      JSON.stringify({cnpj:'12345678000190',tradeName:'Empresa Alfa',city:'Curitiba',state:'PR',phoneRaw:'4133334444',discoveryRevision:1,analysisRevision:1})])
    candidateId=inserted.rows[0].id
  })
  afterAll(async()=>{
    if(campaignId)await pool.query('DELETE FROM public.radar_campaigns WHERE id=$1',[campaignId])
    if(routeId)await pool.query('DELETE FROM public.model_routing_rules WHERE id=$1',[routeId])
    if(presenceRouteId)await pool.query('DELETE FROM public.model_routing_rules WHERE id=$1',[presenceRouteId])
    await Promise.all([pool.end(),rawWorker.end()])
  })
  it('loads availability with a real routing row and profile enabled on the migrated schema',async()=>{
    const result=await scoped(()=>getRadarResearchAvailability(worker,admin,organizationId,campaignId))
    expect(result.allowed).toBe(true)
    expect(result.semanticQualificationEnabled).toBe(true)
    expect('semantic' in result&&result.semantic?.routeConfigured).toBe(true)
  })
  it('queues once, persists worker evidence, reloads, reviews and exports without provider calls or outreach',async()=>{
    const input={organizationId,candidateId,configurationRevision:2}
    const starts=await scoped(()=>Promise.all([startRadarCandidateResearch(worker,admin,input),startRadarCandidateResearch(worker,admin,input)]))
    expect(starts[0].runId).toBe(starts[1].runId)
    const web=vi.fn(async()=>[{url:'https://alfa.example/',title:'Empresa Alfa',snippets:['CNPJ 12.345.678/0001-90'],observedAt:new Date().toISOString()}])
    const today=new Date().toISOString().slice(0,10),scaleExcerpt=`Em ${today} contamos com 12 unidades.`
    const collect=vi.fn(async()=>[{url:'https://alfa.example/',observedAt:new Date().toISOString(),text:`Empresa Alfa CNPJ 12.345.678/0001-90. Soluções de automação para empresas. ${scaleExcerpt}`,
      html:'<a href="tel:41999998888">Contato</a><a href="mailto:comercial@alfa.example">Comercial</a><a href="https://wa.me/5541999998888">WhatsApp</a><h2>Fornecedores</h2><a href="mailto:compras@alfa.example">compras@alfa.example</a>'}])
    const runtime=vi.fn(async()=>({targetStatus:'review',productFit:'unknown',reasons:[],evidenceIds:[],limitations:[],profile:{
      summary:{value:'Soluções de automação para empresas',evidenceId:'page-0',excerpt:'Soluções de automação para empresas.'},
      scaleSignals:[{value:'12 unidades',evidenceId:'page-0',excerpt:scaleExcerpt,metric:'units',amount:12,referenceDate:today,scope:'establishment'}],
    }}))
    const result=await jobScope(()=>executeRadarCandidateResearch(worker,{PROVIDER_SECRET_ENCRYPTION_KEY_B64:fixtureKey} as AppEnv,
      {runId:starts[0].runId,organizationId},undefined,{web,collect,runtime:runtime as never}))
    expect(result).toMatchObject({status:'succeeded'})
    await scoped(()=>executeRadarCandidateResearch(worker,{} as AppEnv,{runId:starts[0].runId,organizationId},undefined,{web,collect}))
    expect(web).toHaveBeenCalledTimes(1);expect(runtime).toHaveBeenCalledTimes(1)
    const dossier=await scoped(()=>getRadarCandidateResearch(worker,admin,organizationId,candidateId))
    expect(dossier.run?.output.contacts).toEqual(expect.arrayContaining([expect.objectContaining({kind:'whatsapp',association:'confirmed'})]))
    expect(dossier.run?.output.pages?.[0]).not.toHaveProperty('html')
    expect(dossier.run?.output.profile?.summary?.sourceUrl).toBe('https://alfa.example/')
    expect(dossier.run?.output.sizeAssessment).toMatchObject({score:80,evidenceCoverage:100})
    expect(dossier.run?.output.contacts).toContainEqual(expect.objectContaining({value:'compras@alfa.example',purpose:'suppliers',preferred:true}))
    const payload=(await pool.query('SELECT normalized_payload FROM public.radar_candidate_records WHERE id=$1',[candidateId])).rows[0].normalized_payload
    expect(payload).toMatchObject({phoneRaw:'4133334444',discoveryRevision:1,researchRevision:2,websiteUrl:'https://alfa.example/'})
    expect(payload.sitePhones).toContain('+5541999998888')
    const readsBeforeReanalysis=collect.mock.calls.length
    const reanalysisInput={...input,operation:'reanalyze' as const,requestId:randomUUID()}
    const reanalysis=await scoped(()=>startRadarCandidateResearch(worker,admin,reanalysisInput))
    expect(reanalysis.runId).not.toBe(starts[0].runId)
    expect((await scoped(()=>startRadarCandidateResearch(worker,admin,reanalysisInput))).runId).toBe(reanalysis.runId)
    await jobScope(()=>executeRadarCandidateResearch(worker,{PROVIDER_SECRET_ENCRYPTION_KEY_B64:fixtureKey} as AppEnv,
      {runId:reanalysis.runId,organizationId},undefined,{web,collect,runtime:runtime as never}))
    expect(web).toHaveBeenCalledTimes(1);expect(collect).toHaveBeenCalledTimes(readsBeforeReanalysis);expect(runtime).toHaveBeenCalledTimes(2)
    const reanalyzed=await scoped(()=>getRadarCandidateResearch(worker,admin,organizationId,candidateId))
    expect(reanalyzed.run?.output.contacts).toContainEqual(expect.objectContaining({value:'compras@alfa.example',purpose:'suppliers'}))
    const refreshed=await scoped(()=>startRadarCandidateResearch(worker,admin,{...input,operation:'refresh',requestId:randomUUID()}))
    expect(refreshed.runId).not.toBe(reanalysis.runId)
    await jobScope(()=>executeRadarCandidateResearch(worker,{PROVIDER_SECRET_ENCRYPTION_KEY_B64:fixtureKey} as AppEnv,
      {runId:refreshed.runId,organizationId},undefined,{web,collect,runtime:runtime as never}))
    expect(web).toHaveBeenCalledTimes(2)
    await scoped(()=>approveRadarB2bProspect(worker,admin,{organizationId,candidateId,manualEvidenceUrl:'https://alfa.example/',manualReviewNote:'Identidade e público conferidos na evidência pública de teste.'}))
    const csv=await scoped(()=>exportRadarB2bProspectsCsv(worker,admin,organizationId,campaignId))
    expect(csv).toContain('Empresa Alfa')
    expect(csv).toContain('compras@alfa.example');expect(csv).toContain('Soluções de automação para empresas')
    await expect(scoped(()=>startRadarCandidateResearch(worker,admin,input))).rejects.toThrow('radar_research_approved_candidate_requires_review')
    const history=await scoped(()=>listRadarResearchHistory(worker,admin,organizationId,campaignId))
    expect(history).toHaveLength(3)
    expect(history.map(item=>item.operation).sort()).toEqual(['complete','reanalyze','refresh'])
    await scoped(()=>reopenRadarResearchReview(worker,admin,{organizationId,candidateId,configurationRevision:2}))
    expect((await pool.query('SELECT approved_at FROM public.radar_b2b_reviews WHERE candidate_id=$1',[candidateId])).rows[0].approved_at).toBeNull()
    const hidden=await runWithDatabaseRequestContext({role:'client_admin',organizationIds:[fixtureIds.organizationB],serviceRole:'worker'},
      ()=>worker.query('SELECT id FROM public.radar_candidate_research_runs WHERE id=$1',[starts[0].runId]))
    expect(hidden.rows).toHaveLength(0)
    const usage=await pool.query('SELECT SUM(units)::integer AS units FROM public.radar_source_usage_counters WHERE campaign_id=$1',[campaignId])
    expect(usage.rows[0].units).toBe(2)
  })
  it('reclassifies legacy facts without searches then explicitly refreshes brand identity while preserving history',async()=>{
    await pool.query(`UPDATE public.radar_campaigns SET search_configuration=jsonb_set(search_configuration,'{research}', '{"enabled":true,"webSearchEnabled":true,"presenceResolutionEnabled":true,"maxSearchQueriesPerCandidate":1}'::jsonb) WHERE id=$1`,[campaignId])
    const id=(await pool.query(`INSERT INTO public.radar_candidate_records(organization_id,campaign_id,source_type,title,dedupe_key,normalized_payload) VALUES($1,$2,'cnpja_advanced_search','Empresa Gama',$3,'{"cnpj":"23456789000190","city":"Recife","state":"PE","websiteUrl":"https://empresadois.com.br/cnpj/23456789000190"}') RETURNING id`,[organizationId,campaignId,randomUUID()])).rows[0].id
    const oldContact={kind:'social',value:'https://instagram.com/serasa',sourceUrl:'https://serasaexperian.com.br/consulta-gratis/23456789000190',observedAt:'2026-09-01',association:'review'}
    const oldOutput={discovery:{association:'confirmed',websiteUrl:oldContact.sourceUrl,hits:[],suggestions:[],limitations:[],queries:3},contacts:[oldContact],pages:[{url:oldContact.sourceUrl,text:'CNPJ 23.456.789/0001-90. Consulta cadastral.',observedAt:oldContact.observedAt}],readingComplete:true}
    const old=(await pool.query(`INSERT INTO public.radar_candidate_research_runs(organization_id,campaign_id,candidate_id,requested_by,configuration_revision,status,output) VALUES($1,$2,$3,$4,2,'partial',$5) RETURNING id`,[organizationId,campaignId,id,admin.id,JSON.stringify(oldOutput)])).rows[0].id
    expect((await scoped(()=>getRadarCandidateResearch(worker,admin,organizationId,id))).run?.output.contacts).toEqual([])
    const reanalysis=await scoped(()=>startRadarCandidateResearch(worker,admin,{organizationId,candidateId:id,configurationRevision:2,operation:'reanalyze',requestId:randomUUID()}))
    const web=vi.fn(),collect=vi.fn(),runtime=vi.fn()
    await jobScope(()=>executeRadarCandidateResearch(worker,{} as AppEnv,{runId:reanalysis.runId,organizationId},undefined,{web,collect,runtime}))
    expect(web).not.toHaveBeenCalled();expect(collect).not.toHaveBeenCalled()
    expect((await pool.query('SELECT output FROM public.radar_candidate_research_runs WHERE id=$1',[old])).rows[0].output.contacts).toEqual([oldContact])
    const fresh=await scoped(()=>startRadarCandidateResearch(worker,admin,{organizationId,candidateId:id,configurationRevision:2,operation:'refresh',requestId:randomUUID()}))
    const source={url:'https://marca-gama.example/',text:'Marca Delta. Empresa Gama é nossa razão social. Fornecedores: compras@marca-gama.example.',observedAt:'2026-10-13'}
    web.mockResolvedValue([{url:source.url,title:'Marca Delta',snippets:['Empresa Gama'],observedAt:source.observedAt}]);collect.mockResolvedValue([source])
    runtime.mockResolvedValue({candidateId:'page-0',scope:'group',reason:'A marca apresenta a razão social procurada.',claims:[{evidenceId:'page-0',excerpt:'Empresa Gama é nossa razão social.'}]})
    await jobScope(()=>executeRadarCandidateResearch(worker,{PROVIDER_SECRET_ENCRYPTION_KEY_B64:fixtureKey} as AppEnv,{runId:fresh.runId,organizationId},undefined,{web,collect,runtime}))
    expect(web).toHaveBeenCalledTimes(1);expect(runtime).toHaveBeenCalledTimes(1)
    const dossier=await scoped(()=>getRadarCandidateResearch(worker,admin,organizationId,id))
    expect(dossier.run?.output).toMatchObject({methodVersion:2,presenceResolution:{scope:'group'},discovery:{websiteUrl:source.url}})
    expect(dossier.run?.output.contacts).toContainEqual(expect.objectContaining({value:'compras@marca-gama.example',scope:'group'}))
    expect(dossier.history).toHaveLength(2)
  })
})
