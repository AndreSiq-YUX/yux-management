import type pg from 'pg'
import {assessRadarCaptureResearch,assessRadarFunnelResearch,type RadarFunnelOutcome} from './capture-research-state.js'
import {syncRadarFunnelDiscovery} from './funnel-replenishment.js'

type Operation={id?:string;campaign_id?:string;configuration_revision?:number;requested_count:number;discovery_stopped:boolean;discovery_reason?:string|null;blockers:string[];pipeline_version?:number;qualified_count?:number;funnel_enabled?:boolean;historical_closed_at?:unknown}
type Item={status:string;blocker?:string|null;target_status?:string;funnel_outcome?:RadarFunnelOutcome|null}
export function summarizeRadarCaptureItems(op:Operation,items:Item[],discoveryBlockers?:string[]){
 items=items.map(item=>item.funnel_outcome&&item.funnel_outcome!=='technical_failure'?{...item,status:'completed',blocker:null}:item)
 const pending=items.some(item=>['queued','researching'].includes(item.status))
 const achieved=op.pipeline_version===2&&!op.funnel_enabled?op.qualified_count??0:items.length
 const capped=!op.funnel_enabled&&achieved<op.requested_count&&['page_cap','query_cap'].includes(op.discovery_reason??'')
 const discovery=discoveryBlockers??(!op.discovery_stopped?op.blockers:[])
 const blockers=[...new Set([...discovery,...(capped?[op.discovery_reason==='page_cap'?'radar_capture_page_limit':'radar_capture_query_limit']:[]),...items.flatMap(item=>item.blocker?[item.blocker]:[])])]
 const status=discovery.length?'blocked':pending&&op.discovery_stopped?'researching':capped?'blocked':!op.discovery_stopped?'discovering':pending?'researching':items.some(item=>item.status==='blocked')?'blocked':achieved<op.requested_count||op.discovery_reason==='replenishment_shortfall'||items.some(item=>item.status==='insufficient')?'partial':'completed'
 return{status,blockers}
}

// All callers use an existing transaction and acquire campaign before parent.
// No provider I/O, paid replay, discovery or permission bypass happens here.
export async function reconcileRadarCaptureSummary(db:Pick<pg.PoolClient,'query'>,input:{organizationId:string;operationId:string;discoveryBlockers?:string[]}){
 const op=(await db.query<Operation & {id:string;campaign_id:string;configuration_revision:number}>(`SELECT * FROM public.radar_capture_operations WHERE id=$1 AND organization_id=$2 FOR UPDATE`,[input.operationId,input.organizationId])).rows[0]
 if(!op||op.historical_closed_at)return
 if(op.funnel_enabled&&!(input.discoveryBlockers??[]).length)await syncRadarFunnelDiscovery(db,op as any)
 if(op.pipeline_version===2)op.qualified_count=Number((await db.query(`SELECT COUNT(*) AS n FROM public.radar_capture_items item JOIN public.radar_b2b_reviews review ON review.candidate_id=item.candidate_id AND review.organization_id=item.organization_id AND review.configuration_revision=$3 WHERE item.operation_id=$1 AND item.organization_id=$2 AND item.is_new=TRUE AND review.target_status='confirmed'`,[op.id,input.organizationId,op.configuration_revision])).rows[0].n)
 const items=op.pipeline_version===2&&!op.funnel_enabled?(await db.query<Item>(`SELECT item.status,item.blocker,item.funnel_outcome FROM public.radar_capture_items item LEFT JOIN public.radar_b2b_reviews review ON review.candidate_id=item.candidate_id AND review.organization_id=item.organization_id AND review.configuration_revision=$3 WHERE item.operation_id=$1 AND item.organization_id=$2 AND review.target_status IS DISTINCT FROM 'not_target'`,[op.id,input.organizationId,op.configuration_revision])).rows:(await db.query<Item>('SELECT status,blocker,funnel_outcome FROM public.radar_capture_items WHERE operation_id=$1 AND organization_id=$2',[op.id,input.organizationId])).rows
 const summary=summarizeRadarCaptureItems(op,items,input.discoveryBlockers)
 // A historical partial batch must not become a second active batch. Its
 // counters/blockers still track current evidence while the current lot owns
 // the campaign's active slot (unique index radar_capture_active_idx).
 const other=(await db.query(`SELECT id FROM public.radar_capture_operations WHERE campaign_id=$1 AND organization_id=$2 AND configuration_revision=$3 AND id<>$4 AND status IN ('queued','discovering','researching','blocked') LIMIT 1`,[op.campaign_id,input.organizationId,op.configuration_revision,op.id])).rows[0]
 const status=other&&['discovering','researching','blocked'].includes(summary.status)?'partial':summary.status
 await db.query('UPDATE public.radar_capture_operations SET status=$3,blockers=$4,updated_at=NOW() WHERE id=$1 AND organization_id=$2',[op.id,input.organizationId,status,JSON.stringify(summary.blockers)])
 const pending=(await db.query(`SELECT EXISTS(SELECT 1 FROM public.radar_capture_items item JOIN public.radar_candidate_research_runs run ON run.id=item.run_id AND run.organization_id=item.organization_id WHERE item.operation_id=$1 AND item.organization_id=$2 AND item.status IN ('queued','researching') AND run.status IN ('queued','running')) AS pending`,[op.id,input.organizationId])).rows[0]?.pending
 if(pending||!op.discovery_stopped&&!summary.blockers.length){
  await db.query('INSERT INTO public.radar_capture_outbox(operation_id,organization_id,campaign_id) VALUES($1,$2,$3) ON CONFLICT(operation_id) DO UPDATE SET next_dispatch_at=LEAST(radar_capture_outbox.next_dispatch_at,NOW())',[op.id,input.organizationId,op.campaign_id])
 }else await db.query('DELETE FROM public.radar_capture_outbox WHERE operation_id=$1 AND organization_id=$2',[op.id,input.organizationId])
}

