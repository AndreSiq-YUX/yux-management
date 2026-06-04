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
    expect(labels).toContain('Governanca CRM')
    expect(labels).toContain('Governanca por Modulo')
    expect(labels).toContain('CRM & Funis')
    expect(labels).toContain('Projetos e Entregas')
    expect(labels).toContain('Campanhas')
    expect(labels).toContain('Blueprints')
    expect(items.find(item => item.moduleKey === 'crm')?.href).toBe('/leads')
  })

  it('builds the commercial MVP route set for internal users', () => {
    const items = buildNavigation({
      ...internalContext,
      role: {
        key: 'yux_admin',
        name: 'YUX Admin',
        scope: 'internal',
        permissions: ['platform.manage'],
      },
      enabledModuleKeys: ['crm', 'whatsapp_ai', 'landing_pages', 'campaigns', 'automations', 'bi_reports'],
    })
    const keyedItems = Object.fromEntries(items.filter(item => item.moduleKey).map(item => [item.moduleKey, item]))

    expect(Object.keys(keyedItems)).toEqual(expect.arrayContaining([
      'crm',
      'whatsapp_ai',
      'landing_pages',
      'campaigns',
      'automations',
      'bi_reports',
    ]))
    expect(keyedItems.crm).toMatchObject({ label: 'CRM & Funis', href: '/leads' })
    expect(keyedItems.whatsapp_ai).toMatchObject({ label: 'Conversas IA', href: '/omnichannel' })
    expect(keyedItems.landing_pages).toMatchObject({ label: 'Landing Pages', href: '/landing-pages' })
    expect(keyedItems.campaigns).toMatchObject({ label: 'Campanhas', href: '/campaigns' })
    expect(keyedItems.bi_reports).toMatchObject({ label: 'Relatorios & ROI', href: '/reports' })
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

    expect(items[0]).toEqual({ label: 'Portal', href: '/portal' })
    expect(labels).toContain('Projetos e Entregas')
    expect(labels).toContain('Campanhas')
    expect(labels).toContain('Suporte')
    expect(labels).not.toContain('Clientes')
    expect(labels).not.toContain('Blueprints')
    expect(items.find(item => item.moduleKey === 'campaigns')?.href).toBe('/portal/campaigns')
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
      'Leads & Funil',
      'Conversas IA',
      'Landing Pages',
      'Campanhas',
      'Relatorios',
    ]))

    expect(portalRoutes).toEqual(expect.arrayContaining([
      '/portal/crm',
      '/portal/omnichannel',
      '/portal/landing-pages',
      '/portal/campaigns',
      '/portal/reports',
    ]))
    expect(items.find(item => item.moduleKey === 'landing_pages')).toEqual({
      label: 'Landing Pages',
      href: '/portal/landing-pages',
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

    expect(labels).not.toContain('Projetos e Entregas')
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
      label: 'Leads & Funil',
      href: '/portal/crm',
      moduleKey: 'crm',
    })
    expect(items.find(item => item.moduleKey === 'clients')).toBeUndefined()
  })

  it('routes contracted proposals to the portal only when enabled', () => {
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
      href: '/portal/proposals',
      moduleKey: 'proposals',
    })
    expect(buildNavigation({ ...context, enabledModuleKeys: [] }).find(item => item.moduleKey === 'proposals')).toBeUndefined()
  })

  it('keeps whatsapp_ai as the commercial key while routing the omnichannel workspace', () => {
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
      label: 'Conversas IA',
      href: '/omnichannel',
      moduleKey: 'whatsapp_ai',
    })
    expect(portalItems.find(item => item.moduleKey === 'whatsapp_ai')).toEqual({
      label: 'Conversas IA',
      href: '/portal/omnichannel',
      moduleKey: 'whatsapp_ai',
    })
  })

  it('hides portal omnichannel when whatsapp_ai is disabled by contract', () => {
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
})

