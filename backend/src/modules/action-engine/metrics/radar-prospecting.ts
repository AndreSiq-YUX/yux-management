import type { PackMetricCollector,PackMetricSnapshot } from './collector.js'
type RadarMetricCounts={requested:number;found:number;complete:number;pending:number;blocked:number;partial:number;operations:number}
export function deriveRadarProspectingMetrics(counts:RadarMetricCounts):PackMetricSnapshot {
 const known=(n:number)=>({kind:'known' as const,value:String(n) as `${number}`,unit:'count'})
 return{packKey:'radar_prospecting',measuredAt:new Date().toISOString(),
  metrics:{companies_requested:known(counts.requested),companies_found:known(counts.found),research_completed:known(counts.complete),
   operations_pending:known(counts.pending),operations_blocked:known(counts.blocked),operations_partial:known(counts.partial),
   attributed_revenue_brl:{kind:'not_applicable',reason:'research_is_not_revenue',unit:'BRL'}},
  evidence:{research_completed:{sourceType:'radar_operation_links'}},
  signals:{criticalGuardrailBreached:false,killSwitchActive:false,minimumSampleReached:counts.operations>0&&counts.complete>0,
   offTrack:counts.partial>0,requiredMetricUnknownIsBlocking:!counts.operations||counts.pending>0||counts.blocked>0,
   reasons:counts.blocked?['radar_research_needs_action']:counts.pending?['radar_research_pending']:counts.partial?['radar_research_partial']:[]}}
}
export const radarProspectingMetricCollector:PackMetricCollector={
 packKey:'radar_prospecting',
 async collect(client,mission){
  const rows=(await client.query<Record<string,string|number>>(
   `WITH linked AS(SELECT DISTINCT operation_type,operation_id FROM public.action_radar_operation_links WHERE organization_id=$1 AND mission_id=$2),
    states AS(
     SELECT op.status,op.requested_count AS requested,
       (SELECT COUNT(*) FROM public.radar_capture_items item WHERE item.operation_id=op.id AND item.organization_id=$1) AS found,
       (SELECT COUNT(*) FROM public.radar_capture_items item WHERE item.operation_id=op.id AND item.organization_id=$1 AND item.status='completed' AND COALESCE(item.funnel_outcome,'completed') NOT IN('out_of_profile','technical_failure')) AS complete
     FROM linked JOIN public.radar_capture_operations op ON linked.operation_type='capture' AND op.id=linked.operation_id AND op.organization_id=$1
     UNION ALL
     SELECT request.status,COUNT(item.id)::int,COUNT(item.id),COUNT(item.id) FILTER(WHERE item.state IN('completed','unchanged'))
     FROM linked JOIN public.radar_research_requests request ON linked.operation_type='research' AND request.id=linked.operation_id AND request.organization_id=$1
     LEFT JOIN public.radar_research_request_items item ON item.research_request_id=request.id AND item.organization_id=$1 GROUP BY request.id
    )
    SELECT COALESCE(SUM(requested),0) AS requested,COALESCE(SUM(found),0) AS found,COALESCE(SUM(complete),0) AS complete,
      COUNT(*) FILTER(WHERE status IN('accepted','queued','discovering','researching','running')) AS pending,
      COUNT(*) FILTER(WHERE status IN('blocked','failed')) AS blocked,COUNT(*) FILTER(WHERE status='partial') AS partial,COUNT(*) AS operations FROM states`,
   [mission.organizationId,mission.id])).rows[0]??{}
  return deriveRadarProspectingMetrics(Object.fromEntries(['requested','found','complete','pending','blocked','partial','operations'].map(k=>[k,Number(rows[k]??0)])) as RadarMetricCounts)
 },
 evaluate({mission,snapshot,now}){
  const value=(key:string)=>{const metric=snapshot.metrics[key];return metric?.kind==='known'?Number(metric.value):0}
  if(mission.deadlineAt&&Date.parse(mission.deadlineAt)<Date.parse(now))return{conclusion:'expire',reasons:['deadline_passed']}
  if(value('operations_blocked')>0||value('operations_partial')>0)return{conclusion:'block',reasons:['radar_research_requires_review']}
  if(snapshot.signals.requiredMetricUnknownIsBlocking)return{conclusion:'continue',reasons:['radar_research_pending']}
  if(value('research_completed')>0&&value('companies_found')>=value('companies_requested'))return{conclusion:'succeed',reasons:['radar_research_delivered_for_review']}
  return{conclusion:'block',reasons:['radar_research_empty_or_incomplete']}
 },
}
