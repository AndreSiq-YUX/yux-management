import {describe,it,expect} from 'vitest'
import {randomUUID} from 'node:crypto'
import {captureFixture,connectionString,admin,organizationId} from '../support/radar-capture-fixture.js'
import {admitRadarBusinessMention} from '../../src/modules/radar/candidate-admission.js'
import {getRadarCaptureOperation} from '../../src/modules/radar/capture-operation.js'
import {startRadarCandidateResearch,executeRadarCandidateResearch} from '../../src/modules/radar/research-service.js'
import {restoreRadarDecisionExclusion} from '../../src/modules/radar/decision-review.js'
import {listRadarCandidates} from '../../src/modules/radar/repository.js'
const api=await import('../../src/modules/radar/campaign-exclusions.js').catch(()=>({})) as Record<string,any>
describe.skipIf(!connectionString)('durable campaign exclusions',()=>{
 it('restores to review without restoring an old approval and keeps its audit snapshot',async()=>{
  const f=await captureFixture()
  try{
   const id=(await f.pool.query(`INSERT INTO public.radar_candidate_records(organization_id,campaign_id,source_type,title,dedupe_key) VALUES($1,$2,'manual','Empresa aprovada',$3) RETURNING id`,[organizationId,f.campaign.id,randomUUID()])).rows[0].id
   await f.pool.query(`INSERT INTO public.radar_b2b_reviews(candidate_id,organization_id,campaign_id,configuration_revision,target_status,product_fit,approved_by,approved_at) VALUES($1,$2,$3,1,'confirmed','high',$4,NOW())`,[id,organizationId,f.campaign.id,admin.id])
   await api.excludeRadarCampaignCandidates(f.pool,admin,{organizationId,campaignId:f.campaign.id,candidateIds:[id],requestId:randomUUID()})
   const saved=(await api.listRadarCampaignExclusions(f.pool,admin,{organizationId,campaignId:f.campaign.id}))[0]
   await api.restoreRadarCampaignExclusion(f.pool,admin,{organizationId,campaignId:f.campaign.id,exclusionId:saved.id})
   expect((await f.pool.query('SELECT approved_at FROM public.radar_b2b_reviews WHERE candidate_id=$1',[id])).rows[0].approved_at).toBeNull()
   expect((await f.pool.query('SELECT review_snapshot FROM public.radar_campaign_exclusions WHERE id=$1',[saved.id])).rows[0].review_snapshot.approved_at).toBeTruthy()
   await f.pool.query('UPDATE public.radar_b2b_reviews SET approved_at=NOW(),approved_by=$2 WHERE candidate_id=$1',[id,admin.id])
   await api.restoreRadarCampaignExclusion(f.pool,admin,{organizationId,campaignId:f.campaign.id,exclusionId:saved.id})
   expect((await f.pool.query('SELECT approved_at FROM public.radar_b2b_reviews WHERE candidate_id=$1',[id])).rows[0].approved_at).toBeTruthy()
  }finally{await f.close()}
 })
 it('preserves an in-flight simulated receipt without reinserting an excluded company or reading its site',async()=>{
  const f=await captureFixture()
  try{
   const id=(await f.pool.query(`INSERT INTO public.radar_candidate_records(organization_id,campaign_id,source_type,title,dedupe_key) VALUES($1,$2,'manual','Empresa em pesquisa',$3) RETURNING id`,[organizationId,f.campaign.id,randomUUID()])).rows[0].id
   const run=await startRadarCandidateResearch(f.pool,admin,{organizationId,candidateId:id,configurationRevision:1})
   let reads=0
   await executeRadarCandidateResearch(f.pool,{} as never,{organizationId,runId:run.runId},undefined,{loadSecret:async()=>'synthetic',collect:async()=>{reads++;return[]},web:async()=>{await api.excludeRadarCampaignCandidates(f.pool,admin,{organizationId,campaignId:f.campaign.id,candidateIds:[id],requestId:randomUUID()});return[{url:'https://empresa.example/',title:'Empresa em pesquisa',snippets:['Contato institucional'],observedAt:new Date().toISOString()}]}})
   expect(reads).toBe(0)
   expect((await f.pool.query('SELECT status,normalized_payload FROM public.radar_candidate_records WHERE id=$1',[id])).rows[0]).toMatchObject({status:'discarded',normalized_payload:{}})
   const saved=(await f.pool.query('SELECT calls FROM public.radar_candidate_research_runs WHERE id=$1',[run.runId])).rows[0]
   expect(Object.values(saved.calls)).toContainEqual(expect.objectContaining({status:'completed'}))
  }finally{await f.close()}
 })
 it('retains verified identity after deletion, isolates campaigns, rejects mixed scope atomically and restores explicitly',async()=>{
  expect(api.excludeRadarCampaignCandidates).toBeTypeOf('function')
  const f=await captureFixture()
  try{
   const id=(await f.pool.query(`INSERT INTO public.radar_candidate_records(organization_id,campaign_id,source_type,title,dedupe_key,normalized_payload) VALUES($1,$2,'cnpja_advanced_search','Empresa Energia',$3,'{"cnpj":"37335118000180"}') RETURNING id`,[organizationId,f.campaign.id,randomUUID()])).rows[0].id
   const input={organizationId,campaignId:f.campaign.id,candidateIds:[id],requestId:randomUUID()}
   await expect(api.excludeRadarCampaignCandidates(f.pool,admin,{...input,candidateIds:[id,randomUUID()]})).rejects.toThrow()
   expect((await f.pool.query('SELECT status FROM public.radar_candidate_records WHERE id=$1',[id])).rows[0].status).toBe('pending_review')
   const first=await api.excludeRadarCampaignCandidates(f.pool,admin,input)
   await api.excludeRadarCampaignCandidates(f.pool,admin,input)
   expect(first.items).toHaveLength(1)
   const match={organizationId,campaignId:f.campaign.id,identity:{cnpj:'37335118000180',taxIdVerified:true},criteriaRevision:1}
   expect(await api.isRadarCampaignExcluded(f.pool,match)).toBe(true)
   expect(await api.isRadarCampaignExcluded(f.pool,{...match,criteriaRevision:99})).toBe(true)
   expect(await api.isRadarCampaignExcluded(f.pool,{...match,campaignId:randomUUID()})).toBe(false)
   expect(await api.isRadarCampaignExcluded(f.pool,{...match,identity:{title:'Empresa Energia'}})).toBe(false)
   const saved=await api.listRadarCampaignExclusions(f.pool,admin,{organizationId,campaignId:f.campaign.id})
   expect(JSON.stringify(saved)).not.toMatch(/identity_keys|cnpja|provider|dedupe/)
   await f.pool.query('DELETE FROM public.radar_candidate_records WHERE id=$1',[id])
   expect(await api.isRadarCampaignExcluded(f.pool,match)).toBe(true)
   const mention={schemaVersion:1,name:'Empresa Energia',sourceUrl:'https://empresa.example/',contacts:[],evidenceSpans:[{field:'name',evidenceId:'registry-1',excerpt:'Empresa Energia'}],subjectScope:'establishment',needsVerification:true,location:{city:'Bauru',state:'SP'}}
   const discovered=await admitRadarBusinessMention(f.pool,{organizationId,campaignId:f.campaign.id,revision:1,observationKey:randomUUID(),canPersist:true,mention,verification:{taxId:{value:'37335118000180',subjectName:mention.name,subjectScope:'establishment',sourceRole:'registry',evidenceId:'registry-1',location:mention.location}},registryPolicy:{triage:'compatible',requiredFields:['address'],missingFields:['address'],sourceAllowed:true,budgetApproved:true}} as never)
   expect(discovered).toMatchObject({admission:'outside_profile',newCandidateCount:0,nextAction:'none'})
   await api.restoreRadarCampaignExclusion(f.pool,admin,{organizationId,campaignId:f.campaign.id,exclusionId:saved[0].id})
   expect(await api.isRadarCampaignExcluded(f.pool,match)).toBe(false)
  }finally{await f.close()}
 })
 it('reflects saved semantic exclusions in the existing lot without new discovery or paid effects',async()=>{
  const f=await captureFixture()
  try{
   const candidate=(await f.pool.query(`INSERT INTO public.radar_candidate_records(organization_id,campaign_id,source_type,title,dedupe_key) VALUES($1,$2,'manual','Empresa Alfa',$3) RETURNING id`,[organizationId,f.campaign.id,randomUUID()])).rows[0].id
   const text='Empresa Alfa monta instalações elétricas.',qualification={targetStatus:'not_target',reasons:['Atividade incompatível'],claims:[{reason:'Atividade incompatível',evidenceId:'page-0',excerpt:text}]}
   const run=(await f.pool.query(`INSERT INTO public.radar_candidate_research_runs(organization_id,campaign_id,candidate_id,requested_by,configuration_revision,status,output) VALUES($1,$2,$3,$4,1,'partial',$5::jsonb) RETURNING id`,[organizationId,f.campaign.id,candidate,admin.id,JSON.stringify({siteAssociation:'confirmed',pages:[{text}],qualification})])).rows[0].id
   const op=(await f.pool.query(`INSERT INTO public.radar_capture_operations(organization_id,campaign_id,requested_by,request_id,configuration_revision,requested_count,configuration_snapshot,status,discovery_stopped,funnel_enabled) VALUES($1,$2,$3,$4,1,1,'{}','partial',TRUE,TRUE) RETURNING id`,[organizationId,f.campaign.id,admin.id,randomUUID()])).rows[0].id
   await f.pool.query(`INSERT INTO public.radar_capture_items(organization_id,campaign_id,operation_id,candidate_id,run_id,status,funnel_outcome) VALUES($1,$2,$3,$4,$5,'insufficient','completed_with_gaps')`,[organizationId,f.campaign.id,op,candidate,run])
   const current=await getRadarCaptureOperation(f.pool,admin,organizationId,op)
   expect(current.counts).toMatchObject({admitted:1,outsideProfile:1,completedWithGaps:0,technicalFailures:0})
   expect(Number((await f.pool.query('SELECT queries FROM public.radar_capture_operations WHERE id=$1',[op])).rows[0].queries)).toBe(0)
   await restoreRadarDecisionExclusion(f.pool,admin,candidate)
   const restored=(await listRadarCandidates(f.pool,admin,f.campaign.id)).find(item=>item.id===candidate)!
   expect(restored.normalizedPayload).toMatchObject({targetStatus:'review',semanticReviewOverride:{runId:run}})
   expect(restored.normalizedPayload.decisionExclusion).toEqual({active:false})
  }finally{await f.close()}
 })
})
