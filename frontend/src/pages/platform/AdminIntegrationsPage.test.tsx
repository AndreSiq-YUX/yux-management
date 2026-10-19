import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { adminPlatformService } from '@/services/adminPlatformService'
import { radarService } from '@/services/radarService'
import { AdminIntegrationsPage } from './AdminIntegrationsPage'
import {useAuthStore} from '@/stores/authStore'
import {radarPolicyFixture} from '@/test/fixtures/radarOperationalPolicy'
vi.mock('@/components/radar/RadarWorkspace',()=>({RadarWorkspace:({adminOrganizationId,campaignId}:{adminOrganizationId?:string;campaignId?:string})=><p data-testid="technical-radar">{adminOrganizationId}:{campaignId}</p>}))

afterEach(() => {
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('AdminIntegrationsPage', () => {
  it('opens a scoped technical view only for an authenticated global Admin, never from a client URL alone',async()=>{
    const previous=useAuthStore.getState().user,url=window.location.href
    const organizationId='10000000-0000-4000-8000-000000000001',campaignId='10000000-0000-4000-8000-000000000002'
    vi.spyOn(adminPlatformService,'getProviderConnections').mockResolvedValue([])
    vi.spyOn(radarService,'getAdminDataSources').mockResolvedValue([])
    vi.spyOn(radarService,'getOperationalPolicy').mockResolvedValue(radarPolicyFixture)
    vi.spyOn(radarService,'getStalledResearch').mockResolvedValue({stalledAfterMinutes:10,items:[]})
    window.history.replaceState({},'',`/admin/integrations?radarOrganization=${organizationId}&radarCampaign=${campaignId}`)
    const host=document.body.appendChild(document.createElement('div')),root=createRoot(host)
    try{
      await act(async()=>{useAuthStore.setState({user:{id:'fixture',role:'admin'} as never});root.render(<AdminIntegrationsPage/>);await new Promise(resolve=>setTimeout(resolve,0))})
      expect(host.querySelector('[data-testid="technical-radar"]')?.textContent).toBe(`${organizationId}:${campaignId}`)
      await act(async()=>useAuthStore.setState({user:{id:'fixture',role:'client'} as never}))
      expect(host.querySelector('[data-testid="technical-radar"]')).toBeNull()
    }finally{act(()=>{root.unmount();useAuthStore.setState({user:previous})});window.history.replaceState({},'',url)}
  })
  it('offers secure Serper and Brave Place credential flows with explicit paid-test warning', async () => {
    vi.spyOn(adminPlatformService, 'getProviderConnections').mockResolvedValue([])
    const loadSources = vi.spyOn(radarService, 'getAdminDataSources').mockResolvedValue([])
    const root = createRoot(document.body.appendChild(document.createElement('div')))
    await act(async () => {
      root.render(<AdminIntegrationsPage />)
      await new Promise(resolve => setTimeout(resolve, 0))
    })
    expect(document.body.textContent).toContain('Serper Places')
    expect(document.body.textContent).toContain('Brave Place Search')
    expect(document.body.textContent).toContain('O teste de conexão consome uma consulta')
    expect(document.querySelector('#radar-sources')).not.toBeNull()
    expect(document.body.textContent).toContain('Fontes do Radar Comercial')
    expect(loadSources).toHaveBeenCalledOnce()
    root.unmount()
  })
})
