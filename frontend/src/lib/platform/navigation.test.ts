import { describe, expect, it } from 'vitest'
import { buildBreadcrumbs, buildNavigation, buildNavigationGroups } from '@/lib/platform/navigation'
import type { PlatformContext } from '@/types/platform'

const internalContext: PlatformContext = {
  mode: 'internal',
  organization: null,
  membership: null,
  role: {
    key: 'yux_admin',
    name: 'YUX Admin',
    scope: 'internal',
    permissions: ['platform.manage'],
  },
  enabledModuleKeys: ['clients', 'crm', 'projects', 'campaigns', 'blueprints'],
}

describe('buildNavigation', () => {
  it('builds internal navigation from active modules and permissions', () => {
    const items = buildNavigation(internalContext)
    const labels = items.map(item => item.label)

    expect(items[0]).toEqual({ label: 'Dashboard', href: '/dashboard' })
    expect(labels).toContain('Clientes')
    expect(labels).toContain('Contratos')
    expect(labels).toContain('Conversoes de Leads')
    expect(labels).toContain('Selecionar Cliente')
    expect(labels).toContain('Crescimento YUX')
    expect(labels).toContain('Projetos')
    expect(labels).toContain('Modelos Setoriais')
    expect(labels).not.toContain('Leads YUX')
    expect(labels).not.toContain('Campanhas')
    expect(items.find(item => item.label === 'Selecionar Cliente')?.href).toBe('/client-workspaces')
  })

  it('requires internal users to select a client before operating client journeys', () => {
    const items = buildNavigation({
      ...internalContext,
      role: {
        key: 'yux_admin',
        name: 'YUX Admin',
        scope: 'internal',
        permissions: ['platform.manage'],
      },
      enabledModuleKeys: ['crm', 'whatsapp_ai', 'landing_pages', 'campaigns', 'automations', 'bi_reports', 'marketing_studio'],
    })

    expect(items).toContainEqual({ label: 'Selecionar Cliente', href: '/client-workspaces' })
    expect(items.find(item => item.label === 'CRM & Funis')).toBeUndefined()
    expect(items.find(item => item.label === 'Conversas' && item.href === '/omnichannel')).toBeUndefined()
  })

  it('builds portal navigation without internal-only modules', () => {
    const items = buildNavigation({
      ...internalContext,
      mode: 'portal',
      role: {
        key: 'client_admin',
        name: 'Client Admin',
        scope: 'client',
        permissions: ['projects.read', 'campaigns.read', 'support.read'],
      },
      enabledModuleKeys: ['projects', 'campaigns', 'support', 'blueprints'],
    })
    const labels = items.map(item => item.label)

    expect(items[0]).toEqual({ label: 'Visao Geral', href: '/portal' })
    expect(labels).toContain('Projetos')
    expect(labels).toContain('Campanhas')
    expect(labels).toContain('Suporte')
    expect(labels).not.toContain('Clientes')
    expect(labels).not.toContain('Modelos Setoriais')
    expect(items.find(item => item.moduleKey === 'campaigns')?.href).toBe('/portal/marketing/campanhas')
  })

  it('builds contracted commercial MVP portal routes', () => {
    const items = buildNavigation({
      ...internalContext,
      mode: 'portal',
      role: {
        key: 'client_admin',
        name: 'Client Admin',
        scope: 'client',
        permissions: ['crm.read', 'leads.read', 'omnichannel.read', 'landing_pages.read', 'campaigns.read', 'reports.read'],
      },
      enabledModuleKeys: ['crm', 'whatsapp_ai', 'landing_pages', 'campaigns', 'bi_reports'],
    })
    const portalRoutes = items.map(item => item.href)
    const labels = items.map(item => item.label)

    expect(labels).toEqual(expect.arrayContaining([
      'Leads',
      'Funis',
      'Conversas',
      'Canais',
      'Landing Pages',
      'Campanhas',
      'Relatorios',
    ]))

    expect(portalRoutes).toEqual(expect.arrayContaining([
      '/portal/comercial/leads',
      '/portal/comercial/funis',
      '/portal/atendimento/conversas',
      '/portal/atendimento/canais',
      '/portal/marketing/landing-pages',
      '/portal/marketing/campanhas',
      '/portal/relatorios',
    ]))
    expect(items.find(item => item.moduleKey === 'landing_pages')).toEqual({
      label: 'Landing Pages',
      href: '/portal/marketing/landing-pages',
      moduleKey: 'landing_pages',
    })
  })

  it('does not show base portal modules when they are disabled by contract', () => {
    const items = buildNavigation({
      ...internalContext,
      mode: 'portal',
      role: {
        key: 'client_admin',
        name: 'Client Admin',
        scope: 'client',
        permissions: ['projects.read', 'support.read'],
      },
      enabledModuleKeys: [],
    })
    const labels = items.map(item => item.label)

    expect(labels).not.toContain('Projetos')
    expect(labels).not.toContain('Suporte')
  })

  it('routes contracted client CRM access to the portal workspace', () => {
    const items = buildNavigation({
      ...internalContext,
      mode: 'portal',
      role: {
        key: 'client_admin',
        name: 'Client Admin',
        scope: 'client',
        permissions: ['crm.read', 'leads.read'],
      },
      enabledModuleKeys: ['crm'],
    })

    expect(items.find(item => item.moduleKey === 'crm')).toEqual({
      label: 'Leads',
      href: '/portal/comercial/leads',
      moduleKey: 'crm',
    })
    expect(items.find(item => item.moduleKey === 'clients')).toBeUndefined()
  })

  it('routes contracted proposals to the portal approval queue only when enabled', () => {
    const context: PlatformContext = {
      ...internalContext,
      mode: 'portal',
      role: {
        key: 'client_admin',
        name: 'Client Admin',
        scope: 'client',
        permissions: ['proposals.read'],
      },
      enabledModuleKeys: ['proposals'],
    }

    expect(buildNavigation(context).find(item => item.moduleKey === 'proposals')).toEqual({
      label: 'Propostas',
      href: '/portal/projetos/aprovacoes',
      moduleKey: 'proposals',
    })
    expect(buildNavigation({ ...context, enabledModuleKeys: [] }).find(item => item.moduleKey === 'proposals')).toBeUndefined()
  })

  it('keeps whatsapp_ai as the commercial key while routing the portal atendimento workspace', () => {
    const portalItems = buildNavigation({
      ...internalContext,
      mode: 'portal',
      role: {
        key: 'client_admin',
        name: 'Client Admin',
        scope: 'client',
        permissions: ['omnichannel.read'],
      },
      enabledModuleKeys: ['whatsapp_ai'],
    })

    expect(portalItems.find(item => item.moduleKey === 'whatsapp_ai')).toEqual({
      label: 'Conversas',
      href: '/portal/atendimento/conversas',
      moduleKey: 'whatsapp_ai',
    })
  })

  it('hides portal atendimento when whatsapp_ai is disabled by contract', () => {
    const items = buildNavigation({
      ...internalContext,
      mode: 'portal',
      role: {
        key: 'client_admin',
        name: 'Client Admin',
        scope: 'client',
        permissions: ['omnichannel.read', 'omnichannel.write'],
      },
      enabledModuleKeys: ['projects'],
    })

    expect(items.find(item => item.moduleKey === 'whatsapp_ai')).toBeUndefined()
  })

  it('routes Marketing Studio inside the contracted portal journey', () => {
    const portalItems = buildNavigation({
      ...internalContext,
      mode: 'portal',
      role: {
        key: 'client_admin',
        name: 'Client Admin',
        scope: 'client',
        permissions: ['marketing_studio.read'],
      },
      enabledModuleKeys: ['marketing_studio'],
    })

    expect(portalItems.find(item => item.moduleKey === 'marketing_studio')).toEqual({
      label: 'Marketing Studio',
      href: '/portal/marketing/studio',
      moduleKey: 'marketing_studio',
    })
  })
})

