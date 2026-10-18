import type pg from 'pg'
import type {RadarQueryable} from './capture-capacity.js'

type PendingCapture = {
 id:string; organization_id:string; campaign_id:string; configuration_revision:number
 status:string; queries:number; created_at:Date|string; lease_active?:boolean
}

// Caller holds campaign, then operation row locks in the same transaction.
// Never infer rejection from a generic error on new runs: only the adapter's
// HTTP receipt proves it. The narrow legacy rule recovers the pre-receipt bug.
export async function inspectRejectedRadarCaptureDiscovery(client:RadarQueryable,op:PendingCapture,lock=false){
 if(op.status!=='blocked'||op.lease_active)return false
 const runs=(await client.query(`SELECT id,status,input_payload,output_payload,error_message,completed_at
  FROM public.radar_enrichment_runs
  WHERE organization_id=$1 AND campaign_id=$2 AND provider='cnpja_advanced_search' AND started_at >= $3
  ORDER BY started_at DESC,id DESC LIMIT 2 ${lock?'FOR UPDATE':''}`,[op.organization_id,op.campaign_id,op.created_at])).rows
 const run=runs[0]
 if(!run||run.status!=='failed'||!run.completed_at||run.input_payload.configurationRevision!==op.configuration_revision||run.output_payload.candidateCount!==0)return false
 const linked=run.input_payload.captureOperationId===op.id&&run.output_payload.discoveryOutcome==='rejected'
 const legacy=runs.length===1&&op.queries===1&&!run.input_payload.captureOperationId&&!run.output_payload.discoveryOutcome
  &&run.error_message==='request validation failed'
  &&run.output_payload.issues?.some((issue:{code?:string;sourceType?:string})=>issue.code==='provider_failed'&&issue.sourceType==='cnpja_advanced_search')
 if(!linked&&!legacy)return false
 if(legacy){
  const items=await client.query('SELECT 1 FROM public.radar_capture_items WHERE operation_id=$1 AND organization_id=$2 LIMIT 1',[op.id,op.organization_id])
  if(items.rows.length)return false
 }
 return{run,legacy}
}
export async function recoverRejectedRadarCaptureDiscovery(client:pg.PoolClient,op:PendingCapture):Promise<boolean>{
 const proof=await inspectRejectedRadarCaptureDiscovery(client,op,true)
 if(!proof)return false
 const {run,legacy}=proof
 await client.query(`UPDATE public.radar_enrichment_runs SET input_payload=CASE WHEN $5 THEN input_payload||jsonb_build_object('captureOperationId',$2::text) ELSE input_payload END,output_payload=output_payload||CASE WHEN $5 THEN jsonb_build_object('discoveryOutcome','rejected') ELSE '{}'::jsonb END||jsonb_build_object('captureRecovery',
  jsonb_build_object('operationId',$2::text,'reason',$3::text,'recoveredAt',NOW())),updated_at=NOW() WHERE id=$1 AND organization_id=$4`,
  [run.id,op.id,legacy?'legacy_validation_rejection':'confirmed_validation_rejection',op.organization_id,legacy])
 await client.query('UPDATE public.radar_capture_operations SET discovery_pending=FALSE,updated_at=NOW() WHERE id=$1 AND organization_id=$2',[op.id,op.organization_id])
 return true
}
