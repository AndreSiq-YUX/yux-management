import { describe, expect, it } from 'vitest'
import { buildPortalDashboardModel, type PortalDashboardInput } from './portalDashboardRules'

const baseInput = (overrides: Partial<PortalDashboardInput> = {}): PortalDashboardInput => ({
  organization: {
    id: 'org-1',
    name: 'Empresa ABC',
    slug: 'empresa-abc',
    kind: 'client',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  contract: {
    id: 'contract-1',
    clientId: 'client-1',
    packageId: 'package-1',
    status: 'active',
    name: 'Growth Comercial',
    startsAt: '2026-01-01T00:00:00.000Z',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    package: {
      id: 'package-1',
      key: 'growth',
      name: 'Growth',
      description: 'Pacote Growth',
      moduleKeys: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    modules: [],
  },
  enabledModuleKeys: ['crm'],
  actions: [],
  projects: [],
  approvals: [],
  invoices: [],
  crm: {
    leads: [],
    tasks: [],
    loading: false,
    error: null,
  },
  marketing: {
    campaigns: [],
    contents: [],
    reviews: [],
    creativeSuggestions: [],
    workflowRuns: [],
    loading: false,
    error: null,
  },
  actionLoading: false,
  actionError: null,
  windowLabel: '7 dias',
  ...overrides,
})

describe('portalDashboardRules', () => {
  it('prioriza foco comercial quando o contrato tem CRM', () => {
    const model = buildPortalDashboardModel(baseInput({
      crm: {
        leads: [
          {
            id: 'lead-1',
            organizationId: 'org-1',
            pipelineId: 'pipeline-1',
            stageId: 'stage-1',
            name: 'Oportunidade enterprise',
            email: 'lead@example.com',
            source: 'site',
            score: 72,
            value: 12000,
            status: 'open',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
        tasks: [],
        loading: false,
        error: null,
      },
    }))

    expect(model.focus).toBe('commercial')
    expect(model.mainResult.title).toBe('Resultado comercial')
    expect(model.mainResult.headlineMetric).toBe('R$ 12.000 em receita potencial')
  })

  it('muda para foco executivo quando o contrato combina frentes diferentes', () => {
    const model = buildPortalDashboardModel(baseInput({
      enabledModuleKeys: ['crm', 'campaigns', 'projects'],
    }))

    expect(model.focus).toBe('executive')
    expect(model.focusLabel).toBe('Foco executivo')
  })

  it('respeita override de foco editavel pela YUX', () => {
    const model = buildPortalDashboardModel(baseInput({
      enabledModuleKeys: ['crm', 'campaigns', 'projects'],
      focusOverride: 'marketing',
    }))

    expect(model.focus).toBe('marketing')
    expect(model.mainResult.title).toBe('Performance de marketing')
  })

  it('oferece modulos ainda nao contratados como expansao contextual', () => {
    const model = buildPortalDashboardModel(baseInput({
      enabledModuleKeys: ['crm', 'campaigns'],
      crm: {
        leads: [],
        tasks: [
          {
            id: 'task-1',
            organizationId: 'org-1',
            leadId: 'lead-1',
            title: 'Follow-up 1',
            status: 'pending',
            dueAt: '2026-01-01T00:00:00.000Z',
          },
          {
            id: 'task-2',
            organizationId: 'org-1',
            leadId: 'lead-1',
            title: 'Follow-up 2',
            status: 'pending',
            dueAt: '2026-01-01T00:00:00.000Z',
          },
          {
            id: 'task-3',
            organizationId: 'org-1',
            leadId: 'lead-1',
            title: 'Follow-up 3',
            status: 'pending',
            dueAt: '2026-01-01T00:00:00.000Z',
          },
        ],
        loading: false,
        error: null,
      },
    }))

    expect(model.expansionSuggestions.map(suggestion => suggestion.moduleKey)).toContain('automations')
    expect(model.expansionSuggestions.length).toBeLessThanOrEqual(2)
  })

  it('sinaliza dados parciais ou falha quando fontes nao carregam', () => {
    const partial = buildPortalDashboardModel(baseInput({
      actionError: 'Falha parcial',
      actions: [{
        id: 'approval-1',
        kind: 'approval',
        priority: 'high',
        title: 'Aprovacao pendente',
        description: 'Existe uma aprovacao pendente.',
        href: '/portal/projetos/aprovacoes',
      }],
    }))
    const failed = buildPortalDashboardModel(baseInput({
      actionError: 'Falha geral',
    }))

    expect(partial.dataStatus).toBe('Parcial')
    expect(failed.dataStatus).toBe('Com falha')
  })
})
