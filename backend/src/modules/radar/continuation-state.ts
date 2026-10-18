import {createHash} from 'node:crypto'
import type pg from 'pg'
import {captureError} from './capture-operation.js'
import {loadRadarOperationalLimits,type RadarOperationalPolicy} from './operational-limits.js'
import type {RadarQueryable} from './capture-capacity.js'

export type ContinuationScope={organizationId:string;campaignId:string;configurationRevision:number;key:string;label:string;state:string;city?:string}
export type ContinuationAuthorization={scopeKey:string;expectedStateId:string}
export type RadarContinuationState={scopeKey:string;scopeLabel:string;stateId:string;generation:number;reason:'ready'|'unknown_age'|'idle'|'rejected'|'uncertain'|'running';requiresRestartConfirmation:boolean;replayEstimate:number}
const digest=(value:string)=>createHash('sha256').update(value).digest('hex')

// Raw tokens stay in the database. This projection is safe for the Admin DTO.
export async function inspectRadarContinuationState(db:RadarQueryable,scope:ContinuationScope,policy:RadarOperationalPolicy):Promise<RadarContinuationState|null>{
 const cursor=(await db.query(`SELECT next_token,completed,token_received_at,generation,pages_processed,rejected_token_hash,rejected_receipt_id,running_until>NOW() AS lease_active,
  token_received_at IS NOT NULL AND token_received_at < NOW()-($4::double precision*INTERVAL '1 minute') AS idle
  FROM public.radar_regional_discovery_cursors WHERE organization_id=$1 AND campaign_id=$2 AND scope_key=$3 AND provider='cnpja_advanced_search'`,[scope.organizationId,scope.campaignId,scope.key,policy.limits.maxContinuationIdleMinutes])).rows[0]
 if(!cursor||cursor.completed)return null
 const generation=cursor.generation??0,tokenHash=cursor.next_token?digest(cursor.next_token):null
 const run=(await db.query(`SELECT id,status,completed_at,error_message,output_payload FROM public.radar_enrichment_runs
  WHERE organization_id=$1 AND campaign_id=$2 AND provider='cnpja_advanced_search' AND input_payload->>'pageToken' IS NOT DISTINCT FROM $3::text
  AND input_payload->>'configurationRevision'=$4 AND (input_payload->>'scopeKey'=$5 OR
   (input_payload->>'scopeKey' IS NULL AND input_payload->>'regionalState'=$6 AND COALESCE(input_payload->>'regionalCity','')=$7))
  AND COALESCE(input_payload->>'continuationGeneration','0')=$8
  ORDER BY started_at DESC NULLS LAST,id DESC LIMIT 1`,[scope.organizationId,scope.campaignId,cursor.next_token,String(scope.configurationRevision),scope.key,scope.state,scope.city??'',String(generation)])).rows[0]
 const output=run?.output_payload
 const rejected=!!tokenHash&&(cursor.rejected_token_hash===tokenHash||run?.status==='failed'&&!!run.completed_at&&output?.candidateCount===0&&output?.discoveryOutcome==='rejected'&&output?.httpStatus===400&&/\btoken is invalid or expired\b/i.test(run.error_message??'')&&!output.captureContinuationRecovery)
 // Unknown network effects or incomplete receipts cannot be converted into a replay consent.
 const uncertain=run&&(run.status==='running'||output?.discoveryOutcome==='uncertain'||run.status==='failed'&&!output?.discoveryOutcome)
 if(!cursor.next_token&&!cursor.lease_active&&!uncertain)return null
 const reason:RadarContinuationState['reason']=cursor.lease_active?'running':uncertain?'uncertain':rejected?'rejected':!cursor.token_received_at?'unknown_age':cursor.idle?'idle':'ready'
 const stateId=digest(JSON.stringify({scope,policyVersion:policy.version,generation,tokenHash,receivedAt:cursor.token_received_at,reason,receiptId:run?.id??cursor.rejected_receipt_id??null}))
 return{scopeKey:scope.key,scopeLabel:scope.label,stateId,generation,reason,requiresRestartConfirmation:['rejected','unknown_age','idle'].includes(reason),replayEstimate:Number(cursor.pages_processed??0)}
}

// Callers lock campaign -> policy -> cursors before approving. The outbox and
// approval commit together; neither an old tab nor a failed transaction can replay.
export async function approveRadarContinuationRestart(client:pg.PoolClient,scope:ContinuationScope,input:{expectedStateId:string;requestId:string;approvedBy:string},policy?:RadarOperationalPolicy){
 const currentPolicy=policy??await loadRadarOperationalLimits(client)
 await client.query("SELECT scope_key FROM public.radar_regional_discovery_cursors WHERE organization_id=$1 AND campaign_id=$2 AND scope_key=$3 AND provider='cnpja_advanced_search' FOR UPDATE",[scope.organizationId,scope.campaignId,scope.key])
 const current=await inspectRadarContinuationState(client,scope,currentPolicy)
 if(!current||current.stateId!==input.expectedStateId||!current.requiresRestartConfirmation)throw captureError('radar_capture_continuation_confirmation_stale')
 await client.query(`INSERT INTO public.radar_continuation_authorizations(organization_id,campaign_id,configuration_revision,scope_key,generation,request_id,approved_by,expected_state_id,token_hash,reason,policy_version)
  SELECT $1,$2,$3,$4,generation,$5,$6,$7,encode(sha256(convert_to(next_token,'UTF8')),'hex'),$8,$9 FROM public.radar_regional_discovery_cursors WHERE organization_id=$1 AND campaign_id=$2 AND scope_key=$4 AND provider='cnpja_advanced_search'`,[scope.organizationId,scope.campaignId,scope.configurationRevision,scope.key,input.requestId,input.approvedBy,input.expectedStateId,current.reason,currentPolicy.version])
 await client.query(`UPDATE public.radar_regional_discovery_cursors SET next_token=NULL,token_received_at=NULL,generation=generation+1,rejected_token_hash=NULL,rejected_receipt_id=NULL,completed=FALSE,lease_id=NULL,running_until=NULL,updated_at=NOW()
  WHERE organization_id=$1 AND campaign_id=$2 AND scope_key=$3 AND provider='cnpja_advanced_search'`,[scope.organizationId,scope.campaignId,scope.key])
}

export async function authorizeRadarContinuations(client:pg.PoolClient,scopes:ContinuationScope[],policy:RadarOperationalPolicy,input:{authorizations?:ContinuationAuthorization[];requestId:string;approvedBy:string}){
 const approvals=input.authorizations??[]
 if(new Set(approvals.map(item=>item.scopeKey)).size!==approvals.length||approvals.some(item=>!scopes.some(scope=>scope.key===item.scopeKey)))throw captureError('radar_capture_continuation_confirmation_stale')
 for(const scope of scopes){
  const state=await inspectRadarContinuationState(client,scope,policy),approval=approvals.find(item=>item.scopeKey===scope.key)
  if(state?.reason==='uncertain')throw captureError('radar_capture_discovery_uncertain')
  if(state?.reason==='running')throw captureError('radar_capture_in_progress')
  if(approval)await approveRadarContinuationRestart(client,scope,{...approval,requestId:input.requestId,approvedBy:input.approvedBy},policy)
  else if(state?.requiresRestartConfirmation)throw captureError('radar_capture_continuation_confirmation_required')
 }
}
