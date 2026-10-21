import {describe,expect,it} from 'vitest'
import * as states from '../src/modules/radar/capture-research-state.js'
import {summarizeRadarCaptureItems} from '../src/modules/radar/capture-reconciliation.js'

const assess=(run:Record<string,unknown>)=>(states as any).assessRadarFunnelResearch(run)
describe('terminal commercial research outcomes',()=>{
 it('finishes an explicit commercial exclusion without calling it a technical failure',()=>{
  expect(assess({status:'partial',output:{decisionExcluded:true}})).toEqual({outcome:'out_of_profile',retryable:false})
 })
 it('finishes missing public identity as explained gaps, but preserves uncertain billing as retryable',()=>{
  expect(assess({status:'partial',output:{siteAssociation:'review',limitations:['radar_qualification_waiting_identity']}})).toMatchObject({outcome:'completed_with_gaps',retryable:false})
  expect(assess({status:'partial',calls:{semantic:{status:'uncertain'}}})).toMatchObject({outcome:'technical_failure',retryable:true,reason:'radar_research_call_uncertain'})
 })
 it('does not finalize queued work or hide a provider failure behind a missing site',()=>{
  expect(assess({status:'queued'})).toEqual({outcome:null,retryable:false})
  expect(assess({status:'blocked',error_code:'provider_inactive'})).toMatchObject({outcome:'technical_failure',retryable:true,reason:'provider_inactive'})
 })
 it('closes a lot with exclusions and explained gaps instead of keeping its active slot blocked',()=>{
  const op={requested_count:3,discovery_stopped:true,discovery_reason:'target_reached',blockers:[]}
  const items:Array<{status:string;funnel_outcome:states.RadarFunnelOutcome;blocker?:string}>=[{status:'completed',funnel_outcome:'completed'},{status:'insufficient',funnel_outcome:'completed_with_gaps'},{status:'blocked',funnel_outcome:'out_of_profile',blocker:'old_commercial_exclusion'}]
  expect(summarizeRadarCaptureItems(op,items)).toEqual({status:'completed',blockers:[]})
  expect(summarizeRadarCaptureItems(op,[...items.slice(0,2),{status:'blocked',funnel_outcome:'technical_failure',blocker:'radar_research_call_uncertain'}])).toEqual({status:'blocked',blockers:['radar_research_call_uncertain']})
 })
})
