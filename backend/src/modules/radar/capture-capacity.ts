import type pg from 'pg'
import {buildRadarDiscoveryScopes,type RadarSearchConfiguration} from './search-configuration.js'
export type RadarQueryable=Pick<pg.Pool,'query'>
export type RadarCaptureLimits=Pick<RadarSearchConfiguration['batch'],'pageSize'|'maxPagesPerScope'|'maxQueriesPerBatch'>
export type CaptureAccountingInput={id:string;organization_id:string;campaign_id:string;configuration_revision:number;queries:number;scope_pages:Record<string,number>;configuration_snapshot:{target_states:string[];search_configuration:unknown}}
export async function loadRadarCapturePageAccounting(client:RadarQueryable,op:CaptureAccountingInput){
 const rows=(await client.query(`SELECT status,input_payload,output_payload,completed_at FROM public.radar_enrichment_runs
  WHERE organization_id=$1 AND campaign_id=$2 AND provider='cnpja_advanced_search' AND input_payload->>'captureOperationId'=$3`,[op.organization_id,op.campaign_id,op.id])).rows
 const scopes=buildRadarDiscoveryScopes({targetStates:op.configuration_snapshot.target_states,configurationRevision:op.configuration_revision,searchConfiguration:op.configuration_snapshot.search_configuration})
 const successfulPagesByScope:Record<string,number>={};let attempts=0,historyCertain=true
 for(const row of rows){
  if(row.status!=='succeeded'&&!row.output_payload?.discoveryOutcome&&row.status!=='running')continue // Governance rejected before a request reservation.
  attempts++
  const input=row.input_payload,matching=scopes.filter(scope=>scope.state===input.regionalState&&(scope.city??null)===(input.regionalCity??null))
  if(input.configurationRevision!==op.configuration_revision||matching.length!==1||input.scopeKey&&input.scopeKey!==matching[0].key||!row.completed_at||row.status==='running'){historyCertain=false;continue}
  if(row.status==='succeeded')successfulPagesByScope[matching[0].key]=(successfulPagesByScope[matching[0].key]??0)+1
 }
 return{successfulPagesByScope,historyCertain:historyCertain&&attempts===op.queries}
}
export function calculateRadarCaptureCapacity(input:{limits:RadarCaptureLimits;remaining:number;attemptedQueries:number;scopes:Array<{key:string;completed:boolean}>;successfulPagesByScope:Record<string,number>;usableOverflowCount:number}){
 const queries=Math.max(0,input.limits.maxQueriesPerBatch-input.attemptedQueries),unfinished=input.scopes.filter(scope=>!scope.completed)
 const pages=unfinished.reduce((n,scope)=>n+Math.max(0,input.limits.maxPagesPerScope-(input.successfulPagesByScope[scope.key]??0)),0)
 return{optimisticAdditionalCapacity:Math.min(input.remaining,Math.max(0,input.usableOverflowCount)+Math.min(queries,pages)*input.limits.pageSize),
  minimumAdditionalQueries:Math.ceil(Math.max(0,input.remaining-input.usableOverflowCount)/input.limits.pageSize),
  exhausted:queries===0?'query_cap' as const:unfinished.length>0&&pages===0?'page_cap' as const:null}
}
