import {expect,it} from 'vitest';
import {radarFunnelReportDecision,summarizeRadarFunnelOutcomes} from '../src/modules/radar/funnel-report-summary.js';
it('counts evidence-needed decisions as a real classification, not provider failure',()=>{
 expect(summarizeRadarFunnelOutcomes([{blocking:null,path:[{gate:'g5',outcome:'needs_evidence',wouldBlock:null}]}]).classifications).toEqual([{gate:'g5',classification:'needs_evidence',count:1}]);
});
it('does not borrow an unrelated receipt or a current threshold for a historical request',()=>{
 expect(radarFunnelReportDecision({gate:'g1',mode:'shadow',decision_request_id:'old',would_block:false},{current:{source:'openrouter_decision',requestId:'current',result:{probabilities:{outside_profile:1}}}},{funnel:{initial:{requestId:'current',threshold:.99}}})).toMatchObject({selectedProbability:null,outsideProbability:null,wouldBlock:null,threshold:null});
});
