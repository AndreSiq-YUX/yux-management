import pg from 'pg'
import {randomUUID} from 'node:crypto'
import {beforeAll,afterAll,describe,it,expect} from 'vitest'
import {fixtureIds,fixtureUsers,seedIntegrationFixtures} from './support/fixtures.js'
import {createRadarCampaign} from '../../src/modules/radar/repository.js'
import {recordRadarResearchFeedback,listRadarResearchFeedback} from '../../src/modules/radar/research-feedback.js'
import {getRadarResearchMetrics} from '../../src/modules/radar/research-metrics.js'
import {createContextAwarePool} from '../../src/db/client.js'
import {runWithDatabaseRequestContext} from '../../src/db/request-context.js'
import type {AuthUser} from '../../src/auth/routes.js'
const url=process.env.YUX_RADAR_TEST_DATABASE_URL
if(url){const parsed=new URL(url);if(parsed.hostname!=='127.0.0.1'||parsed.pathname!=='/yux_radar_research_test')throw Error('isolated_radar_test_database_required')}
describe.skipIf(!url)('Radar feedback audit and period metrics with RLS',()=>{
  const pool=new pg.Pool({connectionString:url}),apiUrl=url?new URL(url):undefined
  if(apiUrl)apiUrl.username='yux_api'
  const rawApi=new pg.Pool({connectionString:apiUrl?.toString()}),api=createContextAwarePool(rawApi,'api')
  const org=fixtureIds.internalOrg,admin=fixtureUsers.yux_admin as AuthUser
  const scope=<T>(fn:()=>Promise<T>)=>runWithDatabaseRequestContext({role:'yux_admin',organizationIds:[org],serviceRole:'api'},fn)
  let campaignId:string,candidateId:string
  beforeAll(async()=>{
    await seedIntegrationFixtures(pool)
    campaignId=(await createRadarCampaign(pool,admin,{organizationId:org,name:'Quality metrics fixture',campaignType:'regional_b2b',targetStates:['PR'],targetSegment:'Serviços',offerType:'Oferta',searchConfiguration:{research:{contactPurpose:'suppliers'}} as never})).id
    const data={researchRevision:1,websiteUrl:'https://alfa.example/',websiteStatus:'verified_present',publicContacts:[{kind:'email',value:'compras@alfa.example',sourceUrl:'https://alfa.example/',observedAt:'2026-10-15',association:'confirmed',purpose:'suppliers',scope:'establishment'}]}
    candidateId=(await pool.query(`INSERT INTO public.radar_candidate_records(organization_id,campaign_id,source_type,title,dedupe_key,normalized_payload) VALUES($1,$2,'manual','Empresa Alfa',$3,$4::jsonb) RETURNING id`,[org,campaignId,randomUUID(),JSON.stringify(data)])).rows[0].id
    const output={siteAssociation:'confirmed',discovery:{websiteUrl:data.websiteUrl,association:'confirmed',hits:[],suggestions:[],limitations:[],queries:1},pages:[{url:data.websiteUrl,text:'Empresa Alfa',observedAt:'2026-10-15'}],contacts:data.publicContacts}
    await pool.query(`INSERT INTO public.radar_candidate_research_runs(organization_id,campaign_id,candidate_id,configuration_revision,requested_by,status,output,completed_at) VALUES($1,$2,$3,1,$4,'partial',$5::jsonb,'2026-10-15T12:00:00Z')`,[org,campaignId,candidateId,admin.id,JSON.stringify(output)])
  })
  afterAll(async()=>{if(campaignId)await pool.query('DELETE FROM public.radar_campaigns WHERE id=$1',[campaignId]);await rawApi.end();await pool.end()})
  it('stores one immutable feedback for concurrent submissions without changing candidate facts',async()=>{
    const input={organizationId:org,candidateId,configurationRevision:1,requestId:randomUUID(),kind:'contact_invalid' as const,contact:{kind:'email',value:'compras@alfa.example'},note:'Equipe identificou contato incorreto.'}
    const results=await Promise.all([1,2].map(()=>scope(()=>recordRadarResearchFeedback(api,admin,input))))
    expect(results[0].id).toBe(results[1].id)
    const history=await scope(()=>listRadarResearchFeedback(api,admin,org,candidateId))
    expect(history).toHaveLength(1);expect(history[0].created_by).toBe(admin.id)
    expect((await pool.query('SELECT normalized_payload FROM public.radar_candidate_records WHERE id=$1',[candidateId])).rows[0].normalized_payload.publicContacts[0].value).toBe('compras@alfa.example')
    await expect(scope(()=>api.query('UPDATE public.radar_research_feedback SET note=$1 WHERE id=$2',['rewrite',results[0].id]))).rejects.toMatchObject({code:'42501'})
    const foreign=await runWithDatabaseRequestContext({role:'client_member',organizationIds:[fixtureIds.organizationA],serviceRole:'api'},()=>api.query('SELECT id FROM public.radar_research_feedback WHERE candidate_id=$1',[candidateId]))
    expect(foreign.rows).toHaveLength(0)
  })
  it('reads real evidence and usage aggregates for the requested campaign and period',async()=>{
    const result=await scope(()=>getRadarResearchMetrics(api,admin,{organizationId:org,campaignId,from:'2026-10-15',to:'2026-10-15'}))
    expect(result).toMatchObject({companies:1,identified:1,withUsefulContact:1,searchQueries:0,aiReportedUsd:null,period:{timeZone:'UTC'}})
    expect((await scope(()=>getRadarResearchMetrics(api,admin,{organizationId:org,campaignId,from:'2026-10-16',to:'2026-10-16'}))).companies).toBe(0)
  })
})