export async function reconcileRadarCaptureItems(db:Pick<pg.PoolClient,'query'>,input:{organizationId:string;candidateId:string;runId?:string;deliveryFailedRunId?:string}):Promise<void>{
 const parents=(await db.query<{campaign_id:string}>(`SELECT DISTINCT campaign_id FROM public.radar_capture_items WHERE organization_id=$1 AND candidate_id=$2 ORDER BY campaign_id`,[input.organizationId,input.candidateId])).rows
 for(const parent of parents){
  await db.query('SELECT id FROM public.radar_campaigns WHERE id=$1 AND organization_id=$2 FOR UPDATE',[parent.campaign_id,input.organizationId])
  const operations=(await db.query<Operation & {id:string;configuration_revision:number}>(`SELECT operation.* FROM public.radar_capture_operations operation JOIN public.radar_capture_items item ON item.operation_id=operation.id AND item.organization_id=operation.organization_id WHERE item.organization_id=$1 AND item.candidate_id=$2 AND item.campaign_id=$3 ORDER BY operation.id FOR UPDATE OF operation`,[input.organizationId,input.candidateId,parent.campaign_id])).rows
  const discarded=(await db.query("SELECT status FROM public.radar_candidate_records WHERE id=$1 AND organization_id=$2",[input.candidateId,input.organizationId])).rows[0]?.status==='discarded'
  for(const op of operations){
   if(op.historical_closed_at)continue
   const latest=(await db.query(`SELECT * FROM public.radar_candidate_research_runs WHERE organization_id=$1 AND candidate_id=$2 AND campaign_id=$3 AND configuration_revision=$4 ORDER BY created_at DESC,id DESC LIMIT 1`,[input.organizationId,input.candidateId,parent.campaign_id,op.configuration_revision])).rows[0]
   if(!latest||input.runId&&latest.id!==input.runId)continue
   const previous=(await db.query<Item>('SELECT status,blocker FROM public.radar_capture_items WHERE operation_id=$1 AND organization_id=$2',[op.id,input.organizationId])).rows
   const childReasons=new Set(previous.flatMap(item=>item.blocker?[item.blocker]:[]))
   const discoveryBlockers=!op.discovery_stopped?op.blockers.filter(code=>!childReasons.has(code)):undefined
    const funnel=discarded?{outcome:'out_of_profile' as const,retryable:false}:assessRadarFunnelResearch(latest),outcome=funnel.outcome
    const assessment=op.funnel_enabled?{status:outcome==='technical_failure'?'blocked':outcome==='completed_with_gaps'?'insufficient':outcome===null?'researching':'completed',reason:funnel.reason}:assessRadarCaptureResearch(latest)
   const deliveryFailure=latest.status==='queued'&&latest.id===input.deliveryFailedRunId
   await db.query('UPDATE public.radar_capture_items SET run_id=$4,status=$5,blocker=$6,funnel_outcome=$7 WHERE operation_id=$1 AND organization_id=$2 AND candidate_id=$3',[op.id,input.organizationId,input.candidateId,latest.id,assessment.status,deliveryFailure?'radar_capture_queue_unavailable':assessment.status==='blocked'?assessment.reason??'radar_capture_item_requires_review':null,deliveryFailure?'technical_failure':outcome])
   await reconcileRadarCaptureSummary(db,{organizationId:input.organizationId,operationId:op.id,discoveryBlockers})
  }
 }
}
