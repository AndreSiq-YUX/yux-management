import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {afterEach,expect,it,vi} from 'vitest'
import {radarService} from '@/services/radarService'
import type {RadarResearchRequestResult} from '@/types/radarResearch'
const componentPath='./RadarCommercialResearchActions',api=await import(componentPath).catch(()=>({})) as typeof import('./RadarCommercialResearchActions')
vi.mock('@/services/radarService',()=>({radarService:{getLatestResearchRequest:vi.fn(async()=>({request:null})),queueResearchRequest:vi.fn(),getResearchRequest:vi.fn()}}))
afterEach(()=>{vi.clearAllMocks();vi.useRealTimers()})
const props={organizationId:'org',campaignId:'campaign',criteriaRevision:1,canResearch:true,selectedIds:['a','b','c','d'],companies:['a','b','c','d'].map(id=>({id,title:`Empresa ${id}`})),onUpdated:vi.fn()}
it('tracks four selected companies through the durable request and restores after reload without exposing tools',async()=>{
 expect(api.RadarCommercialResearchActions).toBeTypeOf('function')
 vi.useFakeTimers()
 const result:RadarResearchRequestResult={requestId:'request',state:'waiting',items:props.selectedIds.map(candidateId=>({candidateId,state:'waiting',message:'Pesquisa parcial.',feedback:{schemaVersion:1,status:'incomplete',updatedFields:['email'],unresolvedFields:[{field:'website',reason:'not_found'}],lastAttemptAt:null,nextAction:'continue'}}))}
 vi.mocked(radarService.queueResearchRequest).mockResolvedValueOnce({...result,state:'accepted',items:[]})
 vi.mocked(radarService.getResearchRequest).mockResolvedValueOnce({...result,state:'running',items:[]}).mockResolvedValueOnce(result)
 const confirm=vi.spyOn(window,'confirm').mockReturnValue(true),host=document.createElement('div'),root=createRoot(host)
 try{
  await act(async()=>root.render(<api.RadarCommercialResearchActions {...props}/>))
  await act(async()=>host.querySelector('button')!.click())
  expect(radarService.queueResearchRequest).toHaveBeenCalledWith('campaign',expect.objectContaining({organizationId:'org',candidateIds:['a','b','c','d'],intent:'refresh',criteriaRevision:1}))
  expect(vi.mocked(radarService.queueResearchRequest).mock.calls[0][1]).not.toHaveProperty('allowSemanticRefresh')
  await act(async()=>vi.advanceTimersByTimeAsync(8000))
  expect(host.querySelectorAll('[aria-label="Resultado desta pesquisa"]')).toHaveLength(4)
  expect(host.textContent).toContain('Empresa d');expect(host.textContent).not.toMatch(/Brave|Serper|modelo|créditos|R\$/)
  expect(props.onUpdated).toHaveBeenCalled()
  vi.mocked(radarService.getLatestResearchRequest).mockResolvedValueOnce({request:result})
  await act(async()=>root.render(<api.RadarCommercialResearchActions key="reload" {...props}/>))
  expect(host.querySelectorAll('[aria-label="Resultado desta pesquisa"]')).toHaveLength(4)
  expect(radarService.queueResearchRequest).toHaveBeenCalledTimes(1)
 }finally{act(()=>root.unmount());confirm.mockRestore()}
})
it('reuses the same request after a lost acknowledgment and hides mutations without permission',async()=>{
 expect(api.RadarCommercialResearchActions).toBeTypeOf('function')
 vi.mocked(radarService.queueResearchRequest).mockRejectedValueOnce(Error('network')).mockResolvedValueOnce({requestId:'request',state:'waiting',items:[]})
 const confirm=vi.spyOn(window,'confirm').mockReturnValue(true),host=document.createElement('div'),root=createRoot(host)
 try{
  await act(async()=>root.render(<api.RadarCommercialResearchActions {...props}/>))
  await act(async()=>host.querySelector('button')!.click());await act(async()=>host.querySelector('button')!.click())
  expect(vi.mocked(radarService.queueResearchRequest).mock.calls[0][1].requestId).toBe(vi.mocked(radarService.queueResearchRequest).mock.calls[1][1].requestId)
  await act(async()=>root.render(<api.RadarCommercialResearchActions {...props} canResearch={false}/>))
  expect(host.querySelector('button')).toBeNull()
 }finally{act(()=>root.unmount());confirm.mockRestore()}
})
