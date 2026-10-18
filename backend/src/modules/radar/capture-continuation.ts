import type pg from 'pg'
import {captureError} from './capture-operation.js'
import {buildRadarDiscoveryScopes} from './search-configuration.js'
import type {RadarQueryable} from './capture-capacity.js'

type ContinuationCapture={
 id:string;organization_id:string;campaign_id:string;configuration_revision:number
 status:string;created_at:Date|string;lease_active?:boolean;discovery_reason?:string
 configuration_snapshot:{target_states:string[];search_configuration?:unknown}
}
export class RadarCaptureContinuationConsentRequired extends Error{
 readonly statusCode=409
 constructor(readonly continuationReceiptId:string){super('radar_capture_continuation_confirmation_required');this.name='RadarCaptureContinuationConsentRequired'}
}

// Caller holds campaign, then operation locks. No network calls in this transaction.
export async function inspectExpiredRadarCaptureContinuation(client:RadarQueryable,op:ContinuationCapture,lock=false){
 const stale=()=>captureError('radar_capture_continuation_confirmation_stale')
 const run=(await client.query(`SELECT id,status,input_payload,output_payload,error_message,completed_at
  FROM public.radar_enrichment_runs
  WHERE organization_id=$1 AND campaign_id=$2 AND provider='cnpja_advanced_search' AND started_at >= $3
  ORDER BY started_at DESC,id DESC LIMIT 1 ${lock?'FOR UPDATE':''}`,[op.organization_id,op.campaign_id,op.created_at])).rows[0]
 const input=run?.input_payload,output=run?.output_payload
 const proven=(op.status==='blocked'||op.status==='partial'&&['page_cap','query_cap'].includes(op.discovery_reason??''))&&!op.lease_active&&run?.status==='failed'&&!!run.completed_at
  &&input?.captureOperationId===op.id&&input.configurationRevision===op.configuration_revision
  &&output?.candidateCount===0&&output.discoveryOutcome==='rejected'&&output.httpStatus===400
  &&typeof input.pageToken==='string'&&/^[\w-]{1,256}$/.test(input.pageToken)
  &&typeof run.error_message==='string'&&/\btoken is invalid or expired\b/i.test(run.error_message)
  &&!output.captureContinuationRecovery
 if(!proven)return null
 const scopes=buildRadarDiscoveryScopes({targetStates:op.configuration_snapshot.target_states,
  searchConfiguration:op.configuration_snapshot.search_configuration,configurationRevision:op.configuration_revision})
  .filter(scope=>scope.state===input.regionalState&&(scope.city??null)===(input.regionalCity??null))
 if(scopes.length!==1)throw stale()
 const scope=scopes[0]
 const cursor=(await client.query(`SELECT next_token,running_until>NOW() AS lease_active FROM public.radar_regional_discovery_cursors
  WHERE organization_id=$1 AND campaign_id=$2 AND provider='cnpja_advanced_search' AND scope_key=$3 ${lock?'FOR UPDATE':''}`,
  [op.organization_id,op.campaign_id,scope.key])).rows[0]
 if(!cursor||cursor.lease_active||cursor.next_token!==input.pageToken)throw stale()
 return{receiptId:run.id as string,scopeKey:scope.key,scopeLabel:scope.label}
}
export async function recoverExpiredRadarCaptureContinuation(client:pg.PoolClient,op:ContinuationCapture,
 approval:{confirmed:boolean;requestId:string;approvedBy:string;continuationReceiptId?:string}):Promise<boolean>{
 const expired=await inspectExpiredRadarCaptureContinuation(client,op,true)
 if(!expired){if(approval.confirmed)throw captureError('radar_capture_continuation_confirmation_stale');return false}
 const scope={key:expired.scopeKey},run={id:expired.receiptId}
 if(approval.confirmed&&approval.continuationReceiptId!==run.id)throw captureError('radar_capture_continuation_confirmation_stale')
 if(!approval.confirmed)throw new RadarCaptureContinuationConsentRequired(run.id)
 await client.query(`UPDATE public.radar_regional_discovery_cursors
  SET next_token=NULL,completed=FALSE,lease_id=NULL,running_until=NULL,updated_at=NOW()
  WHERE organization_id=$1 AND campaign_id=$2 AND provider='cnpja_advanced_search' AND scope_key=$3`,
  [op.organization_id,op.campaign_id,scope.key])
 await client.query(`UPDATE public.radar_enrichment_runs SET output_payload=output_payload||jsonb_build_object('captureContinuationRecovery',
  jsonb_build_object('operationId',$2::text,'requestId',$3::text,'approvedBy',$4::text,'scopeKey',$5::text,'recoveredAt',NOW())),updated_at=NOW()
  WHERE id=$1 AND organization_id=$6`,[run.id,op.id,approval.requestId,approval.approvedBy,scope.key,op.organization_id])
 return true
}
