import { describe, expect, it } from 'vitest'
import { buildNavigation, buildNavigationGroups } from '@/lib/platform/navigation'
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
    expect(labels).toContain('CRM & Funis')
    expect(labels).toContain('Projetos')
    expect(labels).toContain('Campanhas')
    expect(labels).toContain('Blueprints')
    expect(items.find(item => item.label === 'CRM & Funis')?.href).toBe('/leads')
  })

  it('builds the client-operations route set for internal users', () => {
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

    expect(items).toEqual(expect.arrayContaining([
      { label: 'CRM & Funis', href: '/leads', moduleKey: 'crm' },
      { label: 'Conversas', href: '/omnichannel', moduleKey: 'whatsapp_ai' },
      { label: 'Agente IA', href: '/omnichannel', moduleKey: 'whatsapp_ai' },
      { label: 'Landing Pages', href: '/landing-pages', moduleKey: 'landing_pages' },
      { label: 'Campanhas', href: '/campaigns', moduleKey: 'campaigns' },
      { label: 'Marketing Studio', href: '/marketing-studio', moduleKey: 'marketing_studio' },
      { label: 'Automacoes', href: '/automations', moduleKey: 'automations' },
      { label: 'Relatorios', href: '/reports', moduleKey: 'bi_reports' },
    ]))
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
    expect(labels).not.toContain('Blueprints')
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

  it('keeps whatsapp_ai as the commercial key while routing the atendimento workspace', () => {
    const internalItems = buildNavigation({
      ...internalContext,
      role: {
        key: 'yux_manager',
        name: 'YUX Manager',
        scope: 'internal',
        permissions: ['omnichannel.read'],
      },
      enabledModuleKeys: ['whatsapp_ai'],
    })
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

    expect(internalItems.find(item => item.moduleKey === 'whatsapp_ai')).toEqual({
      label: 'Conversas',
      href: '/omnichannel',
      moduleKey: 'whatsapp_ai',
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

  it('routes Marketing Studio internally and in the contracted portal', () => {
    const internalItems = buildNavigation({
      ...internalContext,
      role: {
        key: 'yux_manager',
        name: 'YUX Manager',
        scope: 'internal',
        permissions: ['marketing_studio.read'],
      },
      enabledModuleKeys: ['marketing_studio'],
    })
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

    expect(internalItems.find(item => item.moduleKey === 'marketing_studio')).toEqual({
      label: 'Marketing Studio',
      href: '/marketing-studio',
      moduleKey: 'marketing_studio',
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
      'Comercial YUX',
      'Clientes & Contratos',
      'Operacao',
      'Operacao dos Clientes',
      'Administracao da Plataforma',
      'Financeiro',
    ])
    expect(groups.find(group => group.label === 'Visao Geral')?.items).toEqual([
      { label: 'Dashboard', href: '/dashboard' },
    ])
    expect(groups.find(group => group.label === 'Clientes & Contratos')?.items).toEqual([
      { label: 'Clientes', href: '/clients', moduleKey: 'clients' },
      { label: 'Contratos', href: '/contracts' },
      { label: 'Pacotes', href: '/packages' },
      { label: 'Modulos Contratados', href: '/modules' },
      { label: 'Creditos e Limites', href: '/admin/limits' },
    ])
    expect(groups.find(group => group.label === 'Operacao dos Clientes')?.items).toEqual([
      { label: 'CRM & Funis', href: '/leads', moduleKey: 'crm' },
      { label: 'Conversas', href: '/omnichannel', moduleKey: 'whatsapp_ai' },
      { label: 'Agente IA', href: '/omnichannel', moduleKey: 'whatsapp_ai' },
      { label: 'Landing Pages', href: '/landing-pages', moduleKey: 'landing_pages' },
      { label: 'Campanhas', href: '/campaigns', moduleKey: 'campaigns' },
      { label: 'Marketing Studio', href: '/marketing-studio', moduleKey: 'marketing_studio' },
      { label: 'Automacoes', href: '/automations', moduleKey: 'automations' },
      { label: 'Relatorios', href: '/reports', moduleKey: 'bi_reports' },
    ])
    expect(groups.find(group => group.label === 'Administracao da Plataforma')?.items).toEqual([
      { label: 'Admin YUX Hub', href: '/admin' },
      { label: 'Blueprints', href: '/blueprints', moduleKey: 'blueprints' },
      { label: 'Catalogo de Modulos', href: '/admin/modules-governance' },
      { label: 'Integracoes Globais', href: '/admin/integrations' },
      { label: 'IA / Modelos / Custos', href: '/admin/ai' },
      { label: 'Canais', href: '/admin/channels' },
      { label: 'Email', href: '/admin/email' },
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
    const clientOperationItems = groups.find(group => group.label === 'Operacao dos Clientes')?.items
    const financeiroItems = groups.find(group => group.label === 'Financeiro')?.items

    expect(operacaoItems).toEqual([
      { label: 'Projetos', href: '/projects', moduleKey: 'projects' },
      { label: 'Entregaveis', href: '/projects', moduleKey: 'projects' },
      { label: 'Aprovacoes', href: '/projects', moduleKey: 'projects' },
    ])
    expect(clientOperationItems).toEqual([
      { label: 'CRM & Funis', href: '/leads', moduleKey: 'crm' },
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
      { label: 'Campanhas', href: '/portal/marketing/campanhas', moduleKey: 'campaigns' },
      { label: 'Marketing Studio', href: '/portal/marketing/studio', moduleKey: 'marketing_studio' },
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
})
