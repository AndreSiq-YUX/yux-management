import type pg from 'pg'
import {buildRadarDiscoveryScopes,type RadarSearchConfiguration} from './search-configuration.js'
export type RadarQueryable=Pick<pg.Pool,'query'>
export type RadarCaptureLimits=Pick<RadarSearchConfiguration['batch'],'pageSize'|'maxPagesPerScope'|'maxQueriesPerBatch'>
export type CaptureAccountingInput={id:string;organization_id:string;campaign_id:string;configuration_revision:number;queries:number;scope_pages:Record<string,number>;configuration_snapshot:{target_states:string[];search_configuration:unknown}}
export async function loadRadarCapturePageAccounting(client:RadarQueryable,op:CaptureAccountingInput){
 const rows=(await client.query(`SELECT status,input_payload,output_payload,error_message,completed_at FROM public.radar_enrichment_runs
  WHERE organization_id=$1 AND campaign_id=$2 AND provider='cnpja_advanced_search'
  AND (input_payload->>'captureOperationId'=$3 OR output_payload->'captureRecovery'->>'operationId'=$3)`,[op.organization_id,op.campaign_id,op.id])).rows
 const scopes=buildRadarDiscoveryScopes({targetStates:op.configuration_snapshot.target_states,configurationRevision:op.configuration_revision,searchConfiguration:op.configuration_snapshot.search_configuration})
 const successfulPagesByScope:Record<string,number>={};let attempts=0,historyCertain=true
 for(const row of rows){
  const input=row.input_payload,output=row.output_payload,recovery=output?.captureRecovery
  // Earlier releases audited the explicit recovery in output only. That audit
  // proves a rejected attempt, not a successful page or permission to replay it.
  const auditedLegacy=!input?.captureOperationId&&recovery?.operationId===op.id
   &&recovery.reason==='legacy_validation_rejection'&&typeof recovery.recoveredAt==='string'&&Number.isFinite(Date.parse(recovery.recoveredAt))
   &&row.status==='failed'&&!!row.completed_at&&row.error_message==='request validation failed'
   &&output.candidateCount===0&&(!output.discoveryOutcome||output.discoveryOutcome==='rejected')
   &&Array.isArray(output.issues)&&output.issues.some((issue:{code?:string;sourceType?:string})=>issue?.code==='provider_failed'&&issue.sourceType==='cnpja_advanced_search')
  if(input?.captureOperationId!==op.id&&!auditedLegacy){historyCertain=false;continue}
  if(row.status==='failed'&&output?.discoveryOutcome==='not_dispatched')continue
  if(!auditedLegacy&&row.status!=='succeeded'&&!row.output_payload?.discoveryOutcome&&row.status!=='running')continue // Governance rejected before a request reservation.
  attempts++
  const matching=scopes.filter(scope=>scope.state===input.regionalState&&(scope.city??null)===(input.regionalCity??null))
  if(input.configurationRevision!==op.configuration_revision||matching.length!==1||input.scopeKey&&input.scopeKey!==matching[0].key||!row.completed_at||output?.discoveryOutcome==='uncertain'||row.status!=='succeeded'&&output?.discoveryOutcome!=='rejected'&&!auditedLegacy){historyCertain=false;continue}
  if(row.status==='succeeded')successfulPagesByScope[matching[0].key]=(successfulPagesByScope[matching[0].key]??0)+1
 }
 return{successfulPagesByScope,historyCertain:historyCertain&&attempts===Number(op.queries)}
}
export function calculateRadarCaptureCapacity(input:{limits:RadarCaptureLimits;remaining:number;attemptedQueries:number;scopes:Array<{key:string;completed:boolean;inheritedPageSize?:number}>;successfulPagesByScope:Record<string,number>;usableOverflowCount:number}){
 const queries=Math.max(0,input.limits.maxQueriesPerBatch-input.attemptedQueries),unfinished=input.scopes.filter(scope=>!scope.completed)
 const pages=unfinished.reduce((n,scope)=>n+Math.max(0,input.limits.maxPagesPerScope-(input.successfulPagesByScope[scope.key]??0)),0)
 const slots=unfinished.map(scope=>({pages:Math.max(0,input.limits.maxPagesPerScope-(input.successfulPagesByScope[scope.key]??0)),size:scope.inheritedPageSize??input.limits.pageSize})).sort((a,b)=>b.size-a.size)
 let availableQueries=queries,volume=0
 for(const slot of slots){const count=Math.min(availableQueries,slot.pages);volume+=count*slot.size;availableQueries-=count}
 const maximumPageSize=Math.max(input.limits.pageSize,...slots.map(slot=>slot.size))
 return{optimisticAdditionalCapacity:Math.min(input.remaining,Math.max(0,input.usableOverflowCount)+volume),
  minimumAdditionalQueries:Math.ceil(Math.max(0,input.remaining-input.usableOverflowCount)/maximumPageSize),
  exhausted:queries===0?'query_cap' as const:unfinished.length>0&&pages===0?'page_cap' as const:null}
}
