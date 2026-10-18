import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {it,expect,vi} from 'vitest'
import {radarService} from '@/services/radarService'
import {radarPolicyFixture} from '@/test/fixtures/radarOperationalPolicy'
import {publishRadarOperationalPolicy,useRadarOperationalPolicy} from './useRadarOperationalPolicy'
import type {RadarOperationalPolicy} from '@/types/radarResearch'
function Probe(){const {policy,error}=useRadarOperationalPolicy(true);return <output>{policy?.version??error}</output>}
it.each(['stale','failure'])('deduplicates policy reads without replacing a newly saved version with %s',async mode=>{
 let resolve!:(policy:RadarOperationalPolicy)=>void,reject!:(error:Error)=>void
 const load=vi.spyOn(radarService,'getOperationalPolicy').mockImplementation(()=>new Promise((yes,no)=>{resolve=yes;reject=no}))
 const host=document.createElement('div'),root=createRoot(host)
 try{
  await act(async()=>root.render(<><Probe/><Probe/></>));expect(load).toHaveBeenCalledTimes(1)
  await act(async()=>publishRadarOperationalPolicy({...radarPolicyFixture,version:2}))
  await act(async()=>{if(mode==='stale')resolve(radarPolicyFixture);else reject(Error('old read failed'))})
  expect([...host.querySelectorAll('output')].map(node=>node.textContent)).toEqual(['2','2'])
 }finally{act(()=>root.unmount());vi.restoreAllMocks()}
})
