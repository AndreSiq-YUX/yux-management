import type pg from 'pg'
import type {RadarSearchConfiguration} from './search-configuration.js'
import {evaluateRadarRegistryRules} from './registry-gate.js'
import {recordRadarFunnelEvent} from './funnel-events.js'
export async function applyRadarRegistryAdmission(db:Pick<pg.Pool,'query'>,input:{organizationId:string;campaignId:string;candidateId:string;operationId:string;revision:number;configuration:RadarSearchConfiguration;targetCnaes:string[];payload:unknown}){
 const config=input.configuration
 if(!config.funnel.enabled)return{blocked:false,initialStatus:null}
 const result=evaluateRadarRegistryRules({payload:input.payload,targetCnaes:input.targetCnaes,configuration:config})
 const blocked=config.funnel.g0.mode==='enforce'&&result.outcome==='block'
 const initialStatus=blocked?'block':config.funnel.g1.mode==='enforce'?'pending':'pass'
 const funnel={initialStatus,registry:result}
 await db.query(`UPDATE public.radar_candidate_records SET normalized_payload=normalized_payload||$3::jsonb WHERE id=$1 AND organization_id=$2`,[input.candidateId,input.organizationId,JSON.stringify({funnel,...(blocked?{targetStatus:'not_target',productFit:'low',triageReasons:[result.reasonPt],decisionExclusion:{active:true,revision:input.revision,reason:'outside_profile',gate:'g0'}}:{})})])
 await db.query(`UPDATE public.radar_capture_items SET initial_gate_status=$4,initial_gate_reason=$5,status=CASE WHEN $6 THEN 'completed' ELSE status END,funnel_outcome=CASE WHEN $6 THEN 'out_of_profile' ELSE funnel_outcome END WHERE operation_id=$1 AND organization_id=$2 AND candidate_id=$3`,[input.operationId,input.organizationId,input.candidateId,initialStatus,result.rule??null,blocked])
 await recordRadarFunnelEvent(db,{organizationId:input.organizationId,campaignId:input.campaignId,candidateId:input.candidateId,configurationRevision:input.revision,gate:'g0',mode:config.funnel.g0.mode,outcome:config.funnel.g0.mode==='off'?'pass':result.outcome,reasonCode:config.funnel.g0.mode==='off'?undefined:result.rule,eventKey:`admission:${input.operationId}`,costEstimateBrl:0})
 return{blocked,initialStatus}
}
