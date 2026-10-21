import {decisionResultSchema} from './decision-contracts.js';

const record=(value:unknown):Record<string,unknown>=>value!==null&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
const choices=['compatible','weak_fit','outside_profile','plausible_needs_evidence','needs_evidence','investigate'];

/** Never borrow a different request's result or today's calibration for an old
 * event. Historical receipts may lack a result: unknown is not probability zero. */
export function radarFunnelReportDecision(event:{gate:string;mode:string;decision_request_id?:string;would_block:boolean},calls:unknown,output:unknown){
 const versions=Object.values(record(calls)).flatMap(value=>{const call=record(value);return[call,...(Array.isArray(call.previous)?call.previous.map(record):[])]});
 const call=versions.find(value=>event.decision_request_id&&value.requestId===event.decision_request_id&&value.source==='openrouter_decision');
 const parsed=decisionResultSchema.safeParse(call?.result);
 const task=event.gate==='g1'?'radar_initial_triage':event.gate==='g5'?'radar_fit_gate':undefined;
 const result=parsed.success&&parsed.data.task===task&&parsed.data.status==='decided'?parsed.data:null;
 const probabilities=result?.probabilities?Object.fromEntries(Object.entries(result.probabilities).filter(([key])=>choices.includes(key))):null;
 const funnel=record(record(output).funnel),snapshot=record(event.gate==='g1'?funnel.initial:event.gate==='g5'?funnel.fit:undefined);
 const threshold=event.decision_request_id&&snapshot.requestId===event.decision_request_id&&typeof snapshot.threshold==='number'&&Number.isFinite(snapshot.threshold)&&snapshot.threshold>=0&&snapshot.threshold<=1?snapshot.threshold:null;
 const wouldBlock=task&&(event.mode==='enforce'||result&&threshold!==null)?event.would_block:null;
 return{probabilities,selectedProbability:result?.choice?probabilities?.[result.choice]??null:null,outsideProbability:probabilities?.outside_profile??null,threshold,wouldBlock};
}
export function summarizeRadarFunnelOutcomes(companies:Array<{blocking:{stage:string;reason:string}|null;path:Array<{gate:string;outcome:string;wouldBlock:boolean|null}>}>){
 const blocks=new Map<string,{stage:string;reason:string;count:number}>(),classes=new Map<string,{gate:string;classification:string;count:number}>();
 const counterfactual={evaluable:0,notEvaluable:0,wouldBlock:0};
 for(const company of companies){
  if(company.blocking){const key=JSON.stringify(company.blocking),prior=blocks.get(key);blocks.set(key,{...company.blocking,count:(prior?.count??0)+1})}
  const latest=new Map(company.path.filter(step=>step.gate==='g1'||step.gate==='g5').map(step=>[step.gate,step]));
  for(const step of latest.values()){
   const classification=choices.includes(step.outcome)?step.outcome:step.outcome==='human_override'?'human_override':'unavailable';
   const key=`${step.gate}:${classification}`,prior=classes.get(key);classes.set(key,{gate:step.gate,classification,count:(prior?.count??0)+1});
   if(step.wouldBlock===null)counterfactual.notEvaluable++;else{counterfactual.evaluable++;if(step.wouldBlock)counterfactual.wouldBlock++}
  }
 }
 return{blocksByReason:[...blocks.values()].sort((a,b)=>a.stage.localeCompare(b.stage)||a.reason.localeCompare(b.reason)),classifications:[...classes.values()].sort((a,b)=>a.gate.localeCompare(b.gate)||a.classification.localeCompare(b.classification)),counterfactual};
}
