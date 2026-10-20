import {it,expect} from 'vitest'
import {resolveRadarSearchCapacity,estimateRadarSearchCapacity} from '../src/modules/radar/search-capacity.js'
import {resolveRadarSearchConfiguration} from '../src/modules/radar/search-configuration.js'
import {validateRadarOperationalConfiguration,defaultRadarOperationalLimits} from '../src/modules/radar/operational-limits.js'

it('counts uncertain search attempts conservatively without consuming other sources or AI capacity',()=>{
  const capacity=resolveRadarSearchCapacity({policy:{maxSearchQueriesPerCandidate:2},calls:{
    a:{source:'serper_web_search',status:'reserved'},b:{source:'serper_web_search',status:'completed'},
    c:{source:'brave_web_search',status:'rejected_before_provider'},d:{source:'radar_presence_resolution',status:'reserved'},
  }})
  expect(capacity).toMatchObject({bySource:{serper_web_search:{used:2,remaining:0},brave_web_search:{used:0,remaining:2},brave_place_search:{used:0,remaining:2}},totalRemaining:null})
})
it('increasing an existing intent from three to five leaves only two new calls after three consumed',()=>{
 const calls=Object.fromEntries(Array.from({length:8},(_,i)=>[`call-${i}`,{source:'brave_web_search',status:'completed'}]))
 const baselineKeys=Object.keys(calls).slice(0,5)
 expect(resolveRadarSearchCapacity({calls,policy:{maxSearchQueriesPerCandidate:5},intent:{baselineKeys,policy:{maxSearchQueriesPerCandidate:5}}}).bySource.brave_web_search).toMatchObject({used:3,remaining:2})
})
it('gives an explicitly requested update an incremental allowance per source, without deleting earlier effects',()=>{
 const calls=Object.fromEntries(Array.from({length:5},(_,index)=>[`old-${index}`,{source:'serper_web_search',status:'completed'}]))
 const policy={maxSearchQueriesPerCandidate:3}
 const capacity=resolveRadarSearchCapacity({calls,policy,intent:{baselineKeys:Object.keys(calls),policy}} as never)
 expect(capacity.bySource.serper_web_search.remaining).toBe(3)
 expect(capacity.bySource.serper_web_search.used).toBe(0)
 expect(Object.keys(calls)).toHaveLength(5)
 const next=resolveRadarSearchCapacity({calls:{...calls,new:{source:'serper_web_search',status:'reserved'}},policy,intent:{baselineKeys:Object.keys(calls),policy}} as never)
 expect(next.bySource.serper_web_search).toMatchObject({used:1,remaining:2})
})
it('applies only an explicitly configured aggregate cap to the conservative cost reservation',()=>{
  expect(estimateRadarSearchCapacity([{sourceType:'brave_web_search',available:true,maximumQueries:2,costPerQuery:.02},
    {sourceType:'serper_web_search',available:true,maximumQueries:4,costPerQuery:.01}],3)).toEqual({maxQueriesPerCandidate:3,maximumCostPerCandidate:.05})
})
it('validates source overrides against known search sources and the editable Admin ceiling',()=>{
  expect(()=>resolveRadarSearchConfiguration({research:{maxSearchQueriesBySource:{unknown_search:10}}})).toThrow()
  const configured=resolveRadarSearchConfiguration({research:{maxSearchQueriesBySource:{serper_web_search:20,brave_web_search:0},maxSearchQueriesTotalPerCandidate:null}})
  expect(()=>validateRadarOperationalConfiguration(configured,defaultRadarOperationalLimits)).toThrow('radar_operational_limit_exceeded')
  expect(()=>validateRadarOperationalConfiguration(configured,{...defaultRadarOperationalLimits,maxSearchQueriesPerCompany:20})).not.toThrow()
})
