import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {afterEach,it,expect,vi} from 'vitest'
import {radarService} from '@/services/radarService'
const api=await import('./RadarOperationalLimitsPanel')
export const policyFixture={version:3,updatedBy:'admin',updatedAt:null,limits:{maxNewCompaniesPerLot:2000,maxPagesPerScope:30,maxDiscoveryQueriesPerLot:500,maxDiscoveryPageSize:25,maxVerificationBatch:80,maxSearchQueriesPerCompany:20,maxPublicPagesPerCompany:50,maxCampaignDailyQueries:5000,maxSourceDailyQueries:5000,maxResearchFreshnessDays:60,maxContinuationIdleMinutes:60}}
let clean=()=>{};afterEach(()=>{clean();vi.restoreAllMocks()})
it('saves the exact versioned ceiling without starting a search',async()=>{
 expect(api.RadarOperationalLimitsPanel).toBeTypeOf('function')
 vi.spyOn(radarService,'getOperationalPolicy').mockResolvedValue(policyFixture)
 const save=vi.spyOn(radarService,'updateOperationalPolicy').mockResolvedValue({...policyFixture,version:4,limits:{...policyFixture.limits,maxPagesPerScope:40}})
 const start=vi.spyOn(radarService,'startCaptureOperation')
 const host=document.body.appendChild(document.createElement('div')),root=createRoot(host)
 clean=()=>{act(()=>root.unmount());host.remove()}
 await act(async()=>root.render(<api.RadarOperationalLimitsPanel isAdmin/>))
 const input=host.querySelector<HTMLInputElement>('[name="maxPagesPerScope"]')!
 await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,'40');input.dispatchEvent(new Event('input',{bubbles:true}))})
 await act(async()=>host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})))
 expect(save).toHaveBeenCalledExactlyOnceWith({expectedVersion:3,limits:{...policyFixture.limits,maxPagesPerScope:40}})
 expect(start).not.toHaveBeenCalled();expect(host.textContent).toContain('salvos')
})
it('does not read or render policy for another audience',async()=>{
 expect(api.RadarOperationalLimitsPanel).toBeTypeOf('function')
 const load=vi.spyOn(radarService,'getOperationalPolicy')
 const host=document.body.appendChild(document.createElement('div')),root=createRoot(host)
 clean=()=>{act(()=>root.unmount());host.remove()}
 await act(async()=>root.render(<api.RadarOperationalLimitsPanel isAdmin={false}/>))
 expect(load).not.toHaveBeenCalled();expect(host.textContent).toBe('')
})
