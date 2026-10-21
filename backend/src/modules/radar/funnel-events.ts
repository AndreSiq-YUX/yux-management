import type pg from 'pg'
export type RadarFunnelEvent={organizationId:string;campaignId:string;candidateId:string;runId?:string;configurationRevision:number;gate:'g0'|'g1'|'g3'|'g5'|'e2'|'e6';mode:'off'|'shadow'|'enforce'|'effective';outcome:string;wouldBlock?:boolean;reasonCode?:string;evidenceIds?:string[];decisionRequestId?:string;eventKey:string;costEstimateBrl?:number}
export async function recordRadarFunnelEvent(db:Pick<pg.Pool,'query'>,event:RadarFunnelEvent){
 await db.query(`INSERT INTO public.radar_funnel_events(organization_id,campaign_id,candidate_id,run_id,configuration_revision,gate,mode,outcome,would_block,reason_code,evidence_ids,decision_request_id,event_key,cost_estimate_brl)
  VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13,$14) ON CONFLICT(organization_id,candidate_id,configuration_revision,gate,event_key) DO NOTHING`,[event.organizationId,event.campaignId,event.candidateId,event.runId??null,event.configurationRevision,event.gate,event.mode,event.outcome,event.wouldBlock??false,event.reasonCode??null,JSON.stringify(event.evidenceIds??[]),event.decisionRequestId??null,event.eventKey,event.costEstimateBrl??null])
}
