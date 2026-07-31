import { describe, expect, it } from 'vitest'
import { buildCommandCenterModel } from './commandCenterRules'

describe('commandCenterRules', () => {
  it('builds resolve-now items from failing providers, near limits, contracts, and blocked projects', () => {
    const model = buildCommandCenterModel({
      dashboardStats: {
        overview: {
          totalClients: 12,
          totalProjects: 9,
          totalLeads: 0,
          totalCampaigns: 0,
          activeProjects: 4,
          qualifiedLeads: 0,
        },
        financial: {
          totalBudget: 120000,
          totalCampaignSpent: 86000,
          budgetUtilization: 71.6,
        },
        marketing: {
          totalImpressions: 0,
          totalClicks: 0,
          ctr: 2.41,
          avgROAS: 3.8,
        },
        recent: {
          projects: [
            { id: 'p1', name: 'CRM RevOps', client: 'Cliente Beta', status: 'Em risco', progress: 32 },
          ],
        },
      },
      adminSummary: {
        clientCount: 12,
        activeContractCount: 0,
        activeModuleCount: 6,
        failingProviderCount: 2,
        nearLimitCount: 4,
      },
      userName: 'Andre',
      hasPartialError: false,
    })

    expect(model.resolveNow.map(item => item.title)).toEqual([
      '2 provedores exigem revisao',
      'Nenhum contrato ativo',
      '4 limites perto do bloqueio',
      'CRM RevOps precisa de atencao',
    ])
    expect(model.resolveNow[0].impactLabel).toBe('Operacao interna em risco')
    expect(model.pulse[0]).toMatchObject({ label: 'Riscos abertos', value: '4', detail: '2 criticos' })
  })

  it('builds explicit opportunities from ROAS, budget, project volume, and AI cost signals', () => {
    const model = buildCommandCenterModel({
      dashboardStats: {
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
          projects: [],
        },
      },
      adminSummary: {
        clientCount: 18,
        activeContractCount: 8,
        activeModuleCount: 12,
        failingProviderCount: 0,
        nearLimitCount: 0,
      },
      userName: 'Andre',
      hasPartialError: false,
    })

    expect(model.opportunities.map(item => item.title)).toContain('Carteira com ROAS 4.8x')
    expect(model.opportunities.map(item => item.title)).toContain('10 projetos ativos com potencial de automacao')
    expect(model.opportunities[0].impactLabel).toMatch(/R\$/)
    expect(model.pulse.some(metric => metric.label === 'Oportunidades estimadas')).toBe(true)
  })

  it('marks the data status as partial when one source fails', () => {
    const model = buildCommandCenterModel({
      dashboardStats: null,
      adminSummary: {
        clientCount: 4,
        activeContractCount: 2,
        activeModuleCount: 3,
        failingProviderCount: 1,
        nearLimitCount: 0,
      },
      userName: 'Andre',
      hasPartialError: true,
    })

    expect(model.dataStatus).toBe('Parcial')
    expect(model.unavailableSources).toContain('Indicadores de workspace')
    expect(model.resolveNow[0].title).toBe('1 provedor exige revisao')
  })
})
