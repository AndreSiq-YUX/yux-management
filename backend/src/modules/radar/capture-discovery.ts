import type pg from 'pg'
import {normalizeRadarCounters} from './numeric-counters.js'
import type {AppEnv} from '../../config/env.js'
import type {AuthUser} from '../../auth/routes.js'
import {runRadarCnpjaAdvancedSearch,assertRadarRegionalBatchAccess} from './repository.js'
import {buildRadarDiscoveryScopes,resolveRadarSearchConfiguration} from './search-configuration.js'
import {admitRadarCapturePage,assertCaptureAvailability,captureError,getRadarCaptureOperation,type AvailabilityLoader} from './capture-operation.js'
import {loadRadarCapturePageAccounting} from './capture-capacity.js'
import {advanceRadarAdaptiveCapture} from './adaptive-capture.js'
import {loadRadarFunnelLotProgress,stopRadarFunnelAtPaidPageCap,refreshRadarFunnelWaitingLot} from './funnel-replenishment.js'

export async function authorizeRadarCapture(pool:pg.Pool,organizationId:string,operationId:string,availability?:AvailabilityLoader,checkAvailability=true){
 const op=normalizeRadarCounters((await pool.query('SELECT * FROM public.radar_capture_operations WHERE id=$1 AND organization_id=$2',[operationId,organizationId])).rows[0])
 if(!op)throw captureError('radar_capture_not_found',404)
 if(op.historical_closed_at)throw captureError('radar_historical_capture_closed')
 const row=(await pool.query("SELECT id,email,display_name,role FROM app_users WHERE id=$1 AND role='yux_admin' AND is_active=TRUE",[op.requested_by])).rows[0]
 if(!row)throw captureError('radar_batch_admin_not_active')
 const user={id:row.id,email:row.email,name:row.display_name,role:row.role} as AuthUser
 const revision=await assertRadarRegionalBatchAccess(pool,user,organizationId,op.campaign_id)
 if(revision!==op.configuration_revision)throw captureError('radar_campaign_configuration_changed')
 // v2 authorizes each actual source/effect independently. A global search
 // quota must not prevent normalizing/admitting an already received page.
 if(checkAvailability&&op.pipeline_version!==2)await assertCaptureAvailability(pool,user,organizationId,op.campaign_id,availability)
 return{op,user}
}
export async function blockRadarCapture(pool:pg.Pool,organizationId:string,operationId:string,cause:unknown){
 const raw=cause instanceof Error?cause.message:'radar_capture_unavailable'
 const code=/^[a-z][a-z0-9_]{2,100}$/.test(raw)?raw:'radar_capture_unavailable'
 await pool.query("UPDATE public.radar_capture_operations SET status='blocked',blockers=$3,updated_at=NOW() WHERE id=$1 AND organization_id=$2 AND historical_closed_at IS NULL",[operationId,organizationId,JSON.stringify([code])])
}
export async function advanceRadarCaptureDiscovery(pool:pg.Pool,env:AppEnv,input:{organizationId:string;operationId:string},dependencies:Parameters<typeof runRadarCnpjaAdvancedSearch>[3]&{availability?:AvailabilityLoader}&NonNullable<Parameters<typeof advanceRadarAdaptiveCapture>[4]>={}){
 let authorized:Awaited<ReturnType<typeof authorizeRadarCapture>>
 try{authorized=await authorizeRadarCapture(pool,input.organizationId,input.operationId,dependencies.availability)}catch(cause){await blockRadarCapture(pool,input.organizationId,input.operationId,cause);throw cause}
 const {op,user}=authorized,configuration=resolveRadarSearchConfiguration(op.configuration_snapshot.search_configuration)
 await refreshRadarFunnelWaitingLot(pool,op)
 if(op.discovery_stopped||op.status==='blocked')return getRadarCaptureOperation(pool,user,input.organizationId,op.id)
 if(op.pipeline_version===2){try{await advanceRadarAdaptiveCapture(pool,env,op,user,dependencies)}catch(cause){await blockRadarCapture(pool,input.organizationId,op.id,cause)}return getRadarCaptureOperation(pool,user,input.organizationId,op.id)}
 if(op.discovery_pending){await blockRadarCapture(pool,input.organizationId,op.id,captureError('radar_capture_discovery_uncertain'));return getRadarCaptureOperation(pool,user,input.organizationId,op.id)}
 const scopes=buildRadarDiscoveryScopes({targetStates:op.configuration_snapshot.target_states,configurationRevision:op.configuration_revision,searchConfiguration:configuration})
 const client=await pool.connect()
 try{
  await client.query('BEGIN')
  const current=(await client.query('SELECT configuration_revision FROM public.radar_campaigns WHERE id=$1 AND organization_id=$2 FOR UPDATE',[op.campaign_id,input.organizationId])).rows[0]
  if(current?.configuration_revision!==op.configuration_revision)throw captureError('radar_campaign_configuration_changed')
  const overflow=(await client.query(`SELECT * FROM public.radar_capture_overflow WHERE campaign_id=$1 AND organization_id=$2 AND configuration_revision=$3 ORDER BY id LIMIT 1000 FOR UPDATE`,[op.campaign_id,input.organizationId,op.configuration_revision])).rows
  for(const row of overflow){
   const state=(await client.query('SELECT discovery_stopped FROM public.radar_capture_operations WHERE id=$1',[op.id])).rows[0]
   if(state.discovery_stopped)break
   await admitRadarCapturePage(client,{organizationId:input.organizationId,campaignId:op.campaign_id,operationId:op.id,revision:op.configuration_revision,scopeKey:row.scope_key,runId:row.enrichment_run_id},[row.candidate],false)
   await client.query('DELETE FROM public.radar_capture_overflow WHERE id=$1',[row.id])
  }
  await client.query('COMMIT')
 }catch(cause){await client.query('ROLLBACK');throw cause}finally{client.release()}
 let state=await getRadarCaptureOperation(pool,user,input.organizationId,op.id)
 if(state.discoveryStopped)return state
 // The bounded in-memory chunk is not a discovery quota. Finish draining paid
 // surplus on the next turn before reserving another provider request.
 const surplus=(await pool.query('SELECT EXISTS(SELECT 1 FROM public.radar_capture_overflow WHERE organization_id=$1 AND campaign_id=$2 AND configuration_revision=$3) AS pending',[input.organizationId,op.campaign_id,op.configuration_revision])).rows[0]?.pending
 if(surplus)return state
 if(await stopRadarFunnelAtPaidPageCap(pool,op))return getRadarCaptureOperation(pool,user,input.organizationId,op.id)
 const cursors=(await pool.query('SELECT scope_key,completed FROM public.radar_regional_discovery_cursors WHERE organization_id=$1 AND campaign_id=$2',[input.organizationId,op.campaign_id])).rows
 const unfinished=scopes.filter(scope=>!cursors.some(row=>row.scope_key===scope.key&&row.completed))
 const accounting=await loadRadarCapturePageAccounting(pool,op)
 if(op.queries<configuration.batch.maxQueriesPerBatch&&!accounting.historyCertain){await blockRadarCapture(pool,input.organizationId,op.id,captureError('radar_capture_history_uncertain'));return getRadarCaptureOperation(pool,user,input.organizationId,op.id)}
 const eligible=unfinished.filter(scope=>Number(accounting.successfulPagesByScope[scope.key]??0)<configuration.batch.maxPagesPerScope)
 const stop=op.queries>=configuration.batch.maxQueriesPerBatch?'query_cap':!unfinished.length?'source_exhausted':!eligible.length?'page_cap':undefined
 if(stop){await pool.query('UPDATE public.radar_capture_operations SET discovery_stopped=TRUE,discovery_reason=$2,updated_at=NOW() WHERE id=$1',[op.id,stop]);return getRadarCaptureOperation(pool,user,input.organizationId,op.id)}
 // Round-robin scopes across bounded worker turns, not an unbounded job.
 const scope=eligible.sort((a,b)=>Number(accounting.successfulPagesByScope[a.key]??0)-Number(accounting.successfulPagesByScope[b.key]??0))[0]
 try{
  const remaining=op.funnel_enabled?(await loadRadarFunnelLotProgress(pool,op)).remaining:state.counts.requested-state.counts.admitted
  if(remaining<=0)return state
  const result=await runRadarCnpjaAdvancedSearch(pool,user,{organizationId:input.organizationId,campaignId:op.campaign_id,captureOperationId:op.id,expectedRevision:op.configuration_revision,regionalState:scope.state,regionalCity:scope.city,limit:Math.min(configuration.batch.pageSize,remaining),secretKeyMaterial:env.PROVIDER_SECRET_ENCRYPTION_KEY_B64?`provider-key:${env.PROVIDER_SECRET_ENCRYPTION_KEY_B64}`:env.SESSION_SECRET},dependencies)
  if(result.issues.length)await blockRadarCapture(pool,input.organizationId,op.id,captureError(result.issues[0].code))
 }catch(cause){await blockRadarCapture(pool,input.organizationId,op.id,cause)}
 state=await getRadarCaptureOperation(pool,user,input.organizationId,op.id)
 return state
}
