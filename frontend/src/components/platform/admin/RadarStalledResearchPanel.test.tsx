import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {it,expect,vi} from 'vitest'
import {radarService} from '@/services/radarService'
const componentPath='./RadarStalledResearchPanel',api=await import(componentPath).catch(()=>({})) as typeof import('./RadarStalledResearchPanel')
it('shows the cause and scoped recovery link only to the system Admin, without initiating research',async()=>{
 expect(api.RadarStalledResearchPanel).toBeTypeOf('function')
 const load=vi.spyOn(radarService,'getStalledResearch').mockResolvedValue({stalledAfterMinutes:10,items:[{id:'request',kind:'request',organizationId:'org',organizationName:'Empresa A',campaignId:'campaign',campaignName:'Campanha A',stage:'review',reason:'effect_uncertain',lastProgressAt:'2026-10-19T10:00:00Z',nextAction:'reconcile_receipts'}]})
 const queue=vi.spyOn(radarService,'queueResearchRequest'),host=document.createElement('div'),root=createRoot(host)
 try{
  await act(async()=>root.render(<api.RadarStalledResearchPanel isSystemAdmin={false}/>))
  expect(load).not.toHaveBeenCalled();expect(host.textContent).toBe('')
  await act(async()=>root.render(<api.RadarStalledResearchPanel isSystemAdmin/>))
  expect(host.textContent).toContain('Resultado pago incerto');expect(host.textContent).toContain('Campanha A')
  expect(host.querySelector('a')?.getAttribute('href')).toBe('/admin/integrations?radarOrganization=org&radarCampaign=campaign#radar-operations')
  expect(queue).not.toHaveBeenCalled()
 }finally{act(()=>root.unmount());vi.restoreAllMocks()}
})
