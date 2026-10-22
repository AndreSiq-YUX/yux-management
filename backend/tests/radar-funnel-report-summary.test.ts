import {expect,it} from 'vitest';
import {radarFunnelReportDecision,summarizeRadarFunnelOutcomes} from '../src/modules/radar/funnel-report-summary.js';
it('counts evidence-needed decisions as a real classification, not provider failure',()=>{
 expect(summarizeRadarFunnelOutcomes([{blocking:null,path:[{gate:'g5',outcome:'needs_evidence',wouldBlock:null}]}]).classifications).toEqual([{gate:'g5',classification:'needs_evidence',count:1}]);
});
it('summarizes validated commercial rejections separately from gate exclusions and incomplete analyses',()=>{
 const companies=[{blocking:null,path:[],qualificationStatus:'confirmed'},{blocking:null,path:[],qualificationStatus:'not_target'},{blocking:null,path:[],qualificationStatus:'review'},{blocking:null,path:[]}];
 expect(summarizeRadarFunnelOutcomes(companies).commercialQualifications).toEqual({confirmed:1,review:1,notTarget:1,insufficient:0,notCompleted:1});
});
it('does not borrow an unrelated receipt or a current threshold for a historical request',()=>{
 expect(radarFunnelReportDecision({gate:'g1',mode:'shadow',decision_request_id:'old',would_block:false},{current:{source:'openrouter_decision',requestId:'current',result:{probabilities:{outside_profile:1}}}},{funnel:{initial:{requestId:'current',threshold:.99}}})).toMatchObject({selectedProbability:null,outsideProbability:null,wouldBlock:null,threshold:null});
});
it('does not rewrite an uncalibrated event when the same cached request is reapplied after calibration',()=>{
 const decision={schemaVersion:1,task:'radar_initial_triage',status:'decided',choice:'compatible',reasonCode:'more_evidence_needed',evidenceIds:[],probabilities:{compatible:.8,outside_profile:.2},requestedModel:'fixture/model',resolvedModel:'fixture/model-v1',adapterVersion:'openrouter-decisions-alpha-v1',contextVersion:'radar-decision-context-v2',questionVersion:'radar-decisions-questions-v2',criteriaRubricVersion:'radar-decisions-rubric-v2',attempts:[],usage:{inputTokens:10,outputTokens:1,costUsd:0}};
 const calls={decision:{source:'openrouter_decision',requestId:'same-request',result:decision}};
 const snapshot={funnel:{initial:{requestId:'same-request',eventKey:'after-calibration',threshold:.95}}};
 const event={gate:'g1',mode:'shadow',decision_request_id:'same-request',would_block:false,event_key:'before-calibration'};
 expect(radarFunnelReportDecision(event,calls,snapshot)).toMatchObject({threshold:null,wouldBlock:null});
 expect(radarFunnelReportDecision({...event,event_key:'after-calibration'},calls,snapshot)).toMatchObject({threshold:.95,wouldBlock:false});
});
