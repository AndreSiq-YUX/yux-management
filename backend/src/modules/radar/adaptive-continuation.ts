import {createHash} from 'node:crypto'
import type pg from 'pg'
import type {RadarOperationalPolicy} from './operational-limits.js'
import type {ContinuationAuthorization} from './continuation-state.js'
type Db=Pick<pg.Pool,'query'>
type Scope={organizationId:string;campaignId:string;configurationRevision:number}
const fail=(code:string)=>Object.assign(Error(code),{statusCode:409})
/** App approval is separate from provider cursor data. No provider token is
 * invented and the original raw response/uncertainty is never overwritten. */
export async function radarAdaptiveContinuations(db:Db,input:Scope,policy:RadarOperationalPolicy){
 const rows=(await db.query(`SELECT DISTINCT ON(scope_key) * ,updated_at::text AS updated_stamp,lease_until>NOW() AS lease_active FROM public.radar_discovery_pages WHERE organization_id=$1 AND campaign_id=$2 AND criteria_revision=$3 ORDER BY scope_key,page_number DESC`,[input.organizationId,input.campaignId,input.configurationRevision])).rows
 return rows.flatMap(page=>{
  if(page.extraction?.restartAuthorization)return[]
  const expired=page.status==='admitted'&&page.exhaustion==='more'&&page.continuation&&Date.now()-new Date(page.updated_at).getTime()>policy.limits.maxContinuationIdleMinutes*60000
  const rejected=page.status==='rejected'&&page.error_code==='radar_discovery_continuation_rejected'
  const uncertain=page.status==='uncertain'&&!page.lease_active
  if(!expired&&!rejected&&!uncertain)return[]
  const stateId=createHash('sha256').update(JSON.stringify({id:page.id,scope:input,status:page.status,continuation:page.continuation,error:page.error_code,updatedStamp:page.updated_stamp,policyVersion:policy.version})).digest('hex')
  const scope=page.input?.scope
  return[{pageId:page.id,updatedStamp:page.updated_stamp,scopeKey:page.scope_key,scopeLabel:[scope?.term,scope?.city,scope?.state].filter(Boolean).join(' / '),stateId,generation:Number(page.page_number),reason:uncertain?'uncertain' as const:rejected?'rejected' as const:'idle' as const,requiresRestartConfirmation:true,replayEstimate:Number(page.page_number),previousStatus:page.status}]
 })
}
export async function authorizeRadarAdaptiveContinuations(db:Db,input:Scope,policy:RadarOperationalPolicy,authorization:{requestId:string;approvedBy:string;authorizations?:ContinuationAuthorization[]}){
 const states=await radarAdaptiveContinuations(db,input,policy),grants=authorization.authorizations??[]
 if(grants.some(grant=>!states.some(state=>state.scopeKey===grant.scopeKey&&state.stateId===grant.expectedStateId)))throw fail('radar_capture_continuation_confirmation_stale')
 for(const state of states){
  if(!grants.some(grant=>grant.scopeKey===state.scopeKey&&grant.expectedStateId===state.stateId))throw fail('radar_capture_continuation_confirmation_required')
  const grant={requestId:authorization.requestId,approvedBy:authorization.approvedBy,expectedStateId:state.stateId,previousStatus:state.previousStatus,reason:state.reason,acknowledgedPreviousCharge:state.reason==='uncertain',approvedAt:new Date().toISOString()}
  const saved=await db.query(`UPDATE public.radar_discovery_pages SET extraction=extraction||jsonb_build_object('restartAuthorization',$3::jsonb),updated_at=NOW() WHERE id=$1 AND organization_id=$2 AND extraction->'restartAuthorization' IS NULL AND updated_at::text=$4 RETURNING id`,[state.pageId,input.organizationId,JSON.stringify(grant),state.updatedStamp])
  if(!saved.rows.length)throw fail('radar_capture_continuation_confirmation_stale')
 }
}
export function effectiveRadarAdaptivePage<T extends {status:string;extraction:Record<string,unknown>;continuation?:unknown;exhaustion:string}>(page:T){
 return page.extraction?.restartAuthorization?{...page,status:'admitted' as const,exhaustion:'more' as const,continuation:{restartAuthorization:page.extraction.restartAuthorization}}:page
}
