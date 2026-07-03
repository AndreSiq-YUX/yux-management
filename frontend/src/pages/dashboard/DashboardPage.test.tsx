import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DashboardPage } from './DashboardPage'

vi.mock('@/stores/authStore', () => ({
  useAuthStore: () => ({
    user: { name: 'Andre' },
  }),
}))

vi.mock('@/services/backendDataService', () => ({
  backendDataService: {
    getDashboardStats: vi.fn(async () => ({
      overview: {
        totalClients: 18,
        totalProjects: 20,
        totalLeads: 0,
        totalCampaigns: 0,
        activeProjects: 10,
        qualifiedLeads: 0,
      },
      financial: {
        totalBudget: 140000,
        totalCampaignSpent: 90000,
        budgetUtilization: 64.2,
      },
      marketing: {
        totalImpressions: 0,
        totalClicks: 0,
        ctr: 2.41,
        avgROAS: 4.8,
      },
      recent: {
        projects: [
          { id: 'p1', name: 'CRM RevOps', client: 'Cliente Beta', status: 'Em risco', progress: 32 },
        ],
      },
    })),
  },
}))

vi.mock('@/services/adminPlatformService', () => ({
  adminPlatformService: {
    getAdminHubSummary: vi.fn(async () => ({
      clientCount: 18,
      activeContractCount: 0,
      activeModuleCount: 12,
      failingProviderCount: 2,
      nearLimitCount: 4,
    })),
  },
}))

describe('DashboardPage', () => {
  let container: HTMLDivElement

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
  })

  afterEach(() => {
    document.body.removeChild(container)
  })

  it('renders the manager command center hierarchy', async () => {
    const root = createRoot(container)

    await act(async () => {
      root.render(
        <MemoryRouter>
          <DashboardPage />
        </MemoryRouter>,
      )
    })

    await act(async () => {
      await Promise.resolve()
    })

    expect(container.textContent).toContain('Visao Geral YUX')
    expect(container.textContent).toContain('Mesa de comando para riscos, oportunidades e operacao interna.')
    expect(container.textContent).toContain('Pulso Executivo')
    expect(container.textContent).toContain('Resolver agora')
    expect(container.textContent).toContain('Aproveitar oportunidade')
    expect(container.textContent).toContain('2 provedores exigem revisao')
    expect(container.textContent).toContain('Nenhum contrato ativo')
    expect(container.textContent).toContain('Carteira com ROAS 4.8x')
    expect(container.textContent).toContain('Mapa da Carteira')
    expect(container.textContent).toContain('Cliente Beta')
  })
})
