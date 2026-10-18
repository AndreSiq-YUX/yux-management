import { act } from 'react-dom/test-utils'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
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
        <MemoryRouter><CampaignsWorkspace
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
        /></MemoryRouter>,
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
        <MemoryRouter><CampaignsWorkspace
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
        /></MemoryRouter>,
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
  const renderPortal = async (props: Partial<React.ComponentProps<typeof PortalCampaignsWorkspace>> = {}) => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    const handlers = { onNewCampaign: vi.fn(), onRefresh: vi.fn() }
    await act(async () => {
      root.render(
        <MemoryRouter><PortalCampaignsWorkspace
          contract={contract}
          campaigns={[sanitizeCampaignForPortal(campaign)]}
          {...handlers}
          {...props}
        /></MemoryRouter>,
      )
    })
    return {
      container,
      handlers,
      unmount: async () => {
        await act(async () => root.unmount())
        container.remove()
      },
    }
  }

  const findButton = (container: HTMLElement, text: string) =>
    Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(button => button.textContent?.includes(text))

  it('renders client-safe campaign data without protected provider details', async () => {
    const { container, unmount } = await renderPortal()

    const html = container.innerHTML.replace(/&nbsp;/g, ' ')
    expect(container.querySelector('h1')?.textContent).toBe('Campanhas')
    expect(html).not.toContain('Campanhas e Anúncios')
    expect(html).toContain('Contrato:')
    expect(html).toContain('Botox Junho')
    expect(html).toContain('R$ 12')
    expect(html).not.toContain('abc123')
    expect(container.textContent).toContain('Canais: Meta Ads')
    expect(container.textContent).not.toContain('Google Ads conectados')
    expect(container.textContent).not.toContain('Atualizado agora')
    expect(container.textContent).not.toContain('+14%')

    await unmount()
  })

  it('shows an honest empty state without demo campaigns when there are no campaigns', async () => {
    const { container, handlers, unmount } = await renderPortal({ campaigns: [] })

    const text = container.textContent || ''
    expect(text).toContain('Nenhuma campanha ainda')
    expect(text).toContain('Quando a YUX publicar ou você criar uma campanha, os resultados aparecem aqui.')
    expect(text).not.toContain('Diagnostico WhatsApp 48h')
    expect(text).not.toContain('Relatorio BI')
    expect(text).not.toContain('Remarketing proposta')
    expect(text).not.toContain('Dados atualizados')
    expect(text).not.toContain('Growth Comercial')

    const newButtons = Array.from(container.querySelectorAll<HTMLButtonElement>('button[title="Nova campanha"]'))
    expect(newButtons.length).toBeGreaterThan(0)
    await act(async () => newButtons[newButtons.length - 1].click())
    expect(handlers.onNewCampaign).toHaveBeenCalledTimes(1)

    await unmount()
  })

  it('omits the contract chip when the contract has no name', async () => {
    const { container, unmount } = await renderPortal({ contract: { ...contract, name: '' } })
    expect(container.textContent).not.toContain('Contrato:')
    expect(container.textContent).not.toContain('Growth Comercial')
    await unmount()
  })

  it('reloads data through onRefresh and shows a spinner while refreshing', async () => {
    let finish: () => void = () => {}
    const onRefresh = vi.fn(() => new Promise<void>(resolve => { finish = resolve }))
    const { container, unmount } = await renderPortal({ onRefresh })

    const refreshButton = container.querySelector<HTMLButtonElement>('button[title="Atualizar dados"]')!
    await act(async () => refreshButton.click())
    expect(onRefresh).toHaveBeenCalledTimes(1)
    expect(refreshButton.disabled).toBe(true)
    expect(refreshButton.querySelector('svg.animate-spin')).not.toBeNull()

    await act(async () => finish())
    expect(refreshButton.disabled).toBe(false)
    expect(refreshButton.querySelector('svg.animate-spin')).toBeNull()

    await unmount()
  })

  it('marks period, variation, details and review as pending without running anything', async () => {
    const { container, handlers, unmount } = await renderPortal()

    const pendingButtons = Array.from(container.querySelectorAll<HTMLButtonElement>('button[aria-disabled="true"]'))
    const labels = pendingButtons.map(button => button.textContent || '')
    expect(labels.some(label => label.includes('Criar variação') && label.includes('Pendente'))).toBe(true)
    expect(labels.some(label => label.includes('Ver detalhes') && label.includes('Pendente'))).toBe(true)
    expect(labels.some(label => label.includes('Pedir revisão') && label.includes('Pendente'))).toBe(true)
    // selo do seletor de período (B10)
    expect(container.querySelector('[aria-label^="Pendente: Período diário em Campanhas"]')).not.toBeNull()

    for (const button of pendingButtons) await act(async () => button.click())
    expect(handlers.onNewCampaign).not.toHaveBeenCalled()
    expect(handlers.onRefresh).not.toHaveBeenCalled()
    expect(container.querySelectorAll('[role="status"]').length).toBeGreaterThan(0)

    await unmount()
  })

  it('does not split campaign metrics among creatives and lists only real events', async () => {
    const withCreatives: Campaign = {
      ...campaign,
      recommendations: [],
      alerts: [],
      creatives: [
        { id: 'cr-1', campaignId: 'campaign-1', name: 'Criativo A', format: 'image', createdAt: '2026-06-04T10:00:00.000Z', updatedAt: '2026-06-04T10:00:00.000Z' },
        { id: 'cr-2', campaignId: 'campaign-1', name: 'Criativo B', format: 'video', createdAt: '2026-06-05T10:00:00.000Z', updatedAt: '2026-06-05T10:00:00.000Z' },
      ],
    }
    const { container, unmount } = await renderPortal({ campaigns: [sanitizeCampaignForPortal(withCreatives)] })

    const rows = Array.from(container.querySelectorAll('tbody tr'))
    expect(rows).toHaveLength(3)
    const creativeCells = Array.from(rows[1].querySelectorAll('td')).map(cell => cell.textContent)
    // gasto, CTR, leads, CPL, receita e MROI ficam sem valor
    expect(creativeCells.slice(4, 10)).toEqual(['—', '—', '—', '—', '—', '—'])

    const text = container.textContent || ''
    expect(text).toContain('Campanha criada')
    expect(text).not.toContain('Orcamento atualizado')
    expect(text).not.toContain('Criativo aprovado')

    await unmount()
  })

  it('shows "Sem eventos registrados" when the campaign has no dated events', async () => {
    const { container, unmount } = await renderPortal({
      campaigns: [sanitizeCampaignForPortal({ ...campaign, createdAt: '', updatedAt: '' })],
    })
    expect(container.textContent).toContain('Sem eventos registrados')
    await unmount()
  })

  it('filters by tab using lifecycle status', async () => {
    const { container, unmount } = await renderPortal()
    const approvalTab = findButton(container, 'Em aprovação')!
    await act(async () => approvalTab.click())
    expect(container.textContent).toContain('Nenhuma campanha encontrada')
    await unmount()
  })
})

