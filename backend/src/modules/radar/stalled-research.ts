import type pg from 'pg'
import type {AuthUser} from '../../auth/routes.js'
import {runWithDatabaseRequestContext} from '../../db/request-context.js'
import {loadRadarOperationalLimits} from './operational-limits.js'
export type RadarStalledReason='running_with_heartbeat'|'waiting_capacity'|'waiting_authorization'|'queue_unavailable'|'lease_expired'|'effect_uncertain'|'no_progress'
type Observation={lastProgressAt:string|Date;codes:string[];leases:Array<string|Date>;hasDelivery:boolean;workerHeartbeat?:boolean;uncertain?:boolean;queueAvailable?:boolean}
type Options={now:Date;stalledAfterMinutes:number;queueAvailable?:boolean}
export function classifyStalledRadarResearch(value:Observation,options:Options):RadarStalledReason|null{
 const progress=new Date(value.lastProgressAt).getTime()
 if(!Number.isFinite(progress)||options.now.getTime()-progress<options.stalledAfterMinutes*60_000)return null
 if(value.uncertain||value.codes.some(code=>/uncertain|previous_request_uncertain/.test(code)))return'effect_uncertain'
 if(value.codes.some(code=>/authorization|approval_required|confirmation_required|tls_approval/.test(code)))return'waiting_authorization'
 if(value.codes.some(code=>/limit|budget|credits|wallet/.test(code)))return'waiting_capacity'
 const leases=value.leases.map(date=>new Date(date).getTime()).filter(Number.isFinite)
 if(leases.some(date=>date>options.now.getTime()))return value.workerHeartbeat?'running_with_heartbeat':'no_progress'
 if(leases.length)return'lease_expired'
 if(options.queueAvailable===false||value.queueAvailable===false||!value.hasDelivery||value.codes.includes('radar_capture_queue_unavailable'))return'queue_unavailable'
 return'no_progress'
}
const actions:Record<RadarStalledReason,string>={running_with_heartbeat:'inspect_worker',waiting_capacity:'review_capacity',waiting_authorization:'review_authorization',queue_unavailable:'restore_delivery',lease_expired:'inspect_lease',effect_uncertain:'reconcile_receipts',no_progress:'inspect_worker'}
export type StalledRadarResearch={id:string;kind:'capture'|'request';organizationId:string;organizationName:string;campaignId:string;campaignName:string;stage:string;reason:RadarStalledReason;lastProgressAt:string;nextAction:string}
export async function inspectStalledRadarResearch(db:Pick<pg.Pool,'query'>,options:Options):Promise<StalledRadarResearch[]>{
 if(!Number.isFinite(options.now.getTime())||!Number.isSafeInteger(options.stalledAfterMinutes)||options.stalledAfterMinutes<1)throw Error('radar_watchdog_options_invalid')
 const rows=(await db.query(`WITH parents AS (
  SELECT id,organization_id,campaign_id,'capture' AS kind,status,last_progress_at,lease_until,blockers FROM public.radar_capture_operations WHERE status IN('queued','discovering','researching','blocked')
  UNION ALL SELECT id,organization_id,campaign_id,'request',status,last_progress_at,lease_until,'[]'::jsonb FROM public.radar_research_requests WHERE status IN('accepted','running','waiting')
 ), children AS (
  SELECT operation_id AS parent_id,'capture' AS kind,organization_id,run_id,blocker AS code,last_progress_at FROM public.radar_capture_items
  UNION ALL SELECT research_request_id,'request',organization_id,run_id,reason_code,last_progress_at FROM public.radar_research_request_items
 ) SELECT parent.*,organization.name AS organization_name,campaign.name AS campaign_name,
  GREATEST(parent.last_progress_at,MAX(child.last_progress_at),MAX(run.last_progress_at)) AS effective_progress,
  COALESCE(array_agg(DISTINCT child.code) FILTER(WHERE child.code IS NOT NULL),'{}') AS codes,
  COALESCE(array_agg(DISTINCT run.lease_until) FILTER(WHERE run.status='running' AND run.lease_until IS NOT NULL),'{}') AS child_leases,
  COALESCE(BOOL_OR(EXISTS(SELECT 1 FROM jsonb_each(COALESCE(run.calls,'{}')) call WHERE call.value->>'status' IN('uncertain','reserved','pending'))),FALSE) AS uncertain,
  COALESCE(MAX(run.stage),'discovery') AS stage,
  EXISTS(SELECT 1 FROM public.radar_capture_outbox delivery WHERE delivery.organization_id=parent.organization_id AND (delivery.operation_id=parent.id OR delivery.research_request_id=parent.id)) AS has_delivery,
  EXISTS(SELECT 1 FROM public.worker_process_heartbeats heartbeat WHERE heartbeat.last_seen_at>$1::timestamptz-INTERVAL '90 seconds' AND 'external'=ANY(heartbeat.queue_classes)) AS worker_heartbeat
 FROM parents parent JOIN public.organizations organization ON organization.id=parent.organization_id
 JOIN public.radar_campaigns campaign ON campaign.id=parent.campaign_id AND campaign.organization_id=parent.organization_id
 LEFT JOIN children child ON child.parent_id=parent.id AND child.kind=parent.kind AND child.organization_id=parent.organization_id
 LEFT JOIN public.radar_candidate_research_runs run ON run.id=child.run_id AND run.organization_id=parent.organization_id
 GROUP BY parent.id,parent.organization_id,parent.campaign_id,parent.kind,parent.status,parent.last_progress_at,parent.lease_until,parent.blockers,organization.name,campaign.name
 HAVING EXTRACT(EPOCH FROM($1::timestamptz-GREATEST(parent.last_progress_at,MAX(child.last_progress_at),MAX(run.last_progress_at))))>=$2::double precision*60
 ORDER BY effective_progress,parent.id`,[options.now,options.stalledAfterMinutes])).rows
 return rows.flatMap(row=>{
  const reason=classifyStalledRadarResearch({lastProgressAt:row.effective_progress,codes:[...row.codes,...row.blockers],leases:[...row.child_leases,...(row.lease_until?[row.lease_until]:[])],hasDelivery:row.has_delivery,workerHeartbeat:row.worker_heartbeat,uncertain:row.uncertain},options)
  return reason?[{id:row.id,kind:row.kind,organizationId:row.organization_id,organizationName:row.organization_name,campaignId:row.campaign_id,campaignName:row.campaign_name,stage:row.stage,reason,lastProgressAt:new Date(row.effective_progress).toISOString(),nextAction:actions[reason]}]:[]
 })
}
export async function persistStalledRadarResearch(db:Pick<pg.Pool,'query'>,items:StalledRadarResearch[],now:Date){
 // This method must run in one tenant's worker context. RLS denies global or
 // foreign writes, including a caller accidentally supplying another tenant.
 for(const item of items){
  const column=item.kind==='capture'?'operation_id':'research_request_id'
  await db.query(`INSERT INTO public.radar_research_attention(organization_id,campaign_id,${column},reason,last_progress_at,detected_at) VALUES($1,$2,$3,$4,$5,$6)
   ON CONFLICT(${column}) DO UPDATE SET reason=EXCLUDED.reason,last_progress_at=EXCLUDED.last_progress_at,resolved_at=NULL,
    detected_at=CASE WHEN radar_research_attention.reason IS DISTINCT FROM EXCLUDED.reason OR radar_research_attention.last_progress_at IS DISTINCT FROM EXCLUDED.last_progress_at OR radar_research_attention.resolved_at IS NOT NULL THEN EXCLUDED.detected_at ELSE radar_research_attention.detected_at END`,[item.organizationId,item.campaignId,item.id,item.reason,item.lastProgressAt,now])
 }
 await db.query('UPDATE public.radar_research_attention SET resolved_at=$1 WHERE resolved_at IS NULL AND COALESCE(operation_id,research_request_id)<>ALL($2::uuid[])',[now,items.map(item=>item.id)])
}
export async function runRadarResearchWatchdog(pool:pg.Pool,queueAvailable?:boolean){
 const policy=await loadRadarOperationalLimits(pool),now=new Date()
 const scopes=(await pool.query('SELECT organization_id FROM public.radar_research_watchdog_scopes')).rows
 let attention=0
 for(const scope of scopes)await runWithDatabaseRequestContext({role:'yux_operator',organizationIds:[scope.organization_id],serviceRole:'worker'},async()=>{
  const items=await inspectStalledRadarResearch(pool,{now,stalledAfterMinutes:policy.limits.stalledAfterMinutes,queueAvailable})
  await persistStalledRadarResearch(pool,items,now);attention+=items.length
 })
 return{attention}
}
export async function getRadarStalledResearch(pool:pg.Pool,user:AuthUser){
 if(user.role!=='yux_admin'||!(await pool.query("SELECT id FROM public.app_users WHERE id=$1 AND role='yux_admin' AND is_active=TRUE",[user.id])).rows[0])throw Object.assign(Error('radar_source_admin_required'),{statusCode:403})
 const policy=await loadRadarOperationalLimits(pool)
 return{stalledAfterMinutes:policy.limits.stalledAfterMinutes,items:await inspectStalledRadarResearch(pool,{now:new Date(),stalledAfterMinutes:policy.limits.stalledAfterMinutes})}
}
