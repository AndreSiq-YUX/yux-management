import {describe,expect,it} from 'vitest'
import {randomUUID} from 'node:crypto'
import {captureFixture,connectionString,admin,organizationId,available,company} from '../support/radar-capture-fixture.js'
import {startRadarCaptureOperation,getRadarCaptureOperation} from '../../src/modules/radar/capture-operation.js'
import {advanceRadarCaptureDiscovery} from '../../src/modules/radar/capture-discovery.js'
import {startRadarCandidateResearch,executeRadarCandidateResearch} from '../../src/modules/radar/research-service.js'
import {assessRadarCaptureResearch} from '../../src/modules/radar/capture-research-state.js'

const api=await import('../../src/modules/radar/capture-reconciliation.js').catch(()=>({})) as Record<string,any>
describe.skipIf(!connectionString)('transactional capture reconciliation',()=>{
 it('repairs 1/8/11 after four individual updates, ignores old events and another tenant, and rolls back atomically',async()=>{
  expect(api.reconcileRadarCaptureItems).toBeTypeOf('function')
  const f=await captureFixture()
  try{
   const op=await startRadarCaptureOperation(f.pool,admin,{organizationId,campaignId:f.campaign.id,configurationRevision:1,requestId:randomUUID(),requestedCount:20},{availability:available})
   await advanceRadarCaptureDiscovery(f.pool,{} as never,{organizationId,operationId:op.operationId},{availability:available,searchPage:async()=>({candidates:Array.from({length:20},company)}),loadSecret:async()=>'fixture'})
   const items=(await getRadarCaptureOperation(f.pool,admin,organizationId,op.operationId)).items
   for(const [index,item]of items.entries()){
    const run=await startRadarCandidateResearch(f.pool,admin,{organizationId,candidateId:item.candidateId,configurationRevision:1})
    const status=index===0?'completed':index<9?'insufficient':'blocked'
    const output=index===0?{siteAssociation:'confirmed',quality:{readyForReview:true}}:{siteAssociation:'review'}
    await f.pool.query("UPDATE public.radar_candidate_research_runs SET status='partial',output=$2,calls=$3 WHERE id=$1",[run.runId,JSON.stringify(output),JSON.stringify(index>=9?{semantic:{status:'uncertain'}}:{})])
    await f.pool.query('UPDATE public.radar_capture_items SET run_id=$2,status=$3,blocker=$4 WHERE id=$1',[item.id,run.runId,status,status==='blocked'?'radar_research_call_uncertain':null])
   }
   await f.pool.query("UPDATE public.radar_capture_operations SET status='blocked' WHERE id=$1",[op.operationId])
   const before=await getRadarCaptureOperation(f.pool,admin,organizationId,op.operationId)
   expect(before.counts).toMatchObject({completed:1,insufficient:8,blocked:11})
   const transact=async(candidateId:string,runId?:string,rollback=false,org:string=organizationId)=>{
    const client=await f.pool.connect()
    try{await client.query('BEGIN');await api.reconcileRadarCaptureItems(client,{organizationId:org,candidateId,runId});await client.query(rollback?'ROLLBACK':'COMMIT')}finally{client.release()}
   }
   const selected=[...items.slice(1,3),...items.slice(9,11)]
   for(const item of selected){
    const runId=before.items.find(i=>i.id===item.id)!.runId
    await f.pool.query("UPDATE public.radar_candidate_research_runs SET status='succeeded',output=$2,calls='{}' WHERE id=$1",[runId,JSON.stringify({siteAssociation:'confirmed',quality:{readyForReview:true}})])
    await transact(item.candidateId,runId!,true)
    expect((await getRadarCaptureOperation(f.pool,admin,organizationId,op.operationId)).items.find(i=>i.id===item.id)?.status).not.toBe('completed')
    await transact(item.candidateId,runId!)
    await transact(item.candidateId,runId!)
   }
   const after=await getRadarCaptureOperation(f.pool,admin,organizationId,op.operationId)
   expect(after.counts).toMatchObject({completed:5,insufficient:6,blocked:9,researching:0})
   expect(after.blockers).toContain('radar_research_call_uncertain')
   const item=selected[0],oldId=after.items.find(i=>i.id===item.id)!.runId
   const newer=await startRadarCandidateResearch(f.pool,admin,{organizationId,candidateId:item.candidateId,configurationRevision:1,requestId:randomUUID(),operation:'refresh'})
   expect((await getRadarCaptureOperation(f.pool,admin,organizationId,op.operationId)).items.find(i=>i.id===item.id)).toMatchObject({runId:newer.runId,status:'researching'})
   await transact(item.candidateId,oldId!)
   await transact(item.candidateId,newer.runId,false,'10000000-0000-4000-8000-000000000099')
   expect((await getRadarCaptureOperation(f.pool,admin,organizationId,op.operationId)).items.find(i=>i.id===item.id)).toMatchObject({runId:newer.runId,status:'researching'})
   const oldRevision=await f.pool.query(`INSERT INTO public.radar_capture_operations(organization_id,campaign_id,requested_by,request_id,configuration_revision,requested_count,configuration_snapshot,status,discovery_stopped,discovery_reason) VALUES($1,$2,$3,$4,2,1,'{}','partial',TRUE,'target_reached') RETURNING id`,[organizationId,f.campaign.id,admin.id,randomUUID()])
   await f.pool.query("INSERT INTO public.radar_capture_items(organization_id,campaign_id,operation_id,candidate_id,run_id,status) VALUES($1,$2,$3,$4,$5,'insufficient')",[organizationId,f.campaign.id,oldRevision.rows[0].id,item.candidateId,oldId])
   await transact(item.candidateId,newer.runId)
   expect((await getRadarCaptureOperation(f.pool,admin,organizationId,oldRevision.rows[0].id)).items[0]).toMatchObject({runId:oldId,status:'insufficient'})
   const historical=(await f.pool.query(`INSERT INTO public.radar_capture_operations(organization_id,campaign_id,requested_by,request_id,configuration_revision,requested_count,configuration_snapshot,status,discovery_stopped,discovery_reason) VALUES($1,$2,$3,$4,1,1,'{}','partial',TRUE,'target_reached') RETURNING id`,[organizationId,f.campaign.id,admin.id,randomUUID()])).rows[0]
   await f.pool.query("INSERT INTO public.radar_capture_items(organization_id,campaign_id,operation_id,candidate_id,run_id,status) VALUES($1,$2,$3,$4,$5,'insufficient')",[organizationId,f.campaign.id,historical.id,item.candidateId,oldId])
   await Promise.all([transact(item.candidateId,newer.runId),transact(item.candidateId,newer.runId)])
   const history=await getRadarCaptureOperation(f.pool,admin,organizationId,historical.id)
   expect(history.items[0]).toMatchObject({runId:newer.runId,status:'researching'})
   expect(history.status).toBe('partial')
  }finally{await f.close()}
 })
 it('publishes checkpoint, final result and failure through the real individual worker without resuming the parent',async()=>{
  const f=await captureFixture()
  try{
   const op=await startRadarCaptureOperation(f.pool,admin,{organizationId,campaignId:f.campaign.id,configurationRevision:1,requestId:randomUUID(),requestedCount:1},{availability:available})
   const prospect=company()
   await advanceRadarCaptureDiscovery(f.pool,{} as never,{organizationId,operationId:op.operationId},{availability:available,searchPage:async()=>({candidates:[prospect]}),loadSecret:async()=>'fixture'})
   const item=(await getRadarCaptureOperation(f.pool,admin,organizationId,op.operationId)).items[0]
   const run=await startRadarCandidateResearch(f.pool,admin,{organizationId,candidateId:item.candidateId,configurationRevision:1})
   const pages=[{url:'https://empresa.example/',text:`Empresa sintética LTDA CNPJ ${prospect.taxId}. Contato compras@empresa.example Telefone (41) 3333-4444`,html:'<a href="mailto:compras@empresa.example">Compras</a><a href="tel:+554133334444">Telefone</a>',observedAt:'2026-10-19T12:00:00Z'}]
   await f.pool.query('UPDATE public.radar_candidate_research_runs SET output=$2 WHERE id=$1',[run.runId,JSON.stringify({pages,readingComplete:false,readerVersion:4,discoveryLocked:true,discovery:{association:'confirmed',websiteUrl:pages[0].url,hits:[],suggestions:[],limitations:[],queries:1}})])
   let checkpoints=0
   const collect=async()=>{
    const progress=await getRadarCaptureOperation(f.pool,admin,organizationId,op.operationId)
    expect(progress.items[0].runId).toBe(run.runId)
    expect(progress.counts.researching).toBe(1);checkpoints++
    return pages
   }
   const noSearch=async()=>{throw Error('unexpected_provider_call')}
   await executeRadarCandidateResearch(f.pool,{} as never,{organizationId,runId:run.runId},undefined,{collect,web:noSearch,local:noSearch,loadSecret:async()=>'fixture'})
   const stored=(await f.pool.query('SELECT * FROM public.radar_candidate_research_runs WHERE id=$1',[run.runId])).rows[0]
   expect(stored.stage).toBe('review')
   const parent=await getRadarCaptureOperation(f.pool,admin,organizationId,op.operationId)
   expect(parent.items[0].status).toBe(assessRadarCaptureResearch(stored).status)
   expect(parent.counts.researching).toBe(0)
   expect(checkpoints).toBeGreaterThan(0)
   const refresh=await startRadarCandidateResearch(f.pool,admin,{organizationId,candidateId:item.candidateId,configurationRevision:1,requestId:randomUUID(),operation:'refresh'})
   await f.pool.query("UPDATE public.radar_campaigns SET status='paused' WHERE id=$1",[f.campaign.id])
   await executeRadarCandidateResearch(f.pool,{} as never,{organizationId,runId:refresh.runId},undefined,{web:noSearch,local:noSearch})
   expect((await getRadarCaptureOperation(f.pool,admin,organizationId,op.operationId)).items[0]).toMatchObject({runId:refresh.runId,status:'blocked',blocker:'radar_campaign_or_candidate_inactive'})
  }finally{await f.close()}
 })
})
