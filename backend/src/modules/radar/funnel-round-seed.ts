import type { RadarSiteEvidence } from './site-evidence.js';
import type { RadarContactEvidence } from './contact-evidence.js';
import type { RadarWebHit } from './web-search.js';
import type { RadarEvidenceVersion } from './evidence-version.js';
import type { RadarFunnelResearchState } from './funnel-discovery.js';
/** Explicitly authorized capacity recovery, in the same run. Old effects and
 * their costs stay immutable; only the bounded decision allowance is renewed. */
export function prepareRadarDecisionRecovery<T extends {funnel?:RadarFunnelResearchState}>(output:T,calls:Record<string,{source?:string;round?:number}>,input:{requestId?:string;maximum:number}):T {
    const state=output.funnel,round=state?.decisionRound??0;
    if(!input.requestId||!state||state.decisionRecoveryRequestId===input.requestId)return output;
    const used=Object.values(calls).filter(call=>call.source==='openrouter_decision'&&(call.round??0)===round).length;
    if(used<input.maximum||state.fit?.reasonCode!=='decision_limit_reached')return output;
    return{...output,funnel:{...state,decisionRound:round+1,decisionRecoveryRequestId:input.requestId,decisionCalls:0,fit:undefined,stopReason:undefined}};
}
export function seedRadarFunnelRound<T extends Record<string,{status:string;requestId?:string;evidenceHash?:string}>>(previous:{id?:string;output:{pages?:RadarSiteEvidence[];contacts?:RadarContactEvidence[];discoveryHits?:RadarWebHit[];discovery?:{hits:RadarWebHit[]};analysisEvidence?:{presence?:RadarEvidenceVersion}};calls:T},freshnessDays:number,now=Date.now()){
    const fresh=(date:string)=>Number.isFinite(Date.parse(date))&&Date.parse(date)<=now&&now-Date.parse(date)<=freshnessDays*86400000;
    const pages=(previous.output.pages??[]).filter(page=>!page.limitation&&!!page.text&&fresh(page.observedAt));
    const urls=new Set(pages.map(page=>page.url));
    const contacts=(previous.output.contacts??[]).filter(contact=>urls.has(contact.sourceUrl)).map(contact=>({...contact,association:'review' as const,scope:'unresolved' as const,preferred:false}));
    const discoveryHits=[...(previous.output.discoveryHits??[]),...(previous.output.discovery?.hits??[])].filter(hit=>fresh(hit.observedAt));
    // Unknown effects keep their original request/receipt identity. Completed
    // conclusions and decision/Agent state are not carried into a new round.
    const calls=Object.fromEntries(Object.entries(previous.calls).filter(([,call])=>!['completed','rejected_before_provider'].includes(call.status)).map(([key,call])=>[key,(!call.requestId&&previous.id&&call.evidenceHash&&(key==='presence'||key==='semantic'))?{...call,requestId:`${previous.id}:${key==='presence'?'presence:':''}${call.evidenceHash}`}:call])) as T;
    return{output:{pages,contacts,discoveryHits,readingComplete:false,discoveryLocked:false,analysisEvidence:previous.output.analysisEvidence?.presence?{presence:previous.output.analysisEvidence.presence}:undefined},calls};
}
