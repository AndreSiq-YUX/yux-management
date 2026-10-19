import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {it,expect} from 'vitest'
import {RadarAdminOperations} from './RadarAdminOperations'
it('keeps technical controls out of a campaign and preserves them only in the dedicated system Admin view',async()=>{
 const host=document.createElement('div'),root=createRoot(host)
 try{
  const content=<p>Brave / Serper — R$ 1,00</p>
  await act(async()=>root.render(<RadarAdminOperations isSystemAdmin organizationId="org" campaignId="campaign">{content}</RadarAdminOperations>))
  expect(host.textContent).not.toMatch(/Brave|Serper|R\$/)
  expect(host.querySelector('a')?.getAttribute('href')).toBe('/admin/integrations?radarOrganization=org&radarCampaign=campaign#radar-operations')
  await act(async()=>root.render(<RadarAdminOperations isSystemAdmin standalone>{content}</RadarAdminOperations>))
  expect(host.textContent).toContain('Brave / Serper');expect(host.querySelector('details')).toBeNull()
  await act(async()=>root.render(<RadarAdminOperations isSystemAdmin={false} standalone>{content}</RadarAdminOperations>))
  expect(host.textContent).toBe('')
 }finally{act(()=>root.unmount())}
})
