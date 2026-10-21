import {describe,expect,it,vi} from 'vitest'
import {randomUUID} from 'node:crypto'
import {captureFixture,connectionString,admin,organizationId,available,company} from '../support/radar-capture-fixture.js'
import {startRadarCaptureOperation,getRadarCaptureOperation} from '../../src/modules/radar/capture-operation.js'
import {advanceRadarCaptureDiscovery} from '../../src/modules/radar/capture-discovery.js'
import {dispatchRadarCaptureOperation} from '../../src/modules/radar/capture-dispatch.js'
import {startRadarCandidateResearch} from '../../src/modules/radar/research-service.js'

describe.skipIf(!connectionString)('configured registry admission gate',()=>{
 it('waits for final fit, then drains paid overflow before enforcing the extra-page cap',async()=>{
  const f=await captureFixture();try{
   const current=(await f.pool.query('SELECT search_configuration FROM radar_campaigns WHERE id=$1',[f.campaign.id])).rows[0].search_configuration;
   await f.pool.query('UPDATE radar_campaigns SET search_configuration=$2 WHERE id=$1',[f.campaign.id,JSON.stringify({...current,funnel:{enabled:true,g0:{mode:'off'},g1:{mode:'off'}},batch:{...current.batch,minPassRatio:1,replenishmentBasis:'final_fit',maxReplenishmentPages:0}})]);
   const operation=await startRadarCaptureOperation(f.pool,admin,{organizationId,campaignId:f.campaign.id,configurationRevision:1,requestId:randomUUID(),requestedCount:2},{availability:available});
   const searchPage=vi.fn(async()=>({candidates:[company(),company(),company()]}));
   const advance=()=>advanceRadarCaptureDiscovery(f.pool,{} as never,{organizationId,operationId:operation.operationId},{availability:available,searchPage,loadSecret:async()=>'fixture'});
   await advance();await advance();
   let saved=await getRadarCaptureOperation(f.pool,admin,organizationId,operation.operationId);
   expect(saved.counts.admitted).toBe(2);
   await f.pool.query(`UPDATE radar_capture_items SET funnel_outcome='completed_with_gaps',status='insufficient' WHERE operation_id=$1`,[operation.operationId]);
   const first=saved.items[0].candidateId;
   await f.pool.query(`INSERT INTO radar_b2b_reviews(organization_id,campaign_id,candidate_id,configuration_revision,target_status,product_fit,verification_method) VALUES($1,$2,$3,1,'confirmed','high','manual')`,[organizationId,f.campaign.id,first]);
   await advance();saved=await getRadarCaptureOperation(f.pool,admin,organizationId,operation.operationId);
   expect(saved.counts.admitted).toBe(3);expect(searchPage).toHaveBeenCalledTimes(1);
   await f.pool.query(`UPDATE radar_capture_items SET funnel_outcome='completed_with_gaps',status='insufficient' WHERE operation_id=$1`,[operation.operationId]);
   await advance();saved=await getRadarCaptureOperation(f.pool,admin,organizationId,operation.operationId);
   expect(saved.discoveryReason).toBe('replenishment_shortfall');expect(searchPage).toHaveBeenCalledTimes(1);
  }finally{await f.close()}
 },30000)
 it('uses already paid overflow for replenishment even when no extra discovery pages are authorized',async()=>{
  const f=await captureFixture()
  try{
   const current=(await f.pool.query('SELECT search_configuration FROM public.radar_campaigns WHERE id=$1',[f.campaign.id])).rows[0].search_configuration
   await f.pool.query('UPDATE public.radar_campaigns SET search_configuration=$2 WHERE id=$1',[f.campaign.id,JSON.stringify({...current,funnel:{enabled:true,g0:{mode:'enforce'}},batch:{...current.batch,minPassRatio:1,maxReplenishmentPages:0},qualification:{...current.qualification,registry:{blockedNameTerms:['excluida']}}})])
   const operation=await startRadarCaptureOperation(f.pool,admin,{organizationId,campaignId:f.campaign.id,configurationRevision:1,requestId:randomUUID(),requestedCount:2},{availability:available})
   const searchPage=vi.fn(async()=>({candidates:[{...company(),tradeName:'Excluida'},company(),company()]}))
   await advanceRadarCaptureDiscovery(f.pool,{} as never,{organizationId,operationId:operation.operationId},{availability:available,searchPage,loadSecret:async()=>'fixture'})
   await advanceRadarCaptureDiscovery(f.pool,{} as never,{organizationId,operationId:operation.operationId},{availability:available,searchPage,loadSecret:async()=>'fixture'})
   expect((await getRadarCaptureOperation(f.pool,admin,organizationId,operation.operationId)).counts).toMatchObject({requested:2,admitted:3,passedInitialTriage:2,outsideProfile:1})
   expect(searchPage).toHaveBeenCalledTimes(1)
  }finally{await f.close()}
 },30000)
 it('keeps an excluded company visible without dispatching research or hiding its cost-free reason',async()=>{
  const f=await captureFixture()
  try{
   const current=(await f.pool.query('SELECT search_configuration FROM public.radar_campaigns WHERE id=$1',[f.campaign.id])).rows[0].search_configuration
   await f.pool.query('UPDATE public.radar_campaigns SET search_configuration=$2,target_cnaes=$3 WHERE id=$1',[f.campaign.id,JSON.stringify({...current,funnel:{enabled:true,g0:{mode:'enforce'}},qualification:{...current.qualification,registry:{blockedMainCnaes:['4729601']}}}),['5620101']])
   const operation=await startRadarCaptureOperation(f.pool,admin,{organizationId,campaignId:f.campaign.id,configurationRevision:1,requestId:randomUUID(),requestedCount:2},{availability:available})
   const rejected={...company(),activities:[{code:'4729601',text:'Tabacaria',main:true}],tradeName:'Não é o público da campanha'}
   const accepted={...company(),activities:[{code:'5620101',text:'Fornecimento para empresas',main:true}]}
   await advanceRadarCaptureDiscovery(f.pool,{} as never,{organizationId,operationId:operation.operationId},{availability:available,searchPage:async()=>({candidates:[rejected,accepted]}),loadSecret:async()=>'fixture'})
   const before=await getRadarCaptureOperation(f.pool,admin,organizationId,operation.operationId)
   expect(before.counts).toMatchObject({admitted:2,outsideProfile:1,passedInitialTriage:1})
   const excluded=before.items.find(item=>item.outcome==='out_of_profile')!
   expect(excluded).toMatchObject({status:'completed',runId:null})
   const start=vi.fn(startRadarCandidateResearch),queue={add:vi.fn()}
   await dispatchRadarCaptureOperation(f.pool,{} as never,{organizationId,operationId:operation.operationId},queue,undefined,{availability:available,startResearch:start})
   expect(start).toHaveBeenCalledTimes(1)
   expect(start.mock.calls[0][2].candidateId).not.toBe(excluded.candidateId)
   const events=(await f.pool.query('SELECT gate,outcome FROM public.radar_funnel_events WHERE campaign_id=$1',[f.campaign.id])).rows
   expect(events).toContainEqual({gate:'g0',outcome:'block'})
  }finally{await f.close()}
 },30000)
})