describe('PortalCampaignsWorkspace layout', () => {
  const renderLayout = async (campaigns: Campaign[] = [campaign]) => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    await act(async () => {
      root.render(
        <MemoryRouter><PortalCampaignsWorkspace
          contract={contract}
          campaigns={campaigns.map(sanitizeCampaignForPortal)}
          onNewCampaign={vi.fn()}
          onRefresh={vi.fn()}
        /></MemoryRouter>,
      )
    })
    return {
      container,
      unmount: async () => {
        await act(async () => root.unmount())
        container.remove()
      },
    }
  }

  it('shows the KPI strip with real values only', async () => {
    const { container, unmount } = await renderLayout()
    const kpis = container.querySelector('[aria-label="Indicadores das campanhas"]')!
    const labels = Array.from(kpis.querySelectorAll('li')).map(item => item.textContent || '')
    expect(labels).toHaveLength(6)
    expect(labels[0]).toContain('Campanhas ativas')
    expect(labels[0]).toContain('1')
    expect(labels.some(text => text.includes('Retorno (MROI)'))).toBe(true)
    expect(container.textContent).toContain('Custo por lead (CPL) = investimento')
    await unmount()
  })

  it('renders cards for small screens and opens the inspector with a Voltar button', async () => {
    const { container, unmount } = await renderLayout()

    const cards = container.querySelector('[data-testid="campaign-cards"]')!
    expect(cards.querySelectorAll('li')).toHaveLength(1)
    // nada selecionado: sem botão Voltar
    expect(Array.from(container.querySelectorAll('button')).some(button => button.textContent?.trim() === 'Voltar')).toBe(false)

    await act(async () => cards.querySelector<HTMLButtonElement>('button')!.click())
    expect(container.querySelector('[data-testid="master-detail"]')?.textContent).toContain('Prontidão e recomendações')
    const back = Array.from(container.querySelectorAll('button')).find(button => button.textContent?.trim() === 'Voltar')!
    expect(back).toBeDefined()

    await act(async () => back.click())
    expect(Array.from(container.querySelectorAll('button')).some(button => button.textContent?.trim() === 'Voltar')).toBe(false)

    await unmount()
  })
})

