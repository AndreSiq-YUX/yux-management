import { act } from 'react-dom/test-utils'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import { sanitizeCampaignForPortal } from '@/lib/campaigns/campaignRules'
import { CampaignsWorkspace } from './CampaignsWorkspace'
import { PortalCampaignsWorkspace } from './PortalCampaignsWorkspace'
import type { Campaign } from '@/types/campaign'
import type { ContractDetails } from '@/types/platform'

const campaign: Campaign = {
  id: 'campaign-1',
  organizationId: 'org-1',
  clientId: 'client-1',
  contractId: 'contract-1',
  name: 'Botox Junho',
  provider: 'meta',
  objective: 'lead_generation',
  lifecycleStatus: 'active',
  dailyBudget: 50,
  totalBudget: 1500,
  spend: 1000,
  attributedRevenue: 4300,
  impressions: 10000,
  clicks: 500,
  leads: 83,
  opportunities: 20,
  proposals: 8,
  clients: 3,
  cpl: 12.05,
  mroi: 3.3,
  protectedError: 'token abc123 failed',
  executionLogs: [{ id: 'run-1', status: 'failed', protectedError: 'token abc123 failed' }],
  recommendations: [{ id: 'rec-1', campaignId: 'campaign-1', title: 'Aumentar verba em horario comercial', description: '', priority: 'medium' }],
  alerts: [{ id: 'alert-1', campaignId: 'campaign-1', title: 'Conexao Meta stale', severity: 'warning' }],
  createdAt: '2026-06-03T10:00:00.000Z',
  updatedAt: '2026-06-03T10:00:00.000Z',
}

const contract: ContractDetails = {
  id: 'contract-1',
  clientId: 'client-1',
  packageId: 'package-1',
  name: 'Contrato principal',
  status: 'active',
  startsAt: '2026-06-01',
  createdAt: '2026-06-01T10:00:00.000Z',
  updatedAt: '2026-06-01T10:00:00.000Z',
  package: null,
  modules: [],
}

describe('CampaignsWorkspace', () => {
  it('renders provider health, metrics, campaigns, and operational controls', () => {
    const container = document.createElement('div')
    const root = createRoot(container)
    const handlers = {
      onRefresh: vi.fn(),
      onCreateDraft: vi.fn(),
      onSubmitApproval: vi.fn(),
      onApprove: vi.fn(),
      onCreateProvider: vi.fn(),
      onSyncMetrics: vi.fn(),
      onPause: vi.fn(),
    }

    act(() => {
      root.render(
        <CampaignsWorkspace
          campaigns={[campaign]}
          providerConnections={[{
            id: 'connection-1',
            organizationId: 'org-1',
            provider: 'meta',
            name: 'Meta principal',
            status: 'stale',
            createdAt: '2026-06-03T10:00:00.000Z',
            updatedAt: '2026-06-03T10:00:00.000Z',
          }]}
          defaultOrganizationId="org-1"
          defaultClientId="client-1"
          defaultContractId="contract-1"
          {...handlers}
        />,
      )
    })

    const html = container.innerHTML.replace(/&nbsp;/g, ' ')
    expect(html).toContain('Campanhas')
    expect(html).toContain('Campanha 360')
    expect(html).toContain('Cockpit executivo Ads/MROI')
    expect(html).toContain('Atribuicao: ultima interacao de anuncio')
    expect(html).toContain('Criar plano guiado')
    expect(html).toContain('Botox Junho')
    expect(html).toContain('Conexao Meta stale')
    expect(html).toContain('3.3x')

    act(() => {
      container.querySelector<HTMLButtonElement>('button[title="Criar rascunho de campanha"]')!.click()
      container.querySelector<HTMLButtonElement>('button[title="Enviar para aprovacao"]')!.click()
      container.querySelector<HTMLButtonElement>('button[title="Aprovar campanha"]')!.click()
      container.querySelector<HTMLButtonElement>('button[title="Sincronizar metricas"]')!.click()
      container.querySelector<HTMLButtonElement>('button[title="Pausar campanha"]')!.click()
    })

    expect(handlers.onCreateDraft).toHaveBeenCalled()
    expect(handlers.onSubmitApproval).toHaveBeenCalledWith('campaign-1')
    expect(handlers.onApprove).toHaveBeenCalledWith('campaign-1')
    expect(handlers.onSyncMetrics).toHaveBeenCalledWith('campaign-1')
    expect(handlers.onPause).toHaveBeenCalledWith('campaign-1')

    act(() => root.unmount())
  })

  it('enables provider creation only for approved campaigns with healthy connection and ad account', () => {
    const container = document.createElement('div')
    const root = createRoot(container)
    const onCreateProvider = vi.fn()

    act(() => {
      root.render(
        <CampaignsWorkspace
          campaigns={[{
            ...campaign,
            providerConnectionId: 'connection-1',
            adAccountId: 'account-1',
            lifecycleStatus: 'approved',
          }]}
          providerConnections={[{
            id: 'connection-1',
            organizationId: 'org-1',
            provider: 'meta',
            name: 'Meta principal',
            status: 'connected',
            tokenReferenceConfigured: true,
            createdAt: '2026-06-03T10:00:00.000Z',
            updatedAt: '2026-06-03T10:00:00.000Z',
          }]}
          onRefresh={vi.fn()}
          onCreateDraft={vi.fn()}
          onSubmitApproval={vi.fn()}
          onApprove={vi.fn()}
          onCreateProvider={onCreateProvider}
          onSyncMetrics={vi.fn()}
          onPause={vi.fn()}
        />,
      )
    })

    const createButton = container.querySelector<HTMLButtonElement>('button[title="Criar campanha no provider"]')!
    expect(createButton.disabled).toBe(false)
    act(() => createButton.click())
    expect(onCreateProvider).toHaveBeenCalledWith('campaign-1')

    act(() => root.unmount())
  })
})

describe('PortalCampaignsWorkspace', () => {
  it('renders client-safe campaign data without protected provider details', () => {
    const container = document.createElement('div')
    const root = createRoot(container)

    act(() => {
      root.render(
        <PortalCampaignsWorkspace
          contract={contract}
          campaigns={[sanitizeCampaignForPortal(campaign)]}
          onRequestChange={vi.fn()}
        />,
      )
    })

    const html = container.innerHTML.replace(/&nbsp;/g, ' ')
    expect(html).toContain('Campanhas do contrato')
    expect(html).toContain('Botox Junho')
    expect(html).toContain('R$ 12,05')
    expect(html).not.toContain('abc123')

    act(() => root.unmount())
  })
})
