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
import { startRadarCandidateResearch, executeRadarCandidateResearch, getRadarCandidateResearch } from '../../src/modules/radar/research-service.js'

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
  let campaignId:string,candidateId:string
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
    const campaign=await createRadarCampaign(pool,admin,{organizationId,name:`Isolated research ${randomUUID()}`,campaignType:'regional_b2b',
      targetSegment:'Empresas de serviços',targetStates:['PR'],offerType:'Automação',dailyLimit:10,budgetLimit:1,
      searchConfiguration:{sources:{enrichWithBrave:false},research:{enabled:true,webSearchEnabled:true}} as never})
    campaignId=campaign.id
    await pool.query('UPDATE public.radar_campaigns SET configuration_revision=2 WHERE id=$1',[campaignId])
    const inserted=await pool.query(`INSERT INTO public.radar_candidate_records (organization_id,campaign_id,source_type,title,dedupe_key,normalized_payload)
      VALUES ($1,$2,'cnpja_advanced_search','Empresa Alfa',$3,$4::jsonb) RETURNING id`,[organizationId,campaignId,randomUUID(),
      JSON.stringify({cnpj:'12345678000190',tradeName:'Empresa Alfa',city:'Curitiba',state:'PR',phoneRaw:'4133334444',discoveryRevision:1,analysisRevision:1})])
    candidateId=inserted.rows[0].id
  })
  afterAll(async()=>{if(campaignId)await pool.query('DELETE FROM public.radar_campaigns WHERE id=$1',[campaignId]);await Promise.all([pool.end(),rawWorker.end()])})
  it('queues once, persists worker evidence, reloads, reviews and exports without provider calls or outreach',async()=>{
    const input={organizationId,candidateId,configurationRevision:2}
    const starts=await scoped(()=>Promise.all([startRadarCandidateResearch(worker,admin,input),startRadarCandidateResearch(worker,admin,input)]))
    expect(starts[0].runId).toBe(starts[1].runId)
    const web=vi.fn(async()=>[{url:'https://alfa.example/',title:'Empresa Alfa',snippets:['CNPJ 12.345.678/0001-90'],observedAt:new Date().toISOString()}])
    const collect=vi.fn(async()=>[{url:'https://alfa.example/',observedAt:new Date().toISOString(),text:'Empresa Alfa CNPJ 12.345.678/0001-90',
      html:'<a href="tel:41999998888">Contato</a><a href="mailto:comercial@alfa.example">Comercial</a><a href="https://wa.me/5541999998888">WhatsApp</a>'}])
    const result=await jobScope(()=>executeRadarCandidateResearch(worker,{PROVIDER_SECRET_ENCRYPTION_KEY_B64:fixtureKey} as AppEnv,
      {runId:starts[0].runId,organizationId},undefined,{web,collect}))
    expect(result).toMatchObject({status:'succeeded'})
    await scoped(()=>executeRadarCandidateResearch(worker,{} as AppEnv,{runId:starts[0].runId,organizationId},undefined,{web,collect}))
    expect(web).toHaveBeenCalledTimes(1)
    const dossier=await scoped(()=>getRadarCandidateResearch(worker,admin,organizationId,candidateId))
    expect(dossier.run?.output.contacts).toEqual(expect.arrayContaining([expect.objectContaining({kind:'whatsapp',association:'confirmed'})]))
    expect(dossier.run?.output.pages?.[0]).not.toHaveProperty('html')
    const payload=(await pool.query('SELECT normalized_payload FROM public.radar_candidate_records WHERE id=$1',[candidateId])).rows[0].normalized_payload
    expect(payload).toMatchObject({phoneRaw:'4133334444',discoveryRevision:1,researchRevision:2,websiteUrl:'https://alfa.example/'})
    expect(payload.sitePhones).toContain('+5541999998888')
    await scoped(()=>approveRadarB2bProspect(worker,admin,{organizationId,candidateId,manualEvidenceUrl:'https://alfa.example/',manualReviewNote:'Identidade e público conferidos na evidência pública de teste.'}))
    const csv=await scoped(()=>exportRadarB2bProspectsCsv(worker,admin,organizationId,campaignId))
    expect(csv).toContain('Empresa Alfa')
    await expect(scoped(()=>startRadarCandidateResearch(worker,admin,input))).rejects.toThrow('radar_research_approved_candidate_requires_review')
    const hidden=await runWithDatabaseRequestContext({role:'client_admin',organizationIds:[fixtureIds.organizationB],serviceRole:'worker'},
      ()=>worker.query('SELECT id FROM public.radar_candidate_research_runs WHERE id=$1',[starts[0].runId]))
    expect(hidden.rows).toHaveLength(0)
    const usage=await pool.query('SELECT SUM(units)::integer AS units FROM public.radar_source_usage_counters WHERE campaign_id=$1',[campaignId])
    expect(usage.rows[0].units).toBe(1)
  })
})