describe('PortalCampaignsWorkspace filters and B18 actions', () => {
  const google: Campaign = {
    ...campaign,
    id: 'campaign-2',
    name: 'Busca Google',
    provider: 'google',
    objective: 'traffic',
    lifecycleStatus: 'paused',
    recommendations: [],
    alerts: [],
  }

  const render = async (campaigns: Campaign[] = [campaign, google]) => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    await act(async () => {
      root.render(
        <MemoryRouter><PortalCampaignsWorkspace
          contract={contract}
          campaigns={campaigns.map(sanitizeCampaignForPortal)}
          onNewCampaign={vi.fn()}
          onRefresh={vi.fn()}
        /></MemoryRouter>,
      )
    })
    return {
      container,
      unmount: async () => {
        await act(async () => root.unmount())
        container.remove()
      },
    }
  }

  const buttonByText = (container: HTMLElement, text: string) =>
    Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(button => button.textContent?.trim().startsWith(text))!

  it('filters rows by dimension values, shows chips and clears them', async () => {
    const { container, unmount } = await render()
    expect(container.querySelectorAll('tbody tr')).toHaveLength(2)

    await act(async () => buttonByText(container, 'Canal').click())
    const group = container.querySelector('[role="group"][aria-label="Filtrar por canal"]')!
    const labels = Array.from(group.querySelectorAll('label')).map(label => label.textContent)
    expect(labels).toEqual(['Google Ads', 'Meta Ads'])

    const metaCheckbox = Array.from(group.querySelectorAll<HTMLInputElement>('input')).find(input => input.parentElement?.textContent === 'Meta Ads')!
    await act(async () => metaCheckbox.click())

    const rows = Array.from(container.querySelectorAll('tbody tr'))
    expect(rows).toHaveLength(1)
    expect(rows[0].textContent).toContain('Botox Junho')
    expect(container.querySelector('[aria-label="Filtros ativos"]')?.textContent).toContain('Canal: Meta Ads')

    await act(async () => buttonByText(container, 'Limpar filtros').click())
    expect(container.querySelectorAll('tbody tr')).toHaveLength(2)
    expect(container.querySelector('[aria-label="Filtros ativos"]')).toBeNull()

    await unmount()
  })

  it('offers only values present in the data for Status and Objetivo', async () => {
    const { container, unmount } = await render()

    await act(async () => buttonByText(container, 'Status').click())
    let group = container.querySelector('[role="group"][aria-label="Filtrar por status"]')!
    expect(Array.from(group.querySelectorAll('label')).map(label => label.textContent)).toEqual(['Ativa', 'Pausada'])

    await act(async () => buttonByText(container, 'Objetivo').click())
    group = container.querySelector('[role="group"][aria-label="Filtrar por objetivo"]')!
    expect(Array.from(group.querySelectorAll('label')).map(label => label.textContent)).toEqual(['Geração de leads', 'Tráfego'])

    await unmount()
  })

  it('renders row Duplicar and Pausar as pending B18 buttons that explain on click and run nothing', async () => {
    const { container, unmount } = await render([campaign])

    const row = container.querySelector('tbody tr')!
    expect(row.querySelector('[aria-label^="Pendente: Duplicar, pausar e ativar"]')).not.toBeNull()
    const duplicate = row.querySelector<HTMLButtonElement>('button[aria-label="Duplicar: pendente"]')!
    const pause = row.querySelector<HTMLButtonElement>('button[aria-label="Pausar: pendente"]')!
    expect(duplicate.getAttribute('aria-disabled')).toBe('true')
    expect(duplicate.disabled).toBe(false)
    expect(pause.disabled).toBe(false)
    expect(row.querySelector('[role="status"]')).toBeNull()
    await act(async () => duplicate.click())
    expect(row.querySelector('[role="status"]')?.textContent).toContain('em implantação')

    expect(container.textContent).toContain('Duplicar campanha')
    expect(container.textContent).toContain('Pausar campanha')

    await unmount()
  })
})
