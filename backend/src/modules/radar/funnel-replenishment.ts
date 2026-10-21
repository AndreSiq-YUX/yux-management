import {z} from 'zod'
import type pg from 'pg'
import {resolveRadarSearchConfiguration} from './search-configuration.js'
const counter=z.number().int().nonnegative().safe()
const countersSchema=z.object({requested:counter.min(1),ratio:z.number().finite().min(0).max(1),admitted:counter,passed:counter,pending:counter}).strict().refine(value=>value.passed+value.pending<=value.admitted,'invalid_radar_funnel_counts')
export function planRadarFunnelReplenishment(raw:z.infer<typeof countersSchema>){
 const {requested,ratio,admitted,passed,pending}=countersSchema.parse(raw)
 const required=Math.ceil(ratio*requested),missing=Math.max(0,required-passed)
 return{required,missing,replenish:admitted>=requested&&pending===0&&missing>0}
}
type Lot=pg.QueryResultRow&{id:string;organization_id:string;requested_count:number;queries:number;funnel_enabled?:boolean;discovery_stopped:boolean;discovery_reason?:string;configuration_snapshot:any;replenishment_start_queries?:number|null}
export async function loadRadarFunnelLotProgress(db:Pick<pg.Pool,'query'>,op:Lot){
 const counts=(await db.query(`SELECT COUNT(*)::int AS admitted,
 COUNT(*) FILTER(WHERE item.initial_gate_status='pass')::int AS passed,
 COUNT(*) FILTER(WHERE item.initial_gate_status='pending')::int AS initial_pending,
 COUNT(*) FILTER(WHERE review.target_status='confirmed' AND item.funnel_outcome IN('completed','completed_with_gaps'))::int AS confirmed,
 COUNT(*) FILTER(WHERE item.funnel_outcome IS NULL OR item.funnel_outcome='technical_failure')::int AS final_pending
 FROM public.radar_capture_items item LEFT JOIN public.radar_b2b_reviews review ON review.candidate_id=item.candidate_id AND review.organization_id=item.organization_id AND review.configuration_revision=$3 WHERE item.operation_id=$1 AND item.organization_id=$2`,[op.id,op.organization_id,op.configuration_revision])).rows[0]
 const config=resolveRadarSearchConfiguration(op.configuration_snapshot.search_configuration)
 const admitted=Number(counts.admitted),passed=Number(config.batch.replenishmentBasis==='final_fit'?counts.confirmed:counts.passed),pending=Number(config.batch.replenishmentBasis==='final_fit'?counts.final_pending:counts.initial_pending)
 const plan=planRadarFunnelReplenishment({requested:Number(op.requested_count),ratio:config.batch.minPassRatio,admitted,passed,pending})
 return{...plan,admitted,passed,pending,confirmed:Number(counts.confirmed),remaining:Math.max(0,Number(op.requested_count)-admitted)||(plan.replenish?plan.missing:0)}
}
/** Caller holds campaign then lot lock. Changes only scheduling metadata, never
 * repeats discovery, acquires credentials or calls any external service. */
export async function syncRadarFunnelDiscovery(db:Pick<pg.Pool,'query'>,op:Lot){
 const progress=await loadRadarFunnelLotProgress(db,op)
 if(progress.admitted<Number(op.requested_count))return progress
 if(progress.pending){
  await db.query("UPDATE public.radar_capture_operations SET discovery_stopped=TRUE,discovery_reason='waiting_initial_triage' WHERE id=$1 AND organization_id=$2",[op.id,op.organization_id])
  op.discovery_stopped=true;op.discovery_reason='waiting_initial_triage';return progress
 }
 if(!progress.missing){
  await db.query("UPDATE public.radar_capture_operations SET discovery_stopped=TRUE,discovery_reason='target_reached' WHERE id=$1 AND organization_id=$2",[op.id,op.organization_id])
  op.discovery_stopped=true;op.discovery_reason='target_reached';return progress
 }
 const stoppedBySource=op.discovery_stopped&&!['target_reached','waiting_initial_triage','replenishing'].includes(op.discovery_reason??'')
 if(stoppedBySource){
  const reason=op.discovery_reason
  await db.query("UPDATE public.radar_capture_operations SET discovery_stopped=TRUE,discovery_reason='replenishment_shortfall',replenishment_stop_reason=CASE WHEN $3='replenishment_shortfall' THEN replenishment_stop_reason ELSE $3 END WHERE id=$1 AND organization_id=$2",[op.id,op.organization_id,reason])
  op.discovery_stopped=true;op.discovery_reason='replenishment_shortfall';return{...progress,remaining:0}
 }
 await db.query("UPDATE public.radar_capture_operations SET discovery_stopped=FALSE,discovery_reason='replenishing',replenishment_start_queries=COALESCE(replenishment_start_queries,queries) WHERE id=$1 AND organization_id=$2",[op.id,op.organization_id])
 op.replenishment_start_queries??=Number(op.queries)
 op.discovery_stopped=false;op.discovery_reason='replenishing';return progress
}
/** Repairs the scheduling checkpoint after individual analysis/reconciliation.
 * No source call is permitted here, and an operational block is never cleared. */
export async function refreshRadarFunnelWaitingLot(pool:pg.Pool,op:Lot){
 if(!op.funnel_enabled||!op.discovery_stopped||op.discovery_reason!=='waiting_initial_triage')return
 const db=await pool.connect()
 try{
  await db.query('BEGIN')
  await db.query('SELECT id FROM public.radar_campaigns WHERE id=$1 AND organization_id=$2 FOR UPDATE',[op.campaign_id,op.organization_id])
  const current=(await db.query('SELECT * FROM public.radar_capture_operations WHERE id=$1 AND organization_id=$2 FOR UPDATE',[op.id,op.organization_id])).rows[0]
  if(current&&!current.historical_closed_at&&current.discovery_reason==='waiting_initial_triage'&&current.status!=='blocked'){
   await syncRadarFunnelDiscovery(db,current as Lot);Object.assign(op,current)
  }
  await db.query('COMMIT')
 }catch(cause){await db.query('ROLLBACK');throw cause}finally{db.release()}
}
export async function stopRadarFunnelAtPaidPageCap(db:Pick<pg.Pool,'query'>,op:Lot){
 if(!op.funnel_enabled||op.replenishment_start_queries==null)return false
 const limit=resolveRadarSearchConfiguration(op.configuration_snapshot.search_configuration).batch.maxReplenishmentPages
 if(Number(op.queries)-Number(op.replenishment_start_queries)<limit)return false
 await db.query("UPDATE public.radar_capture_operations SET discovery_stopped=TRUE,discovery_reason='replenishment_shortfall',replenishment_stop_reason='replenishment_page_cap' WHERE id=$1 AND organization_id=$2",[op.id,op.organization_id])
 return true
}
