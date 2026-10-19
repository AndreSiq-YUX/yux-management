import {expect,it} from 'vitest'

const api=await import('../src/modules/radar/capture-reconciliation.js').catch(()=>({})) as Record<string,any>
it('keeps admitted work running while discovery alone waits for capacity',()=>{
 const op={requested_count:20,discovery_stopped:true,discovery_reason:'page_cap',blockers:[]}
 expect(api.summarizeRadarCaptureItems(op,[{status:'researching'}])).toEqual({status:'researching',blockers:['radar_capture_page_limit']})
 expect(api.summarizeRadarCaptureItems(op,[{status:'completed'}])).toEqual({status:'blocked',blockers:['radar_capture_page_limit']})
})
it('rebuilds the parent from current children without dropping discovery or uncertain-call blockers',()=>{
 expect(api.summarizeRadarCaptureItems).toBeTypeOf('function')
 const op={requested_count:20,discovery_stopped:true,discovery_reason:'target_reached',blockers:['stale_child_reason']}
 const items=Array.from({length:20},(_,index)=>({status:index<5?'completed':index<10?'insufficient':'blocked',blocker:index>=10?'radar_research_call_uncertain':null}))
 expect(api.summarizeRadarCaptureItems(op,items)).toEqual({status:'blocked',blockers:['radar_research_call_uncertain']})
 expect(api.summarizeRadarCaptureItems({...op,discovery_reason:'page_cap',requested_count:25},items)).toEqual({status:'blocked',blockers:['radar_capture_page_limit','radar_research_call_uncertain']})
 expect(api.summarizeRadarCaptureItems({...op,discovery_stopped:false,blockers:['radar_capture_history_uncertain']},[{status:'researching'}])).toEqual({status:'blocked',blockers:['radar_capture_history_uncertain']})
})
