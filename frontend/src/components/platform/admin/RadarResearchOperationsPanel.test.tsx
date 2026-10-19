import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {afterEach,it,expect,vi} from 'vitest'
import {radarService} from '@/services/radarService'
import type {RadarAdministrativeResearch} from '@/types/radarResearch'
const modulePath='./RadarResearchOperationsPanel',api=await import(modulePath).catch(()=>({})) as typeof import('./RadarResearchOperationsPanel')
const fixture:RadarAdministrativeResearch={configurationRevision:2,criteriaRevision:2,requests:[{requestId:'saved-request',state:'waiting',configurationRevision:2,criteriaRevision:2,budgetRevision:3,createdAt:'2026-10-19',items:5,waiting:5}],analyses:Array.from({length:5},(_,i)=>({receiptId:`receipt-${i}`,candidateId:`candidate-${i}`,companyName:`Empresa ${i}`,action:'radar_presence_resolution',status:'uncertain',configurationRevision:2,createdAt:'2026-10-19',transport:i<2?'received':'uncertain',validation:i<2?'invalid':null,billing:'uncertain',failureCode:null,provider:'OpenRouter',model:'fixture',reportedUsd:i<2?'0.001':null,estimatedBrl:null,canRevalidate:i<2,canAuthorizeRetry:true}))}
let clean=()=>{};afterEach(()=>{clean();vi.restoreAllMocks()})
it('revalidates saved responses without approving a new charge or starting another research request',async()=>{
 expect(api.RadarResearchOperationsPanel).toBeTypeOf('function')
 vi.spyOn(radarService,'getAdministrativeResearch').mockResolvedValueOnce(fixture).mockResolvedValue({...fixture,analyses:fixture.analyses.slice(1)})
 const revalidate=vi.spyOn(radarService,'revalidateAdministrativeResearch').mockResolvedValue({items:fixture.analyses.map((item,i)=>({receiptId:item.receiptId,state:i===0?'revalidated':i===1?'invalid':'no_saved_response'}))})
 const approve=vi.spyOn(radarService,'authorizeAnalysisRetries'),queue=vi.spyOn(radarService,'queueResearchRequest')
 const host=document.body.appendChild(document.createElement('div')),root=createRoot(host)
 clean=()=>{act(()=>root.unmount());host.remove()}
 await act(async()=>root.render(<api.RadarResearchOperationsPanel isSystemAdmin organizationId="org" campaignId="campaign"/>))
 await act(async()=>host.querySelector<HTMLInputElement>('[aria-label="Selecionar análises desta página"]')!.click())
 await act(async()=>[...host.querySelectorAll('button')].find(button=>button.textContent==='Revalidar respostas salvas')!.click())
 expect(revalidate).toHaveBeenCalledWith({organizationId:'org',campaignId:'campaign',receiptIds:fixture.analyses.map(item=>item.receiptId)})
 expect(approve).not.toHaveBeenCalled();expect(queue).not.toHaveBeenCalled()
 expect(host.textContent).toContain('3 sem resposta recuperável')
 expect(host.textContent).toContain('Empresa 0: resposta revalidada')
})
it('requires a charge acknowledgement before approving a scoped retry and carrying the grant to one durable intent',async()=>{
 vi.spyOn(radarService,'getAdministrativeResearch').mockResolvedValue(fixture)
 vi.spyOn(window,'confirm').mockReturnValue(true)
 const approve=vi.spyOn(radarService,'authorizeAnalysisRetries').mockResolvedValue({analysisAuthorizationId:'grant',expiresAt:'2026-10-19T20:00:00Z'})
 const queue=vi.spyOn(radarService,'queueResearchRequest').mockResolvedValue({requestId:'durable',state:'accepted',items:[]})
 const host=document.body.appendChild(document.createElement('div')),root=createRoot(host)
 clean=()=>{act(()=>root.unmount());host.remove()}
 await act(async()=>root.render(<api.RadarResearchOperationsPanel isSystemAdmin organizationId="org" campaignId="campaign"/>))
 await act(async()=>host.querySelector<HTMLInputElement>('[aria-label="Selecionar Empresa 2"]')!.click())
 const retry=()=>[...host.querySelectorAll('button')].find(button=>button.textContent==='Autorizar nova tentativa e retomar')!
 expect(retry().disabled).toBe(true)
 await act(async()=>host.querySelector<HTMLInputElement>('[name="acknowledgePreviousCharge"]')!.click())
 await act(async()=>retry().click())
 expect(approve).toHaveBeenCalledWith('campaign',expect.objectContaining({organizationId:'org',configurationRevision:2,acknowledgePreviousChargeMayExist:true,items:[{candidateId:'candidate-2',previousReceiptId:'receipt-2'}]}))
 expect(queue).toHaveBeenCalledWith('campaign',expect.objectContaining({candidateIds:['candidate-2'],analysisAuthorizationId:'grant',criteriaRevision:2,intent:'resume'}))
 expect(window.confirm).not.toHaveBeenCalled() // The explicit acknowledgement plus action is sufficient.
})
it('keeps the same budget authorization after a lost acknowledgement without creating another research intent',async()=>{
 vi.spyOn(radarService,'getAdministrativeResearch').mockResolvedValue(fixture)
 vi.spyOn(window,'confirm').mockReturnValue(true)
 const authorize=vi.spyOn(radarService,'authorizeResearchBudget').mockRejectedValueOnce(Error('lost acknowledgement')).mockResolvedValueOnce({budgetRevision:4})
 const queue=vi.spyOn(radarService,'queueResearchRequest')
 const host=document.body.appendChild(document.createElement('div')),root=createRoot(host)
 clean=()=>{act(()=>root.unmount());host.remove()}
 await act(async()=>root.render(<api.RadarResearchOperationsPanel isSystemAdmin organizationId="org" campaignId="campaign"/>))
 const button=()=>[...host.querySelectorAll('button')].find(item=>item.textContent==='Aplicar capacidade atual e retomar')!
 await act(async()=>button().click());await act(async()=>button().click())
 expect(authorize).toHaveBeenCalledTimes(2);expect(authorize.mock.calls[1]).toEqual(authorize.mock.calls[0])
 expect(authorize.mock.calls[0]).toEqual(['saved-request',{organizationId:'org',expectedBudgetRevision:3,authorizationId:expect.any(String)}])
 expect(queue).not.toHaveBeenCalled()
})
it('keeps the same retry approval and durable intent when the second acknowledgement is lost',async()=>{
 vi.spyOn(radarService,'getAdministrativeResearch').mockResolvedValue(fixture)
 const approve=vi.spyOn(radarService,'authorizeAnalysisRetries').mockResolvedValue({analysisAuthorizationId:'grant',expiresAt:'2026-10-19T20:00:00Z'})
 const queue=vi.spyOn(radarService,'queueResearchRequest').mockRejectedValueOnce(Error('lost ack')).mockResolvedValueOnce({requestId:'durable',state:'accepted',items:[]})
 const host=document.body.appendChild(document.createElement('div')),root=createRoot(host)
 clean=()=>{act(()=>root.unmount());host.remove()}
 await act(async()=>root.render(<api.RadarResearchOperationsPanel isSystemAdmin organizationId="org" campaignId="campaign"/>))
 await act(async()=>host.querySelector<HTMLInputElement>('[aria-label="Selecionar Empresa 2"]')!.click())
 await act(async()=>host.querySelector<HTMLInputElement>('[name="acknowledgePreviousCharge"]')!.click())
 const retry=()=>[...host.querySelectorAll('button')].find(button=>button.textContent==='Autorizar nova tentativa e retomar')!
 await act(async()=>retry().click());await act(async()=>retry().click())
 expect(approve.mock.calls[1]).toEqual(approve.mock.calls[0]);expect(queue.mock.calls[1]).toEqual(queue.mock.calls[0])
})
it('does not load administrative metadata for a client or account Admin',async()=>{
 const load=vi.spyOn(radarService,'getAdministrativeResearch')
 const host=document.body.appendChild(document.createElement('div')),root=createRoot(host)
 clean=()=>{act(()=>root.unmount());host.remove()}
 await act(async()=>root.render(<api.RadarResearchOperationsPanel isSystemAdmin={false} organizationId="org" campaignId="campaign"/>))
 expect(load).not.toHaveBeenCalled();expect(host.textContent).toBe('')
})