describe('buildNavigationGroups', () => {
  it('builds grouped internal navigation for YUX Hub administration', () => {
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
      ],
    })

    expect(groups.map(group => group.label)).toEqual([
      'Operacao',
      'Comercial',
      'Gestao YUX Hub',
      'Infraestrutura',
      'Financeiro',
    ])
    expect(groups.find(group => group.label === 'Operacao')?.items).toEqual([
      { label: 'Dashboard', href: '/dashboard' },
      { label: 'Clientes', href: '/clients', moduleKey: 'clients' },
      { label: 'Projetos e Entregas', href: '/projects', moduleKey: 'projects' },
      { label: 'Suporte', href: '/support', moduleKey: 'support' },
    ])
    expect(groups.find(group => group.label === 'Comercial')?.items).toEqual([
      { label: 'CRM & Funis', href: '/leads', moduleKey: 'crm' },
      { label: 'Automacoes', href: '/automations', moduleKey: 'automations' },
      { label: 'Propostas', href: '/proposals', moduleKey: 'proposals' },
      { label: 'Campanhas', href: '/campaigns', moduleKey: 'campaigns' },
      { label: 'Landing Pages', href: '/landing-pages', moduleKey: 'landing_pages' },
      { label: 'Relatorios & ROI', href: '/reports', moduleKey: 'bi_reports' },
      { label: 'Conversas IA', href: '/omnichannel', moduleKey: 'whatsapp_ai' },
    ])
    expect(groups.find(group => group.label === 'Gestao YUX Hub')?.items).toEqual([
      { label: 'Admin YUX Hub', href: '/admin' },
      { label: 'Contratos', href: '/contracts' },
      { label: 'Pacotes', href: '/packages' },
      { label: 'Modulos', href: '/modules' },
      { label: 'Governanca por Modulo', href: '/admin/modules-governance' },
      { label: 'Blueprints', href: '/blueprints', moduleKey: 'blueprints' },
      { label: 'Governanca CRM', href: '/crm-governance' },
    ])
    expect(groups.find(group => group.label === 'Infraestrutura')?.items).toEqual([
      { label: 'Integracoes', href: '/admin/integrations' },
      { label: 'IA', href: '/admin/ai' },
      { label: 'Email', href: '/admin/email' },
      { label: 'Saude', href: '/admin/health' },
    ])
    expect(groups.find(group => group.label === 'Financeiro')?.items).toEqual([
      { label: 'Financeiro', href: '/finance', moduleKey: 'finance' },
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
    const comercialItems = groups.find(group => group.label === 'Comercial')?.items
    const financeiroItems = groups.find(group => group.label === 'Financeiro')?.items

    expect(operacaoItems).toEqual([
      { label: 'Dashboard', href: '/dashboard' },
      { label: 'Projetos e Entregas', href: '/projects', moduleKey: 'projects' },
    ])
    expect(comercialItems).toEqual([
      { label: 'CRM & Funis', href: '/leads', moduleKey: 'crm' },
    ])
    expect(financeiroItems).toEqual([])
  })

  it('keeps portal navigation grouped for compatibility with client users', () => {
    const groups = buildNavigationGroups({
      ...internalContext,
      mode: 'portal',
      role: {
        key: 'client_admin',
        name: 'Client Admin',
        scope: 'client',
        permissions: ['projects.read', 'support.read'],
      },
      enabledModuleKeys: ['projects', 'support'],
    })

    expect(groups).toEqual([
      {
        label: 'Portal',
        items: [
          { label: 'Portal', href: '/portal' },
          { label: 'Projetos e Entregas', href: '/portal/projects', moduleKey: 'projects' },
          { label: 'Suporte', href: '/portal/support', moduleKey: 'support' },
        ],
      },
    ])
    expect(buildNavigation({
      ...internalContext,
      mode: 'portal',
      role: {
        key: 'client_admin',
        name: 'Client Admin',
        scope: 'client',
        permissions: ['projects.read', 'support.read'],
      },
      enabledModuleKeys: ['projects', 'support'],
    })).toEqual(groups[0].items)
  })
})
