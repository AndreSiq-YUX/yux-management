import {randomUUID} from 'node:crypto'
import pg from 'pg'
import {beforeAll,afterAll,describe,it,expect} from 'vitest'
import {fixtureIds,fixtureUsers,seedIntegrationFixtures} from './support/fixtures.js'
import {createRadarCampaign} from '../../src/modules/radar/repository.js'
import {deliverRadarCompaniesToCrm} from '../../src/modules/radar/crm-delivery.js'
import {listLeads} from '../../src/modules/crm/repository.js'
import type {AuthUser} from '../../src/auth/routes.js'
const url=process.env.YUX_RADAR_TEST_DATABASE_URL
if(url){const parsed=new URL(url);if(parsed.hostname!=='127.0.0.1'||parsed.pathname!=='/yux_radar_research_test')throw Error('isolated_radar_test_database_required')}
describe.skipIf(!url)('Radar regional delivery to real CRM',()=>{
  const pool=new pg.Pool({connectionString:url}),admin=fixtureUsers.yux_admin as AuthUser
  const organizationId=fixtureIds.organizationA
  let campaignId:string,candidateId:string,instanceId:string,pipelineId:string,stageId:string,leadId:string
  beforeAll(async()=>{
    await seedIntegrationFixtures(pool)
    await pool.query(`INSERT INTO public.contract_modules(contract_id,module_key,enabled) VALUES($1,'radar',TRUE) ON CONFLICT(contract_id,module_key) DO UPDATE SET enabled=TRUE`,[fixtureIds.contractA])
    instanceId=(await pool.query(`INSERT INTO public.crm_instances(organization_id,contract_id,status) VALUES($1,$2,'active') ON CONFLICT(contract_id) DO UPDATE SET status='active' RETURNING id`,[organizationId,fixtureIds.contractA])).rows[0].id
    pipelineId=(await pool.query(`INSERT INTO public.crm_pipelines(organization_id,crm_instance_id,name,is_active) VALUES($1,$2,$3,TRUE) RETURNING id`,[organizationId,instanceId,`Teste Radar ${randomUUID()}`])).rows[0].id
    stageId=(await pool.query(`INSERT INTO public.crm_pipeline_stages(pipeline_id,key,name,order_index,is_active) VALUES($1,'radar','Contato manual',0,TRUE) RETURNING id`,[pipelineId])).rows[0].id
    campaignId=(await createRadarCampaign(pool,admin,{organizationId,name:'Teste entrega',campaignType:'regional_b2b',targetSegment:'Empresas',targetStates:['PR'],offerType:'Produtos da campanha'})).id
    candidateId=(await pool.query(`INSERT INTO public.radar_candidate_records(organization_id,campaign_id,source_type,title,dedupe_key,normalized_payload) VALUES($1,$2,'manual','Empresa revisada',$3,$4::jsonb) RETURNING id`,[organizationId,campaignId,randomUUID(),JSON.stringify({cnpj:'12345678000190',researchRevision:1,websiteStatus:'verified_present',publicContacts:[{kind:'phone',value:'+5541999998888',association:'confirmed',sourceUrl:'https://empresa.example/',observedAt:'2026-10-13'}]})])).rows[0].id
    await pool.query(`INSERT INTO public.radar_b2b_reviews(candidate_id,organization_id,campaign_id,target_status,product_fit,configuration_revision,verification_method,approved_by,approved_at) VALUES($1,$2,$3,'confirmed','high',1,'manual',$4,NOW())`,[candidateId,organizationId,campaignId,admin.id])
  })
  afterAll(async()=>{
    if(campaignId)await pool.query('DELETE FROM public.radar_campaigns WHERE id=$1',[campaignId])
    if(leadId)await pool.query('DELETE FROM public.leads WHERE id=$1',[leadId])
    if(pipelineId)await pool.query('DELETE FROM public.crm_pipelines WHERE id=$1',[pipelineId])
    await pool.end()
  })
  const input=()=>({organizationId,campaignId,configurationRevision:1,candidateIds:[candidateId],destination:{crmInstanceId:instanceId,pipelineId,stageId},requestId:randomUUID()})
  it('rejects foreign destinations, unreviewed and stale results before writing any lead',async()=>{
    await expect(deliverRadarCompaniesToCrm(pool,admin,{...input(),destination:{crmInstanceId:instanceId,pipelineId,stageId:randomUUID()}})).rejects.toThrow('radar_crm_destination_invalid')
    await pool.query('UPDATE public.radar_b2b_reviews SET approved_at=NULL WHERE candidate_id=$1',[candidateId])
    expect((await deliverRadarCompaniesToCrm(pool,admin,input())).items[0]).toMatchObject({status:'blocked',reason:'radar_crm_review_required'})
    await pool.query('UPDATE public.radar_b2b_reviews SET approved_at=NOW() WHERE candidate_id=$1',[candidateId])
    await expect(deliverRadarCompaniesToCrm(pool,admin,{...input(),configurationRevision:2})).rejects.toThrow('radar_campaign_configuration_changed')
    await expect(deliverRadarCompaniesToCrm(pool,fixtureUsers.client_admin_B as AuthUser,input())).rejects.toThrow('radar_forbidden')
    await pool.query(`UPDATE public.contract_modules SET enabled=FALSE WHERE contract_id=$1 AND module_key='crm'`,[fixtureIds.contractA])
    await expect(deliverRadarCompaniesToCrm(pool,admin,input())).rejects.toThrow('radar_crm_destination_invalid')
    await pool.query(`UPDATE public.contract_modules SET enabled=TRUE WHERE contract_id=$1 AND module_key='crm'`,[fixtureIds.contractA])
  })
  it('concurrent send creates one scoped lead without email fabrication, message or automation event',async()=>{
    const results=await Promise.all([deliverRadarCompaniesToCrm(pool,admin,input()),deliverRadarCompaniesToCrm(pool,admin,input())])
    expect(results.flatMap(result=>result.items).map(item=>item.status).sort()).toEqual(['already_linked','created'])
    leadId=results[0].items[0].leadId!
    const lead=(await pool.query('SELECT * FROM public.leads WHERE id=$1',[leadId])).rows[0]
    expect(lead).toMatchObject({organization_id:organizationId,crm_instance_id:instanceId,pipeline_id:pipelineId,stage_id:stageId,email:'',phone:'+5541999998888'})
    expect(lead.attribution_context).toMatchObject({recommendedOffer:'Produtos da campanha',radarCandidateId:candidateId})
    expect((await listLeads(pool,admin,{organizationId,pipelineId})).find(lead=>lead.id===leadId)?.name).toBe('Empresa revisada')
    expect((await pool.query('SELECT count(*)::int AS n FROM public.domain_events WHERE aggregate_id=$1',[leadId])).rows[0].n).toBe(0)
    expect((await pool.query('SELECT count(*)::int AS n FROM public.automation_executions WHERE lead_id=$1',[leadId])).rows[0].n).toBe(0)
  })
})
