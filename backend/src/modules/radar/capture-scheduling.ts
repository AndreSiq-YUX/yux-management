import type pg from 'pg'
import {runWithDatabaseRequestContext} from '../../db/request-context.js'
import {reconcileRadarCaptureSummary} from './capture-reconciliation.js'
import {canContinueRadarAdaptiveAfterCursorRejection,canContinueRadarAdaptiveAfterSavedExtraction} from './adaptive-capture.js'

/** Repair scheduling metadata for an existing authorized active request only.
 * No provider/AI effects, receipt resets, child retries or spending grants. */
export async function repairRadarCaptureScheduling(pool:pg.Pool,organizationId:string):Promise<number>{
 const candidates=(await pool.query(`SELECT operation.id,operation.campaign_id
  FROM public.radar_capture_operations operation
  JOIN public.radar_campaigns campaign ON campaign.id=operation.campaign_id AND campaign.organization_id=operation.organization_id
  JOIN public.app_users actor ON actor.id=operation.requested_by
  WHERE operation.organization_id=$1 AND (operation.status IN('queued','discovering','researching') OR operation.status='blocked' AND operation.blockers ?| ARRAY['radar_discovery_continuation_rejected','radar_capture_unavailable'])
   AND operation.historical_closed_at IS NULL AND (operation.lease_until IS NULL OR operation.lease_until<NOW())
   AND campaign.configuration_revision=operation.configuration_revision AND campaign.status NOT IN('paused','completed','archived')
   AND actor.role='yux_admin' AND actor.is_active=TRUE
   AND NOT EXISTS(SELECT 1 FROM public.radar_capture_outbox delivery WHERE delivery.operation_id=operation.id AND delivery.organization_id=$1)
  ORDER BY operation.created_at,operation.campaign_id,operation.id LIMIT 100`,[organizationId])).rows
 let recovered=0
 const errors:unknown[]=[]
 for(const candidate of candidates){
  const db=await pool.connect()
  try{
   await db.query('BEGIN')
   // Match every capture writer's lock order; recheck after any competing repair.
   const campaign=(await db.query('SELECT configuration_revision,status FROM public.radar_campaigns WHERE id=$1 AND organization_id=$2 FOR UPDATE',[candidate.campaign_id,organizationId])).rows[0]
   const operation=(await db.query(`SELECT operation.* FROM public.radar_capture_operations operation JOIN public.app_users actor ON actor.id=operation.requested_by
    WHERE operation.id=$1 AND operation.organization_id=$2 AND (operation.status IN('queued','discovering','researching') OR operation.status='blocked' AND operation.blockers ?| ARRAY['radar_discovery_continuation_rejected','radar_capture_unavailable'])
     AND operation.historical_closed_at IS NULL AND (operation.lease_until IS NULL OR operation.lease_until<NOW())
     AND actor.role='yux_admin' AND actor.is_active=TRUE FOR UPDATE OF operation`,[candidate.id,organizationId])).rows[0]
   const delivered=(await db.query('SELECT 1 FROM public.radar_capture_outbox WHERE operation_id=$1 AND organization_id=$2',[candidate.id,organizationId])).rows.length>0
   if(!operation||!campaign||campaign.configuration_revision!==operation.configuration_revision||['paused','completed','archived'].includes(campaign.status)||delivered){await db.query('COMMIT');continue}
   const items=(await db.query('SELECT blocker FROM public.radar_capture_items WHERE operation_id=$1 AND organization_id=$2',[operation.id,organizationId])).rows
   const childReasons=new Set(items.flatMap(item=>item.blocker?[item.blocker]:[]))
   // Generic paused parents remain protected. An old confirmed cursor rejection
   // can only release independent discovery, with another usable scope proven.
   const discoveryBlockers=(operation.blockers as string[]).filter(code=>!childReasons.has(code))
   if(operation.status==='blocked'){
    const recoverable=discoveryBlockers.length===1&&(discoveryBlockers[0]==='radar_discovery_continuation_rejected'&&await canContinueRadarAdaptiveAfterCursorRejection(db,operation)||discoveryBlockers[0]==='radar_capture_unavailable'&&await canContinueRadarAdaptiveAfterSavedExtraction(db,operation))
    if(!recoverable){await db.query('COMMIT');continue}
    discoveryBlockers.length=0
   }
   if(operation.discovery_pending)discoveryBlockers.push('radar_capture_discovery_uncertain')
   await reconcileRadarCaptureSummary(db,{organizationId,operationId:operation.id,discoveryBlockers:[...new Set(discoveryBlockers)]})
   const scheduled=(await db.query('SELECT 1 FROM public.radar_capture_outbox WHERE operation_id=$1 AND organization_id=$2',[operation.id,organizationId])).rows.length>0
   await db.query('COMMIT')
   if(scheduled)recovered++
  }catch(cause){await db.query('ROLLBACK');errors.push(cause)}finally{db.release()}
 }
 if(errors.length)throw new AggregateError(errors,'radar_capture_scheduling_scope_failed')
 return recovered
}

export async function repairRadarCaptureSchedulingAcrossTenants(pool:pg.Pool):Promise<{recovered:number}>{
 // This existing dispatch-only registry is readable by the global worker;
 // campaign/receipt rows are always handled inside one tenant's RLS context.
 const scopes=(await pool.query('SELECT organization_id FROM public.radar_research_watchdog_scopes ORDER BY organization_id')).rows
 let recovered=0
 const errors:unknown[]=[]
 for(const scope of scopes){
  try{recovered+=await runWithDatabaseRequestContext({role:'yux_operator',organizationIds:[scope.organization_id],serviceRole:'worker'},()=>repairRadarCaptureScheduling(pool,scope.organization_id))}
  catch(cause){errors.push(cause)}
 }
 if(errors.length)throw new AggregateError(errors,'radar_capture_scheduling_repair_failed')
 return{recovered}
}
