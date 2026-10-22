import {randomUUID} from 'node:crypto'
import {describe,it,expect,vi} from 'vitest'
import {captureFixture,connectionString,admin,organizationId,available,company} from '../support/radar-capture-fixture.js'
import {startRadarCaptureOperation,getRadarCaptureOperation} from '../../src/modules/radar/capture-operation.js'
import {advanceRadarCaptureDiscovery} from '../../src/modules/radar/capture-discovery.js'
import {resumeRadarCaptureOperation,dispatchRadarCaptureOperation} from '../../src/modules/radar/capture-dispatch.js'
import {discardRadarCandidate} from '../../src/modules/radar/repository.js'
import {restoreRadarDecisionExclusion} from '../../src/modules/radar/decision-review.js'

describe.skipIf(!connectionString)('same ten-company recovery with real PostgreSQL',()=>{
 it('accounts for an explicit reversible human discard without erasing the blocked run or its paid receipt',async()=>{
  const f=await captureFixture();
  try{
   const op=await startRadarCaptureOperation(f.pool,admin,{organizationId,campaignId:f.campaign.id,configurationRevision:1,requestId:randomUUID(),requestedCount:1},{availability:available});
   await advanceRadarCaptureDiscovery(f.pool,{} as never,{organizationId,operationId:op.operationId},{availability:available,loadSecret:async()=>'fixture',searchPage:async()=>({candidates:[company()]})});
   const item=(await getRadarCaptureOperation(f.pool,admin,organizationId,op.operationId)).items[0];
   const calls={presence:{status:'received_invalid',effectReceiptId:'immutable-paid-receipt',actualUsd:'0.001',billingOutcome:'known'}};
   const run=(await f.pool.query(`INSERT INTO public.radar_candidate_research_runs(organization_id,campaign_id,candidate_id,requested_by,configuration_revision,status,error_code,output,calls) VALUES($1,$2,$3,$4,1,'blocked','radar_presence_unverifiable','{"funnel":{}}',$5) RETURNING id`,[organizationId,f.campaign.id,item.candidateId,admin.id,JSON.stringify(calls)])).rows[0];
   await f.pool.query("UPDATE public.radar_capture_items SET run_id=$2,status='blocked',funnel_outcome='technical_failure' WHERE id=$1",[item.id,run.id]);
   await f.pool.query("UPDATE public.radar_capture_operations SET funnel_enabled=TRUE,status='blocked' WHERE id=$1",[op.operationId]);
   await discardRadarCandidate(f.pool,admin,item.candidateId);
   const excluded=await getRadarCaptureOperation(f.pool,admin,organizationId,op.operationId);
   expect(excluded.counts).toMatchObject({outsideProfile:1,technicalFailures:0});
   expect((await f.pool.query('SELECT status,calls FROM public.radar_candidate_research_runs WHERE id=$1',[run.id])).rows[0]).toEqual({status:'blocked',calls});
   await restoreRadarDecisionExclusion(f.pool,admin,item.candidateId);
   expect((await f.pool.query('SELECT status FROM public.radar_candidate_records WHERE id=$1',[item.candidateId])).rows[0].status).toBe('pending_review');
   expect((await getRadarCaptureOperation(f.pool,admin,organizationId,op.operationId)).counts.technicalFailures).toBe(1);
  }finally{await f.close()}
 });
 it('recovers 2 old completions, 5 gaps, 2 paid invalid replies and 1 TLS restriction, without rediscovery or duplicated rounds',async()=>{
  const f=await captureFixture();
  try{
   await f.pool.query(`UPDATE public.radar_campaigns SET search_configuration=jsonb_set(jsonb_set(search_configuration,'{batch,maxPagesPerScope}','10'),'{batch,maxQueriesPerBatch}','10') WHERE id=$1`,[f.campaign.id]);
   const start=await startRadarCaptureOperation(f.pool,admin,{organizationId,campaignId:f.campaign.id,configurationRevision:1,requestId:randomUUID(),requestedCount:10},{availability:available});
   const input={organizationId,operationId:start.operationId};
   for(let i=0;i<7;i++)await advanceRadarCaptureDiscovery(f.pool,{} as never,input,{availability:available,loadSecret:async()=>'fixture',searchPage:async()=>({candidates:Array.from({length:i===6?4:1},()=>company()),nextToken:'synthetic-page-'+i})});
   const original=await getRadarCaptureOperation(f.pool,admin,organizationId,start.operationId);
   expect(original.queries).toBe(7);expect(original.items).toHaveLength(10);
   await f.pool.query(`UPDATE public.radar_campaigns SET search_configuration=jsonb_set(jsonb_set(search_configuration,'{funnel,enabled}','true'),'{research,semanticQualificationEnabled}','true') WHERE id=$1`,[f.campaign.id]);
   await f.pool.query("UPDATE public.radar_capture_operations SET funnel_enabled=TRUE,status='blocked' WHERE id=$1",[start.operationId]);
   const runs:string[]=[],snapshots:unknown[]=[];
   for(const [index,item]of original.items.entries()){
    const output={funnel:{fit:{reasonCode:'decision_limit_reached'},agentCompleted:index>=2,decisionCalls:6},quality:{readyForReview:index<2},qualification:index<2?{targetStatus:'review',productFit:'possible'}:undefined};
    const calls={...Object.fromEntries(Array.from({length:6},(_,i)=>['decision'+i,{source:'openrouter_decision',status:'completed',requestId:item.id+'-d'+i}])),agent:{source:'perplexity_agent',status:'completed',requestId:item.id+'-paid-agent'},...(index===7||index===8?{presence:{source:'radar_presence_resolution',status:'received_invalid',effectReceiptId:item.id+'-protected',actualUsd:'0.001',billingOutcome:'known'}}:{})};
    const run=(await f.pool.query(`INSERT INTO public.radar_candidate_research_runs(organization_id,campaign_id,candidate_id,requested_by,configuration_revision,request_id,status,output,calls,error_code) VALUES($1,$2,$3,$4,1,$5,$6,$7,$8,$9) RETURNING id`,[organizationId,f.campaign.id,item.candidateId,admin.id,item.id,index<2?'succeeded':index<7?'partial':'blocked',JSON.stringify(output),JSON.stringify(calls),index===9?'radar_tls_approval_required':null])).rows[0];
    runs.push(run.id);snapshots.push(calls);
    await f.pool.query('UPDATE public.radar_capture_items SET run_id=$2,status=$3,funnel_outcome=$4 WHERE id=$1',[item.id,run.id,index<2?'completed':index<7?'insufficient':'blocked',index<2?'completed':index<7?'completed_with_gaps':'technical_failure']);
   }
   const requestId=randomUUID(),resume={...input,configurationRevision:1,requestId,allowSemanticRefresh:true};
   await Promise.all([1,2].map(()=>resumeRadarCaptureOperation(f.pool,admin,resume,{availability:available})));
   const queued=(await f.pool.query('SELECT * FROM public.radar_capture_items WHERE operation_id=$1 ORDER BY id',[start.operationId])).rows;
   expect(queued.every(item=>item.status==='queued')).toBe(true);
   expect(queued.every(item=>item.dispatch_generation===1)).toBe(true);
   const queue={add:vi.fn(async()=>({id:'synthetic-job'}))},discover=vi.fn();
   await dispatchRadarCaptureOperation(f.pool,{} as never,input,queue,undefined,{availability:available,discover});
   expect(discover).not.toHaveBeenCalled();expect(queue.add).toHaveBeenCalledTimes(10);
   const recovered=(await f.pool.query('SELECT * FROM public.radar_candidate_research_runs WHERE id=ANY($1::uuid[]) ORDER BY id',[runs])).rows;
   expect(recovered).toHaveLength(10);
   for(const run of recovered){
    expect(run.status).toBe('queued');expect(run.output.funnel.decisionRound).toBe(1);
    expect(run.output.funnel.decisionRecoveryRequestId).toBe(requestId);
    const before=snapshots[runs.indexOf(run.id)] as Record<string,unknown>;
    for(const [key,call]of Object.entries(before))expect(run.calls[key]).toEqual(call);
   }
   const after=await getRadarCaptureOperation(f.pool,admin,organizationId,start.operationId);
   expect(after.queries).toBe(7);expect(after.discoveryStopped).toBe(true);
   expect(after.items.map(item=>item.candidateId).sort()).toEqual(original.items.map(item=>item.candidateId).sort());
   expect(after.items.map(item=>item.runId).sort()).toEqual([...runs].sort());
   expect(Number((await f.pool.query('SELECT COUNT(*) AS n FROM public.radar_capture_operations WHERE campaign_id=$1',[f.campaign.id])).rows[0].n)).toBe(1);
  }finally{await f.close()}
 });
});
