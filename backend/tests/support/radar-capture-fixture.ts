import pg from 'pg'
import {randomUUID,randomInt} from 'node:crypto'
import {fixtureIds,fixtureUsers,seedIntegrationFixtures} from '../integration/support/fixtures.js'
import {createRadarCampaign} from '../../src/modules/radar/repository.js'
import type {AuthUser} from '../../src/auth/routes.js'
import {storePlatformProviderSecret} from '../../src/modules/platform/adminRepository.js'

export const connectionString=process.env.YUX_RADAR_TEST_DATABASE_URL
if(connectionString){const url=new URL(connectionString);if(url.hostname!=='127.0.0.1'||url.pathname!=='/yux_radar_research_test')throw new Error('isolated_radar_test_database_required')}
export const admin=fixtureUsers.yux_admin as AuthUser,organizationId=fixtureIds.internalOrg
export const available=async()=>({allowed:true,reasons:[],semanticQualificationEnabled:false,maximumCostPerCandidate:.03,maxQueriesPerCandidate:3})
export async function captureFixture(){
  const pool=new pg.Pool({connectionString})
  await seedIntegrationFixtures(pool)
  await pool.query('UPDATE public.organizations SET is_internal_growth_workspace=TRUE WHERE id=$1',[organizationId])
  await pool.query(`UPDATE public.radar_data_sources SET enabled=TRUE,default_cost_per_unit=.025,rate_limit_per_day=10000 WHERE source_key='cnpja_advanced_search'`)
  await pool.query(`INSERT INTO public.platform_provider_connections(provider_type,provider_key,display_name,status,public_config) VALUES('internal_service','cnpja','Fixture','active','{}') ON CONFLICT(provider_type,provider_key,environment) DO UPDATE SET status='active'`)
  const provider=(await pool.query("SELECT id FROM public.platform_provider_connections WHERE provider_key='cnpja' AND environment='production' ORDER BY is_default DESC,updated_at DESC LIMIT 1")).rows[0]
  await storePlatformProviderSecret(pool,{providerConnectionId:provider.id,secretKind:'api_key',value:'fixture-not-real'},`provider-key:${Buffer.alloc(32,7).toString('base64')}`)
  await activateCaptureSearch(pool)
  const heartbeat=randomUUID()
  await pool.query("INSERT INTO public.worker_process_heartbeats(instance_id,queue_classes,started_at,last_seen_at,metadata) VALUES($1,ARRAY['external'],NOW(),NOW(),'{}')",[heartbeat])
  const campaign=await createRadarCampaign(pool,admin,{organizationId,name:`Capture ${randomUUID()}`,campaignType:'regional_b2b',targetSegment:'Empresas',targetStates:['PR'],offerType:'Oferta',dailyLimit:1000,budgetLimit:100,
    // These fixtures exercise the original persisted v1 capture protocol, not new-campaign defaults.
    searchConfiguration:{funnel:{enabled:false},discovery:{enabled:false},sources:{enrichWithBrave:false},batch:{pageSize:10,maxPagesPerScope:5,maxQueriesPerBatch:5},research:{enabled:true,webSearchEnabled:true,webSearchProviders:['brave_web_search'],presenceResolutionEnabled:false,semanticQualificationEnabled:false,profileEnabled:false,inspectLinkedSocialProfiles:false,deepResearchEnabled:false,completion:{enabled:false}}}} as never)
  return {pool,campaign,async close(){await pool.query('DELETE FROM public.radar_campaigns WHERE id=$1',[campaign.id]);await pool.query('DELETE FROM public.worker_process_heartbeats WHERE instance_id=$1',[heartbeat]);await pool.end()}}
}
export function company(){return {taxId:String(randomInt(10_000_000_000_000,99_999_999_999_999)),tradeName:'Empresa sintética',legalName:'Empresa sintética LTDA',city:'Curitiba',state:'PR',cnaes:[],websiteStatus:'unknown' as const,rawPayload:{}}}
export async function activateCaptureSearch(pool:pg.Pool){
 const provider=(await pool.query(`INSERT INTO public.platform_provider_connections(provider_type,provider_key,display_name,status,public_config,is_default) VALUES('internal_service','brave_place','Fixture','active','{"retentionLicensed":true,"credentialPurpose":"licensed_retention","webSearchLicensed":true}',TRUE) ON CONFLICT(provider_type,provider_key,environment) DO UPDATE SET status='active',public_config=EXCLUDED.public_config RETURNING id`)).rows[0]
 await storePlatformProviderSecret(pool,{providerConnectionId:provider.id,secretKind:'api_key',value:'fixture-not-real'},`provider-key:${Buffer.alloc(32,7).toString('base64')}`)
 await pool.query("UPDATE public.radar_data_sources SET enabled=TRUE,default_cost_per_unit=.01,rate_limit_per_day=10000 WHERE source_key='brave_web_search'")
}
