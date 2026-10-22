import {z} from 'zod';
import type pg from 'pg';
import type {AuthUser} from '../../auth/routes.js';
import {resolveRadarSearchConfiguration} from './search-configuration.js';
import {evaluateRadarRegistryRules} from './registry-gate.js';
import {radarDecisionHash} from './decision-service.js';
import {radarScopedFunnelOverrides} from './funnel-gate-application.js';
import {summarizeRadarFunnelCosts} from './funnel-costs.js';
import {radarFunnelReportDecision,summarizeRadarFunnelOutcomes} from './funnel-report-summary.js';
import {assessRadarCaptureResearch} from './capture-research-state.js';

const scope=z.object({organizationId:z.uuid(),campaignId:z.uuid()}).strict();
const fail=(code:string,statusCode=409)=>Object.assign(Error(code),{statusCode});
function admin(user:AuthUser){if(user.role!=='yux_admin')throw fail('radar_source_admin_required',403)}
export async function getRadarFunnelReport(pool:pg.Pool,user:AuthUser,value:unknown){
 admin(user);const input=scope.extend({operationId:z.uuid().optional()}).strict().parse(value);
 const campaign=(await pool.query('SELECT * FROM radar_campaigns WHERE id=$1 AND organization_id=$2',[input.campaignId,input.organizationId])).rows[0];
 if(!campaign)throw fail('radar_campaign_not_found',404);
 const configuration=resolveRadarSearchConfiguration(campaign.search_configuration);
 const lots=(await pool.query(`SELECT id,requested_count AS requested,status,created_at AS "createdAt" FROM radar_capture_operations WHERE campaign_id=$1 AND organization_id=$2 AND configuration_revision=$3 AND historical_closed_at IS NULL ORDER BY created_at DESC,id DESC LIMIT 100`,[input.campaignId,input.organizationId,campaign.configuration_revision])).rows;
 if(input.operationId&&!lots.some(lot=>lot.id===input.operationId))throw fail('radar_capture_not_found',404);
 const rows=(await pool.query(`SELECT candidate.id,candidate.title,candidate.normalized_payload,run.id AS run_id,run.status AS run_status,run.stage AS run_stage,run.error_code,run.funnel_outcome,run.output,run.calls,run.historical_closed_at,selected.status AS item_status,selected.funnel_outcome AS item_outcome,selected.initial_gate_status AS item_initial_status,selected.blocker AS item_blocker FROM radar_candidate_records candidate LEFT JOIN radar_capture_items selected ON selected.candidate_id=candidate.id AND selected.organization_id=candidate.organization_id AND selected.operation_id=$3 LEFT JOIN LATERAL(SELECT * FROM radar_candidate_research_runs WHERE candidate_id=candidate.id AND organization_id=candidate.organization_id AND ($3::uuid IS NULL OR id=selected.run_id) ORDER BY created_at DESC,id DESC LIMIT 1) run ON TRUE WHERE candidate.campaign_id=$1 AND candidate.organization_id=$2 AND ($3::uuid IS NULL OR selected.id IS NOT NULL) ORDER BY candidate.created_at,candidate.id`,[input.campaignId,input.organizationId,input.operationId??null])).rows;
 const admissions=(await pool.query(`SELECT item.candidate_id,item.run_id,item.operation_id FROM radar_capture_items item JOIN radar_capture_operations lot ON lot.id=item.operation_id AND lot.organization_id=item.organization_id WHERE lot.campaign_id=$1 AND lot.organization_id=$2 AND lot.configuration_revision=$3`,[input.campaignId,input.organizationId,campaign.configuration_revision])).rows;
 const events=(await pool.query('SELECT * FROM radar_funnel_events WHERE campaign_id=$1 AND organization_id=$2 ORDER BY created_at,id',[input.campaignId,input.organizationId])).rows;
 const audits=(await pool.query('SELECT event_id,outcome,reason,created_at FROM radar_funnel_block_audits WHERE campaign_id=$1 AND organization_id=$2',[input.campaignId,input.organizationId])).rows;
 const labels=(await pool.query('SELECT dataset FROM radar_campaign_gate_calibrations WHERE campaign_id=$1 AND organization_id=$2 AND configuration_revision=$3 ORDER BY created_at,id',[input.campaignId,input.organizationId,campaign.configuration_revision])).rows;
 const positives=new Set<string>();for(const row of labels)for(const label of row.dataset)if(label.label==='primary'||label.label==='secondary')positives.add(label.candidateId);
 const companies=rows.map(row=>{
  const payload=row.normalized_payload;
  const gate=row.output?.decisionExcluded===true?row.output.funnel?.blockedGate:input.operationId?(!row.run_id&&row.item_outcome==='out_of_profile'&&row.item_initial_status==='block'?'g0':undefined):!row.run_id&&payload.decisionExclusion?.active?payload.decisionExclusion.gate:undefined;
  const registry=evaluateRadarRegistryRules({payload,targetCnaes:campaign.target_cnaes,configuration});
  const previewBlocked=registry.outcome==='block'&&!radarScopedFunnelOverrides(payload).some(item=>item.gate==='g0'&&item.configurationRevision===campaign.configuration_revision);
  const path=events.filter(event=>event.candidate_id===row.id&&event.configuration_revision===campaign.configuration_revision&&
   (event.run_id?event.run_id===row.run_id:input.operationId?event.event_key===`admission:${input.operationId}`:admissions.some(item=>item.candidate_id===row.id&&item.run_id===row.run_id&&event.event_key===`admission:${item.operation_id}`))).map(event=>{
   const criteria=event.gate==='g1'||event.gate==='g5'?configuration.funnel[event.gate as 'g1'|'g5'].criteria:null;
   const count=events.filter(other=>other.gate===event.gate&&other.configuration_revision===event.configuration_revision&&other.created_at<=event.created_at&&other.mode==='enforce'&&other.would_block).length;
   const rate=criteria?(count<=100?criteria.auditSampleRate:criteria.auditSampleRateSteady):0;
   const sampled=event.mode==='enforce'&&event.would_block&&event.outcome==='outside_profile'&&parseInt(radarDecisionHash({candidateId:row.id,gate:event.gate,revision:event.configuration_revision}).slice(0,8),16)/0x100000000<rate;
   return{id:event.id,gate:event.gate,mode:event.mode,outcome:event.outcome,reason:event.reason_code,evidenceIds:event.evidence_ids,requestId:event.decision_request_id,estimatedBrl:event.cost_estimate_brl,sampled,audit:audits.find(audit=>audit.event_id===event.id)??null,...radarFunnelReportDecision(event as {gate:string;mode:string;decision_request_id?:string;would_block:boolean},row.calls,row.output)};
  });
  const assessment=row.run_id?assessRadarCaptureResearch({status:row.run_status,stage:row.run_stage,error_code:row.error_code,calls:row.calls,output:row.output}):undefined;
  const operational=assessment?.status==='blocked'?assessment:undefined;
  const reason=[...path].reverse().find(event=>event.gate===gate)?.reason??row.error_code??operational?.reason??row.item_blocker??row.output?.limitations?.[0]??(!input.operationId&&!row.run_id?payload.triageReasons?.[0]:undefined);
  const manuallyDiscarded=!gate&&row.item_outcome==='out_of_profile'&&row.item_status==='completed'&&!payload.decisionExclusion?.active;
  const blocking=manuallyDiscarded?null:gate?{stage:gate,reason:reason??'unknown'}:row.funnel_outcome==='technical_failure'||row.item_outcome==='technical_failure'||row.run_status==='blocked'||row.run_status==='failed'||row.item_status==='blocked'?{stage:operational?.stage??row.run_stage??'research',reason:reason??'unknown'}:null;
  return{id:row.id,name:row.title,runId:row.run_id,outcome:row.item_outcome??row.funnel_outcome,qualificationStatus:row.output?.qualification?.targetStatus,gate,blocking,reviewRequested:!!payload.funnelReviewRequest&&!payload.funnelReviewRequest.handledAt,reason,currentReview:{gate:payload.decisionExclusion?.active?payload.decisionExclusion.gate:null,reason:payload.triageReasons?.[0]??null},registryPreview:{...registry,blocked:previewBlocked,verifiedPositive:positives.has(row.id)},path,
   emailSignal:row.output?.funnel?.emailSignal,agentUsed:row.output?.funnel?.agentAttempted===true,weakFit:row.output?.funnel?.initial?.action==='short_investigation'||row.output?.funnel?.fit?.action==='short_investigation',historical:!!row.historical_closed_at};
 });
 const totals={examined:companies.length,outside:companies.filter(row=>row.outcome==='out_of_profile'||row.gate).length,completed:companies.filter(row=>row.outcome==='completed').length,completedWithGaps:companies.filter(row=>row.outcome==='completed_with_gaps').length,technicalFailures:companies.filter(row=>row.outcome==='technical_failure').length};
 const allRuns=(await pool.query('SELECT id,calls FROM radar_candidate_research_runs run WHERE organization_id=$1 AND campaign_id=$2 AND ($3::uuid IS NULL OR EXISTS(SELECT 1 FROM radar_capture_items item WHERE item.operation_id=$3 AND item.run_id=run.id AND item.organization_id=$1))',[input.organizationId,input.campaignId,input.operationId??null])).rows;
 return{configurationRevision:campaign.configuration_revision,lots,operationId:input.operationId??null,totals,summary:summarizeRadarFunnelOutcomes(companies),costs:summarizeRadarFunnelCosts(allRuns as Array<{id:string;calls:unknown}>),preview:{blocked:companies.filter(row=>row.registryPreview.blocked).length,verifiedPositives:companies.filter(row=>row.registryPreview.verifiedPositive).length,falseBlocks:companies.filter(row=>row.registryPreview.blocked&&row.registryPreview.verifiedPositive).length},companies};
}
export async function auditRadarFunnelBlock(pool:pg.Pool,user:AuthUser,value:unknown){
 admin(user);const input=scope.extend({eventId:z.uuid(),outcome:z.enum(['confirmed_outside','false_block','uncertain']),reason:z.string().trim().min(3).max(1000)}).strict().parse(value),db=await pool.connect();
 try{
  await db.query('BEGIN');
  const campaign=(await db.query('SELECT * FROM radar_campaigns WHERE id=$1 AND organization_id=$2 FOR UPDATE',[input.campaignId,input.organizationId])).rows[0];
  const event=(await db.query(`SELECT * FROM radar_funnel_events WHERE id=$1 AND campaign_id=$2 AND organization_id=$3 AND gate IN('g1','g5') AND mode='enforce' AND would_block AND outcome='outside_profile'`,[input.eventId,input.campaignId,input.organizationId])).rows[0];
  if(!campaign||!event||event.configuration_revision!==campaign.configuration_revision)throw fail('radar_audit_event_not_current');
  const prior=(await db.query('SELECT outcome,reason FROM radar_funnel_block_audits WHERE event_id=$1',[input.eventId])).rows[0];
  if(prior&&(prior.outcome!==input.outcome||prior.reason!==input.reason))throw fail('radar_audit_already_recorded');
  await db.query(`INSERT INTO radar_funnel_block_audits(organization_id,campaign_id,event_id,outcome,reason,reviewed_by) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(event_id) DO NOTHING`,[input.organizationId,input.campaignId,input.eventId,input.outcome,input.reason,user.id]);
  const criteria=resolveRadarSearchConfiguration(campaign.search_configuration).funnel[event.gate as 'g1'|'g5'].criteria;
  const falseBlocks=Number((await db.query(`SELECT COUNT(*)::int AS total FROM radar_funnel_block_audits audit JOIN radar_funnel_events event ON event.id=audit.event_id WHERE audit.organization_id=$1 AND audit.campaign_id=$2 AND event.configuration_revision=$3 AND event.gate=$4 AND audit.outcome='false_block'`,[input.organizationId,input.campaignId,campaign.configuration_revision,event.gate])).rows[0].total);
  if(falseBlocks>=criteria.autoShadowOnReversedAudits)await db.query(`UPDATE radar_campaign_gate_calibrations SET status='auto_shadowed',updated_at=NOW() WHERE organization_id=$1 AND campaign_id=$2 AND configuration_revision=$3 AND gate=$4 AND status='approved'`,[input.organizationId,input.campaignId,campaign.configuration_revision,event.gate]);
  await db.query('COMMIT');return{recorded:true,requiresReopening:input.outcome==='false_block'};
 }catch(cause){await db.query('ROLLBACK');throw cause}finally{db.release()}
}
