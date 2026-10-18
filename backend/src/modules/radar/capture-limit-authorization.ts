import type pg from 'pg'
import type {AuthUser} from '../../auth/routes.js'
import {captureError} from './capture-operation.js'
import {loadRadarCapturePreflight,type PreflightDependencies} from './capture-preflight.js'
import {calculateRadarCaptureCapacity,type CaptureAccountingInput,type RadarCaptureLimits} from './capture-capacity.js'
import {radarSearchConfigurationSchema} from './search-configuration.js'
import {findRadarDataSource,evaluateRadarSourceGovernance} from './repository.js'
import {assertRadarOperationalLimit} from './operational-limits.js'
export const radarCaptureLimitsSchema=radarSearchConfigurationSchema.shape.batch.unwrap().pick({pageSize:true,maxPagesPerScope:true,maxQueriesPerBatch:true}).required().strict()
// Campaign and operation are locked by the caller; cursor locks make the consent check and application indivisible.
export async function authorizeRadarCaptureLimits(client:pg.PoolClient,user:AuthUser,op:CaptureAccountingInput&{requested_count:number},input:{requestId:string;expectedStateId:string;limits:RadarCaptureLimits},deps:PreflightDependencies={}){
 const limits=radarCaptureLimitsSchema.parse(input.limits)
 await client.query("SELECT scope_key FROM public.radar_regional_discovery_cursors WHERE organization_id=$1 AND campaign_id=$2 AND provider='cnpja_advanced_search' ORDER BY scope_key FOR UPDATE",[op.organization_id,op.campaign_id])
 const state=await loadRadarCapturePreflight(client,user,{organizationId:op.organization_id,campaignId:op.campaign_id,configurationRevision:op.configuration_revision,requestedCount:op.requested_count,operationId:op.id},deps)
 const p=state.preflight
 if(p.stateId!==input.expectedStateId)throw captureError('radar_capture_limits_confirmation_stale')
 if(!p.allowed)throw captureError(p.blockers[0]?.code??'radar_capture_research_unavailable')
 assertRadarOperationalLimit(limits.pageSize,state.policy.limits.maxDiscoveryPageSize)
 assertRadarOperationalLimit(limits.maxPagesPerScope,state.policy.limits.maxPagesPerScope)
 assertRadarOperationalLimit(limits.maxQueriesPerBatch,state.policy.limits.maxDiscoveryQueriesPerLot)
 const capacity=calculateRadarCaptureCapacity({limits,remaining:p.remaining,attemptedQueries:p.attemptedQueries,scopes:state.scopes,successfulPagesByScope:p.successfulPagesByScope,usableOverflowCount:state.overflowCount})
 if(capacity.optimisticAdditionalCapacity<p.remaining)throw captureError('radar_capture_capacity_insufficient')
 if(capacity.minimumAdditionalQueries>0){
  const source=await findRadarDataSource(client as unknown as pg.Pool,op.organization_id,'cnpja_advanced_search')
  const governance=await evaluateRadarSourceGovernance(client,op.organization_id,op.campaign_id,source,capacity.minimumAdditionalQueries,capacity.minimumAdditionalQueries*Math.ceil(limits.pageSize/10))
  if(!governance.allowed)throw captureError(governance.issues[0]?.code??'radar_capture_source_unavailable')
 }
 await client.query(`INSERT INTO public.radar_capture_limit_authorizations(organization_id,campaign_id,operation_id,request_id,approved_by,expected_state_id,old_limits,new_limits,counters)
  VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[op.organization_id,op.campaign_id,op.id,input.requestId,user.id,input.expectedStateId,JSON.stringify(p.limits),JSON.stringify(limits),JSON.stringify({attemptedQueries:p.attemptedQueries,successfulPagesByScope:p.successfulPagesByScope,remaining:p.remaining})])
 await client.query(`UPDATE public.radar_capture_operations SET configuration_snapshot=jsonb_set(configuration_snapshot,'{search_configuration,batch}',(configuration_snapshot#>'{search_configuration,batch}')||$3::jsonb),updated_at=NOW() WHERE id=$1 AND organization_id=$2`,[op.id,op.organization_id,JSON.stringify(limits)])
}