describe('buildNavigationGroups', () => {
  it('builds grouped internal navigation for YUX Hub journeys', () => {
    const groups = buildNavigationGroups({
      ...internalContext,
      enabledModuleKeys: [
        'clients',
        'crm',
        'projects',
        'proposals',
        'landing_pages',
        'campaigns',
        'bi_reports',
        'automations',
        'support',
        'finance',
        'blueprints',
        'whatsapp_ai',
        'marketing_studio',
      ],
    })

    expect(groups.map(group => group.label)).toEqual([
      'Visao Geral',
      'Clientes & Contratos',
      'Operacao',
      'Workspaces dos Clientes',
      'Administracao da Plataforma',
      'Financeiro',
    ])
    expect(groups.find(group => group.label === 'Visao Geral')?.items).toEqual([
      { label: 'Dashboard', href: '/dashboard' },
    ])
    expect(groups.find(group => group.label === 'Clientes & Contratos')?.items).toEqual([
      { label: 'Clientes', href: '/clients', moduleKey: 'clients' },
      { label: 'Conversoes de Leads', href: '/client-conversions', moduleKey: 'crm' },
      { label: 'Contratos', href: '/contracts' },
      { label: 'Pacotes', href: '/packages' },
      { label: 'Modulos Contratados', href: '/modules' },
      { label: 'Creditos e Limites', href: '/admin/limits' },
    ])
    expect(groups.find(group => group.label === 'Workspaces dos Clientes')?.items).toEqual([
      { label: 'Selecionar Cliente', href: '/client-workspaces' },
      { label: 'Crescimento YUX', href: '/client-workspaces' },
    ])
    expect(groups.find(group => group.label === 'Administracao da Plataforma')?.items).toEqual([
      { label: 'Admin YUX Hub', href: '/admin' },
      { label: 'Modelos Setoriais', href: '/blueprints', moduleKey: 'blueprints' },
      { label: 'Catalogo de Modulos', href: '/admin/modules-governance' },
      { label: 'Integracoes Globais', href: '/admin/integrations' },
      { label: 'IA / Modelos / Custos', href: '/admin/ai' },
      { label: 'Strategy Engine', href: '/admin/strategy-engine' },
      { label: 'Aprendizado de Missões', href: '/admin/mission-learning' },
      { label: 'Canais', href: '/admin/channels' },
      { label: 'Email', href: '/admin/email' },
      { label: 'Modelos de Email', href: '/admin/email/templates' },
      { label: 'Saude da Plataforma', href: '/admin/health' },
    ])
    expect(groups.find(group => group.label === 'Financeiro')?.items).toEqual([
      { label: 'Faturas', href: '/finance', moduleKey: 'finance' },
      { label: 'Cobrancas', href: '/finance', moduleKey: 'finance' },
      { label: 'Receita', href: '/finance', moduleKey: 'finance' },
    ])
  })

  it('filters grouped internal module items through permissions and enabled modules', () => {
    const groups = buildNavigationGroups({
      ...internalContext,
      role: {
        key: 'yux_manager',
        name: 'YUX Manager',
        scope: 'internal',
        permissions: ['crm.read', 'leads.read', 'projects.read'],
      },
      enabledModuleKeys: ['crm', 'projects', 'support', 'finance'],
    })
    const operacaoItems = groups.find(group => group.label === 'Operacao')?.items
    const clientOperationItems = groups.find(group => group.label === 'Workspaces dos Clientes')?.items
    const financeiroItems = groups.find(group => group.label === 'Financeiro')?.items

    expect(operacaoItems).toEqual([
      { label: 'Projetos', href: '/projects', moduleKey: 'projects' },
      { label: 'Entregaveis', href: '/projects', moduleKey: 'projects' },
      { label: 'Aprovacoes', href: '/projects', moduleKey: 'projects' },
    ])
    expect(clientOperationItems).toEqual([
      { label: 'Selecionar Cliente', href: '/client-workspaces' },
      { label: 'Crescimento YUX', href: '/client-workspaces' },
    ])
    expect(financeiroItems).toEqual([])
  })

  it('builds portal navigation by client journeys', () => {
    const groups = buildNavigationGroups({
      ...internalContext,
      mode: 'portal',
      role: {
        key: 'client_admin',
        name: 'Client Admin',
        scope: 'client',
        permissions: [
          'crm.read',
          'leads.read',
          'omnichannel.read',
          'landing_pages.read',
          'campaigns.read',
          'marketing_studio.read',
          'reports.read',
          'projects.read',
          'support.read',
          'finance.read',
        ],
      },
      enabledModuleKeys: [
        'crm',
        'whatsapp_ai',
        'landing_pages',
        'campaigns',
        'marketing_studio',
        'bi_reports',
        'projects',
        'support',
        'finance',
      ],
    })

    expect(groups.map(group => group.label)).toEqual([
      'Visao Geral',
      'Empresa',
      'Comercial',
      'Atendimento & IA',
      'Marketing',
      'Projetos',
      'Relatorios',
      'Suporte',
      'Financeiro',
      'Configuracoes da Conta',
    ])
    expect(groups.find(group => group.label === 'Comercial')?.items).toEqual(expect.arrayContaining([
      { label: 'Leads', href: '/portal/comercial/leads', moduleKey: 'crm' },
      { label: 'Funis', href: '/portal/comercial/funis', moduleKey: 'crm' },
    ]))
    expect(groups.find(group => group.label === 'Atendimento & IA')?.items).toEqual(expect.arrayContaining([
      { label: 'Conversas', href: '/portal/atendimento/conversas', moduleKey: 'whatsapp_ai' },
      { label: 'Canais', href: '/portal/atendimento/canais', moduleKey: 'whatsapp_ai' },
    ]))
    expect(groups.find(group => group.label === 'Marketing')?.items).toEqual(expect.arrayContaining([
      { label: 'Landing Pages', href: '/portal/marketing/landing-pages', moduleKey: 'landing_pages' },
      { label: 'Formulários externos', href: '/portal/marketing/formularios', moduleKey: 'landing_pages' },
      { label: 'Campanhas', href: '/portal/marketing/campanhas', moduleKey: 'campaigns' },
      { label: 'Marketing Studio', href: '/portal/marketing/studio', moduleKey: 'marketing_studio' },
      { label: 'Central de Conteudo', href: '/portal/marketing/conteudo', moduleKey: 'marketing_studio' },
      { label: 'Criativos e Inspiracoes', href: '/portal/marketing/criativos', moduleKey: 'marketing_studio' },
    ]))
  })

  it('adds portal automations journey only when contracted', () => {
    const groups = buildNavigationGroups({
      ...internalContext,
      mode: 'portal',
      role: {
        key: 'client_admin',
        name: 'Client Admin',
        scope: 'client',
        permissions: ['automations.read'],
      },
      enabledModuleKeys: ['automations'],
    })

    expect(groups.find(group => group.label === 'Automacoes')?.items).toEqual([
      { label: 'Fluxos', href: '/portal/automacoes/fluxos', moduleKey: 'automations' },
      { label: 'Templates', href: '/portal/automacoes/templates', moduleKey: 'automations' },
      { label: 'Execucoes', href: '/portal/automacoes/execucoes', moduleKey: 'automations' },
      { label: 'Logs', href: '/portal/automacoes/logs', moduleKey: 'automations' },
    ])
  })

  it('adds portal email templates only to the real client portal settings', () => {
    const portalGroups = buildNavigationGroups({
      ...internalContext,
      mode: 'portal',
      role: {
        key: 'client_admin',
        name: 'Client Admin',
        scope: 'client',
        permissions: [],
      },
      enabledModuleKeys: [],
    })
    const workspaceGroups = buildNavigationGroups({
      ...internalContext,
      mode: 'client_workspace',
      organization: {
        id: 'org-client-1',
        name: 'Empresa ABC',
        slug: 'empresa-abc',
        kind: 'client',
        clientId: 'client-1',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      enabledModuleKeys: [],
    })

    expect(portalGroups.find(group => group.label === 'Configuracoes da Conta')?.items).toContainEqual({
      label: 'Modelos de Email',
      href: '/portal/configuracoes/emails',
    })
    expect(workspaceGroups.find(group => group.label === 'Configuracoes da Conta')?.items).toEqual([
      { label: 'Conta', href: '/client-workspaces/org-client-1/configuracoes/conta' },
    ])
  })

  it('builds client workspace navigation with selected client route prefix', () => {
    const groups = buildNavigationGroups({
      ...internalContext,
      mode: 'client_workspace',
      organization: {
        id: 'org-client-1',
        name: 'Empresa ABC',
        slug: 'empresa-abc',
        kind: 'client',
        clientId: 'client-1',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      role: {
        key: 'client_admin',
        name: 'Client Admin',
        scope: 'client',
        permissions: [
          'crm.read',
          'leads.read',
          'omnichannel.read',
          'marketing_studio.read',
          'projects.read',
          'finance.read',
        ],
      },
      enabledModuleKeys: ['crm', 'whatsapp_ai', 'marketing_studio', 'projects', 'finance'],
    })

    expect(groups[0]).toEqual({
      label: 'Workspaces dos Clientes',
      items: [{ label: 'Selecionar Cliente', href: '/client-workspaces' }],
    })
    expect(groups.find(group => group.label === 'Visao Geral')?.items).toEqual([
      { label: 'Visao Geral', href: '/client-workspaces/org-client-1' },
    ])
    expect(groups.find(group => group.label === 'Comercial')?.items).toEqual(expect.arrayContaining([
      { label: 'Leads', href: '/client-workspaces/org-client-1/comercial/leads', moduleKey: 'crm' },
      { label: 'Funis', href: '/client-workspaces/org-client-1/comercial/funis', moduleKey: 'crm' },
    ]))
    expect(groups.find(group => group.label === 'Atendimento & IA')?.items).toEqual(expect.arrayContaining([
      { label: 'Conversas', href: '/client-workspaces/org-client-1/atendimento/conversas', moduleKey: 'whatsapp_ai' },
    ]))
    expect(groups.find(group => group.label === 'Financeiro')?.items).toEqual([
      { label: 'Financeiro', href: '/client-workspaces/org-client-1/financeiro', moduleKey: 'finance' },
    ])
  })

  it('does not show portal journeys in client workspace before a client is selected', () => {
    const groups = buildNavigationGroups({
      ...internalContext,
      mode: 'client_workspace',
      organization: null,
      enabledModuleKeys: ['crm', 'finance'],
    })

    expect(groups).toEqual([
      {
        label: 'Workspaces dos Clientes',
        items: [{ label: 'Selecionar Cliente', href: '/client-workspaces' }],
      },
    ])
  })

  it('does not expose technical module labels as portal groups', () => {
    const groups = buildNavigationGroups({
      ...internalContext,
      mode: 'portal',
      role: {
        key: 'client_admin',
        name: 'Client Admin',
        scope: 'client',
        permissions: ['omnichannel.read', 'crm.read', 'leads.read'],
      },
      enabledModuleKeys: ['whatsapp_ai', 'crm'],
    })

    expect(groups.map(group => group.label)).not.toEqual(expect.arrayContaining([
      'Omnichannel',
      'CRM Governance',
      'Knowledge Source',
    ]))
  })

  it('builds client-oriented breadcrumbs from portal journeys', () => {
    const breadcrumbs = buildBreadcrumbs({
      ...internalContext,
      mode: 'portal',
      role: {
        key: 'client_admin',
        name: 'Client Admin',
        scope: 'client',
        permissions: ['marketing_studio.read'],
      },
      enabledModuleKeys: ['marketing_studio'],
    }, '/portal/marketing/calendario')

    expect(breadcrumbs).toEqual([
      { label: 'Portal do Cliente', href: '/portal' },
      { label: 'Marketing' },
      { label: 'Calendario Editorial' },
    ])
  })
})
