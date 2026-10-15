import type pg from 'pg'
import {randomUUID} from 'node:crypto'
import {z} from 'zod'
import type {AuthUser} from '../../auth/routes.js'
import type {AppEnv} from '../../config/env.js'
import type {RegisteredJobQueue} from '../../jobs/registry.js'
import {startRadarCandidateResearch} from './research-service.js'
import {advanceRadarCaptureDiscovery,authorizeRadarCapture,blockRadarCapture} from './capture-discovery.js'
import {assertRadarRegionalBatchAccess} from './repository.js'
import {captureError,getRadarCaptureOperation,type AvailabilityLoader} from './capture-operation.js'

type Child={status:string;error_code?:string;lease_until?:string;output?:Record<string,unknown>;calls?:Record<string,{status:string}>}
export function classifyRadarCaptureResearch(run:Child):'researching'|'completed'|'insufficient'|'blocked'{
 if(run.status==='queued'||run.status==='running')return run.status==='running'&&run.lease_until&&Date.parse(run.lease_until)<Date.now()?'blocked':'researching'
 if(['blocked','failed'].includes(run.status)||Object.values(run.calls??{}).some(call=>call.status!=='completed'))return 'blocked'
 const output=run.output??{},pages=(output.pages??[]) as Array<{diagnostic?:{kind?:string};text?:string;limitation?:string}>
 if(pages.some(page=>page.diagnostic?.kind==='tls_expired'&&(!page.text||page.limitation)))return 'blocked'
 const limitations=Array.isArray(output.limitations)?output.limitations as string[]:[]
 if(limitations.some(value=>/radar_.*(?:failed|unavailable|uncertain|pending|waiting|wallet|credits)|agent_runtime_|Identificação do site pendente|Qualificação semântica pendente/i.test(value)))return 'blocked'
 const quality=output.quality as {readyForReview?:boolean}|undefined
 return run.status==='succeeded'&&output.siteAssociation!=='review'&&quality?.readyForReview!==false?'completed':'insufficient'
}
type CaptureQueue=Pick<RegisteredJobQueue,'add'>
export async function dispatchRadarCaptureOperation(pool:pg.Pool,env:AppEnv,input:{organizationId:string;operationId:string},queue:CaptureQueue,signal?:AbortSignal,
 dependencies:{availability?:AvailabilityLoader;startResearch?:typeof startRadarCandidateResearch;discover?:typeof advanceRadarCaptureDiscovery}={}){
 let authorized:Awaited<ReturnType<typeof authorizeRadarCapture>>
 try{authorized=await authorizeRadarCapture(pool,input.organizationId,input.operationId,dependencies.availability,false)}catch(cause){await blockRadarCapture(pool,input.organizationId,input.operationId,cause);return}
 const {op,user}=authorized
 if(['completed','partial','blocked'].includes(op.status))return getRadarCaptureOperation(pool,user,input.organizationId,op.id)
 const lease=randomUUID()
 const acquired=await pool.query(`UPDATE public.radar_capture_operations SET lease_id=$3,lease_until=NOW()+INTERVAL '6 minutes',status=CASE WHEN discovery_stopped THEN 'researching' ELSE 'discovering' END
  WHERE id=$1 AND organization_id=$2 AND (lease_until IS NULL OR lease_until<NOW()) RETURNING id`,[op.id,input.organizationId,lease])
 if(!acquired.rows.length)return getRadarCaptureOperation(pool,user,input.organizationId,op.id)
 try{
  signal?.throwIfAborted()
  if(!op.discovery_stopped)await (dependencies.discover??advanceRadarCaptureDiscovery)(pool,env,input,{availability:dependencies.availability})
  if((await getRadarCaptureOperation(pool,user,input.organizationId,op.id)).status==='blocked')return
  // Each turn handles at most ten items. Child jobs keep their own leases/receipts.
  const items=(await pool.query(`SELECT item.*,run.status AS run_status,run.error_code,run.output,run.calls,run.lease_until
   FROM public.radar_capture_items item LEFT JOIN public.radar_candidate_research_runs run ON run.id=item.run_id AND run.organization_id=item.organization_id
   WHERE item.operation_id=$1 AND item.organization_id=$2 AND item.status IN ('queued','researching') ORDER BY item.created_at,item.id LIMIT 10`,[op.id,input.organizationId])).rows
  for(const item of items){
   signal?.throwIfAborted()
   // Permission and saved revision can change while discovery is in flight.
   await authorizeRadarCapture(pool,input.organizationId,op.id,dependencies.availability,false)
   let runId=item.run_id,status=item.run_status
   if(!runId||item.status==='queued'&&['partial','blocked','failed'].includes(status)){
    try{
     await authorizeRadarCapture(pool,input.organizationId,op.id,dependencies.availability)
     const start=await(dependencies.startResearch??startRadarCandidateResearch)(pool,user,{organizationId:input.organizationId,candidateId:item.candidate_id,configurationRevision:op.configuration_revision,requestId:item.id,...(runId?{operation:'resume' as const}:{})})
     runId=start.runId;status=start.status
     await pool.query('UPDATE public.radar_capture_items SET run_id=$3 WHERE id=$1 AND organization_id=$2',[item.id,input.organizationId,runId])
    }catch(cause){await pool.query("UPDATE public.radar_capture_items SET status='blocked',blocker=$3 WHERE id=$1 AND organization_id=$2",[item.id,input.organizationId,cause instanceof Error&&/^[a-z0-9_]+$/.test(cause.message)?cause.message:'radar_capture_research_unavailable']);continue}
   }
   if(status==='queued'){
    await authorizeRadarCapture(pool,input.organizationId,op.id,dependencies.availability)
    try{
     await queue.add('radar.researchCandidate',{organizationId:input.organizationId,runId},{jobId:`radar-capture-item-${item.id}-${item.dispatch_generation}`})
     await pool.query("UPDATE public.radar_capture_items SET status='researching',blocker=NULL WHERE id=$1 AND organization_id=$2",[item.id,input.organizationId])
    }catch{await pool.query("UPDATE public.radar_capture_items SET blocker='radar_capture_queue_unavailable' WHERE id=$1 AND organization_id=$2",[item.id,input.organizationId])}
   }else{
    const classification=classifyRadarCaptureResearch({...item,status})
    await pool.query('UPDATE public.radar_capture_items SET status=$3,blocker=$4 WHERE id=$1 AND organization_id=$2',[item.id,input.organizationId,classification,classification==='blocked'?item.error_code||'radar_capture_item_requires_review':null])
   }
  }
  const state=await getRadarCaptureOperation(pool,user,input.organizationId,op.id)
  const ongoing=!state.discoveryStopped||state.counts.researching>0
  const status=ongoing?(state.discoveryStopped?'researching':'discovering'):state.counts.blocked?'blocked':state.counts.admitted<state.counts.requested||state.counts.insufficient?'partial':'completed'
  const blockers=state.items.filter(item=>item.blocker).map(item=>item.blocker!)
  await pool.query('UPDATE public.radar_capture_operations SET status=$3,blockers=$4,updated_at=NOW() WHERE id=$1 AND organization_id=$2',[op.id,input.organizationId,status,JSON.stringify([...new Set(blockers)])])
  if(['completed','partial','blocked'].includes(status))await pool.query('DELETE FROM public.radar_capture_outbox WHERE operation_id=$1 AND organization_id=$2',[op.id,input.organizationId])
 }catch(cause){await blockRadarCapture(pool,input.organizationId,op.id,cause)}finally{
  await pool.query('UPDATE public.radar_capture_operations SET lease_id=NULL,lease_until=NULL WHERE id=$1 AND organization_id=$2 AND lease_id=$3',[op.id,input.organizationId,lease])
  await pool.query("UPDATE public.radar_capture_outbox SET next_dispatch_at=NOW()+INTERVAL '20 seconds' WHERE operation_id=$1 AND organization_id=$2",[op.id,input.organizationId])
 }
 return getRadarCaptureOperation(pool,user,input.organizationId,op.id)
}
export async function reconcileRadarCaptureOutbox(pool:pg.Pool,queue:CaptureQueue,window:number){
 // Global worker reads only this dispatch-only table; tenant job reauthorizes.
 const rows=(await pool.query('SELECT operation_id,organization_id FROM public.radar_capture_outbox WHERE next_dispatch_at<=NOW() ORDER BY next_dispatch_at,operation_id LIMIT 100')).rows
 for(const row of rows)await queue.add('radar.advanceCaptureOperation',{organizationId:row.organization_id,operationId:row.operation_id},{jobId:`radar-capture-${row.operation_id}-${window}`})
 return{enqueued:rows.length}
}
export async function resumeRadarCaptureOperation(pool:pg.Pool,user:AuthUser,input:{organizationId:string;operationId:string;configurationRevision:number;requestId:string},dependencies:{availability?:AvailabilityLoader}={}){
 z.uuid().parse(input.requestId)
 const {op}=await authorizeRadarCapture(pool,input.organizationId,input.operationId,dependencies.availability)
 if(user.role!=='yux_admin')throw captureError('radar_source_admin_required',403)
 const revision=await assertRadarRegionalBatchAccess(pool,user,input.organizationId,op.campaign_id)
 if(revision!==input.configurationRevision||revision!==op.configuration_revision)throw captureError('radar_campaign_configuration_changed')
 if(op.discovery_pending)throw captureError('radar_capture_discovery_uncertain')
 const client=await pool.connect()
 try{
  await client.query('BEGIN')
  const current=(await client.query('SELECT * FROM public.radar_capture_operations WHERE id=$1 AND organization_id=$2 FOR UPDATE',[op.id,input.organizationId])).rows[0]
  if(current.resume_request_id!==input.requestId&&current.status==='blocked'){
   const items=(await client.query("SELECT * FROM public.radar_capture_items WHERE operation_id=$1 AND status='blocked'",[op.id])).rows
   for(const item of items){
    await client.query("UPDATE public.radar_capture_items SET status='queued',blocker=NULL,dispatch_generation=dispatch_generation+1 WHERE id=$1",[item.id])
   }
   await client.query("UPDATE public.radar_capture_operations SET status='queued',blockers='[]',resume_request_id=$2,resume_generation=resume_generation+1 WHERE id=$1",[op.id,input.requestId])
   await client.query('INSERT INTO public.radar_capture_outbox(operation_id,organization_id,campaign_id) VALUES($1,$2,$3) ON CONFLICT(operation_id) DO UPDATE SET next_dispatch_at=NOW()',[op.id,input.organizationId,op.campaign_id])
  }
  await client.query('COMMIT')
 }catch(cause){await client.query('ROLLBACK');throw cause}finally{client.release()}
 return getRadarCaptureOperation(pool,user,input.organizationId,op.id)
}
