import {describe,expect,it} from 'vitest'
import {randomUUID} from 'node:crypto'
import {captureFixture,connectionString,admin,organizationId,available,company} from '../support/radar-capture-fixture.js'
import {startRadarCaptureOperation,getRadarCaptureOperation} from '../../src/modules/radar/capture-operation.js'
import {advanceRadarCaptureDiscovery} from '../../src/modules/radar/capture-discovery.js'
import {startRadarCandidateResearch} from '../../src/modules/radar/research-service.js'
import {reconcileRadarCaptureItems} from '../../src/modules/radar/capture-reconciliation.js'

describe.skipIf(!connectionString)('durable funnel outcomes and event audience',()=>{
 it('ends a real lot with explained gaps, preserves its old run status, and limits event access to system admin',async()=>{
  const f=await captureFixture()
  try{
   const operation=await startRadarCaptureOperation(f.pool,admin,{organizationId,campaignId:f.campaign.id,configurationRevision:1,requestId:randomUUID(),requestedCount:1},{availability:available})
   await advanceRadarCaptureDiscovery(f.pool,{} as never,{organizationId,operationId:operation.operationId},{availability:available,searchPage:async()=>({candidates:[company()]}),loadSecret:async()=>'fixture'})
   const item=(await getRadarCaptureOperation(f.pool,admin,organizationId,operation.operationId)).items[0]
   const run=await startRadarCandidateResearch(f.pool,admin,{organizationId,candidateId:item.candidateId,configurationRevision:1})
   await f.pool.query("UPDATE public.radar_candidate_research_runs SET status='partial',output=$2 WHERE id=$1",[run.runId,JSON.stringify({siteAssociation:'review',limitations:['radar_qualification_waiting_identity']})])
   const client=await f.pool.connect()
   try{
    await client.query('BEGIN')
    await reconcileRadarCaptureItems(client,{organizationId,candidateId:item.candidateId,runId:run.runId})
    await client.query('COMMIT')
    const result=await getRadarCaptureOperation(f.pool,admin,organizationId,operation.operationId)
    expect(result).toMatchObject({status:'completed',counts:{completedWithGaps:1,technicalFailures:0},items:[{status:'insufficient',outcome:'completed_with_gaps'}]})
    expect((await f.pool.query('SELECT status FROM public.radar_candidate_research_runs WHERE id=$1',[run.runId])).rows[0].status).toBe('partial')
    await f.pool.query(`INSERT INTO public.radar_funnel_events(organization_id,campaign_id,candidate_id,run_id,configuration_revision,gate,mode,outcome,event_key) VALUES($1,$2,$3,$4,1,'g1','shadow','plausible_needs_evidence','fixture')`,[organizationId,f.campaign.id,item.candidateId,run.runId])
    for(const role of ['yux_admin','yux_operator','client_admin','client_member']){
     await client.query('BEGIN');await client.query('SET LOCAL ROLE yux_api')
     await client.query("SELECT set_config('app.current_role',$1,true),set_config('app.current_orgs',$2,true)",[role,`{${organizationId}}`])
     const events=await client.query('SELECT id FROM public.radar_funnel_events WHERE campaign_id=$1',[f.campaign.id])
     expect(events.rows).toHaveLength(role==='yux_admin'?1:0)
     await client.query('ROLLBACK')
    }
    await client.query('BEGIN');await client.query('SET LOCAL ROLE yux_api')
    await client.query("SELECT set_config('app.current_role','yux_admin',true)")
    await expect(client.query('DELETE FROM public.radar_funnel_events WHERE campaign_id=$1',[f.campaign.id])).rejects.toMatchObject({code:'42501'})
    await client.query('ROLLBACK')
   }finally{await client.query('ROLLBACK');client.release()}
  }finally{await f.close()}
 },30000)
})
