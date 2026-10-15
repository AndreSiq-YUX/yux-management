import pg from 'pg'
import {randomUUID,randomInt} from 'node:crypto'
import {fixtureIds,fixtureUsers,seedIntegrationFixtures} from '../integration/support/fixtures.js'
import {createRadarCampaign} from '../../src/modules/radar/repository.js'
import type {AuthUser} from '../../src/auth/routes.js'

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
  const campaign=await createRadarCampaign(pool,admin,{organizationId,name:`Capture ${randomUUID()}`,campaignType:'regional_b2b',targetSegment:'Empresas',targetStates:['PR'],offerType:'Oferta',dailyLimit:10000,budgetLimit:100,
    searchConfiguration:{sources:{enrichWithBrave:false},batch:{pageSize:10,maxPagesPerScope:5,maxQueriesPerBatch:5},research:{enabled:true,webSearchEnabled:true}}} as never)
  return {pool,campaign,async close(){await pool.query('DELETE FROM public.radar_campaigns WHERE id=$1',[campaign.id]);await pool.end()}}
}
export function company(){return {taxId:String(randomInt(10_000_000_000_000,99_999_999_999_999)),tradeName:'Empresa sintética',legalName:'Empresa sintética LTDA',city:'Curitiba',state:'PR',cnaes:[],websiteStatus:'unknown' as const,rawPayload:{}}}
