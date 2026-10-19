import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {afterEach,it,expect,vi} from 'vitest'
import {radarService} from '@/services/radarService'
const api=await import('./RadarOperationalLimitsPanel')
export const policyFixture={version:3,updatedBy:'admin',updatedAt:null,limits:{maxNewCompaniesPerLot:2000,maxPagesPerScope:30,maxDiscoveryQueriesPerLot:500,maxDiscoveryPageSize:25,maxVerificationBatch:80,maxSearchQueriesPerCompany:20,maxPublicPagesPerCompany:50,maxCampaignDailyQueries:5000,maxSourceDailyQueries:5000,maxResearchFreshnessDays:60,maxContinuationIdleMinutes:60,maxDecisionCallsPerCompany:3,maxDeepSearchesPerCompany:1,maxFallbackAttemptsPerEffect:1}}
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
 expect(save).toHaveBeenCalledExactlyOnceWith({expectedVersion:3,limits:{...policyFixture.limits,maxPagesPerScope:40},costPolicy:{usdToBrl:null,rateAsOf:null,rateSource:'manual',marginPercent:'0'}})
 expect(start).not.toHaveBeenCalled();expect(host.textContent).toContain('salvos')
})
it('lets only system Admin set an explicit dated USD/BRL rate alongside the same policy version',async()=>{
 vi.spyOn(radarService,'getOperationalPolicy').mockResolvedValue(policyFixture)
 const save=vi.spyOn(radarService,'updateOperationalPolicy').mockResolvedValue({...policyFixture,version:4})
 const host=document.body.appendChild(document.createElement('div')),root=createRoot(host)
 clean=()=>{act(()=>root.unmount());host.remove()}
 await act(async()=>root.render(<api.RadarOperationalLimitsPanel isAdmin/>))
 const rate=host.querySelector<HTMLInputElement>('[name="usdToBrl"]')!,date=host.querySelector<HTMLInputElement>('[name="rateAsOf"]')!
 expect(rate).not.toBeNull();expect(date).not.toBeNull()
 await act(async()=>{
  for(const [input,value] of [[rate,'5.50'],[date,'2026-10-19T12:00:00Z']] as const){Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}))}
 })
 await act(async()=>host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})))
 expect(save).toHaveBeenCalledWith(expect.objectContaining({expectedVersion:3,costPolicy:{usdToBrl:'5.50',rateAsOf:'2026-10-19T12:00:00Z',rateSource:'manual',marginPercent:'0'}}))
 expect(host.textContent).toContain('estimativa')
})
it('does not read or render policy for another audience',async()=>{
 expect(api.RadarOperationalLimitsPanel).toBeTypeOf('function')
 const load=vi.spyOn(radarService,'getOperationalPolicy')
 const host=document.body.appendChild(document.createElement('div')),root=createRoot(host)
 clean=()=>{act(()=>root.unmount());host.remove()}
 await act(async()=>root.render(<api.RadarOperationalLimitsPanel isAdmin={false}/>))
 expect(load).not.toHaveBeenCalled();expect(host.textContent).toBe('')
})
it('exposes explicit units for decision, deep research and fallback ceilings only in system Admin',async()=>{
 vi.spyOn(radarService,'getOperationalPolicy').mockResolvedValue(policyFixture)
 const host=document.body.appendChild(document.createElement('div')),root=createRoot(host)
 clean=()=>{act(()=>root.unmount());host.remove()}
 await act(async()=>root.render(<api.RadarOperationalLimitsPanel isAdmin/>))
 for(const name of ['maxDecisionCallsPerCompany','maxDeepSearchesPerCompany','maxFallbackAttemptsPerEffect'])expect(host.querySelector(`[name="${name}"]`)).not.toBeNull()
})
