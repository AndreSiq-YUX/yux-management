import { describe, expect, it } from 'vitest'
import { buildBreadcrumbs, buildNavigation, buildNavigationFooter, buildNavigationGroups, resolveActiveNavigationItem } from '@/lib/platform/navigation'
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

const clientOrganization: NonNullable<PlatformContext['organization']> = {
  id: 'org-client-1',
  name: 'Empresa ABC',
  slug: 'empresa-abc',
  kind: 'client',
  clientId: 'client-1',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

const allModulesPortalContext: PlatformContext = {
  mode: 'portal',
  organization: clientOrganization,
  membership: null,
  role: {
    key: 'client_admin',
    name: 'Client Admin',
    scope: 'client',
    permissions: ['platform.manage', 'radar.read'],
  },
  enabledModuleKeys: [
    'crm', 'whatsapp_ai', 'landing_pages', 'campaigns', 'marketing_studio', 'automations',
    'action_engine', 'projects', 'proposals', 'bi_reports', 'support', 'finance',
  ],
}

describe('buildNavigation', () => {
  it('links entitled client Radar with its own module key, not CRM', () => {
    const context: PlatformContext = {
      ...internalContext, mode: 'portal',
      organization: { id: 'org', kind: 'client', name: 'Cliente', slug: 'cliente', createdAt: '', updatedAt: '' },
      role: { key: 'client_admin', name: 'Cliente', scope: 'client', permissions: ['radar.read'] },
      enabledModuleKeys: ['radar'],
    }
    expect(buildNavigation(context)).toContainEqual({ label: 'Radar Comercial', href: '/portal/comercial/radar', moduleKey: 'radar' })
    expect(buildNavigation({ ...context, enabledModuleKeys: ['crm'] }).some(item => item.moduleKey === 'radar')).toBe(false)
  })
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

    expect(items[0]).toEqual({ label: 'Visão geral', href: '/portal' })
    expect(labels).toContain('Projetos e entregas')
    expect(labels).toContain('Campanhas')
    expect(labels).toContain('Ajuda e suporte')
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
      'Canais conectados',
      'Landing pages',
      'Campanhas',
      'Relatórios',
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
      label: 'Landing pages',
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

    expect(labels).not.toContain('Projetos e entregas')
    expect(labels).not.toContain('Ajuda e suporte')
    expect(labels).not.toContain('Financeiro')
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

  it('routes contracted proposals to the portal proposals page only when enabled', () => {
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
      href: '/portal/projetos/propostas',
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
    const groups = buildNavigationGroups(allModulesPortalContext)

    expect(groups.map(group => group.label)).toEqual([
      'Início',
      'Comercial',
      'Atendimento',
      'Marketing',
      'Automações',
      'Execução YUX',
      'Projetos',
      'Resultados',
      'Empresa',
    ])
    expect(groups.find(group => group.label === 'Início')?.items).toEqual([
      { label: 'Visão geral', href: '/portal' },
      { label: 'Aprovações', href: '/portal/projetos/aprovacoes', badge: 'approvals' },
    ])
    expect(groups.find(group => group.label === 'Comercial')?.items.map(item => item.label)).toEqual([
      'Leads',
      'Funis',
      'Tarefas e follow-ups',
      'Empresas e contas',
      'Pontuação de leads',
    ])
    expect(groups.find(group => group.label === 'Atendimento')?.items).toEqual([
      { label: 'Conversas', href: '/portal/atendimento/conversas', moduleKey: 'whatsapp_ai' },
      { label: 'Agente IA', href: '/portal/atendimento/agente-ia', moduleKey: 'whatsapp_ai' },
      { label: 'Canais conectados', href: '/portal/atendimento/canais', moduleKey: 'whatsapp_ai' },
      { label: 'Filas e transferência', href: '/portal/atendimento/filas-handoff', moduleKey: 'whatsapp_ai' },
    ])
    expect(groups.find(group => group.label === 'Marketing')?.items.map(item => item.label)).toEqual([
      'Campanhas',
      'Landing pages',
      'Formulários externos',
      'Marketing Studio',
      'Central de conteúdo',
      'Calendário editorial',
      'Criativos e inspirações',
    ])
    expect(groups.find(group => group.label === 'Automações')?.items.map(item => item.label)).toEqual([
      'Fluxos',
      'Modelos de fluxo',
      'Execuções',
    ])
    expect(groups.find(group => group.label === 'Execução YUX')?.items).toEqual([
      { label: 'Missões', href: '/portal/missoes', moduleKey: 'action_engine' },
    ])
    expect(groups.find(group => group.label === 'Projetos')?.items.map(item => item.label)).toEqual([
      'Projetos e entregas',
      'Documentos',
      'Propostas',
    ])
    expect(groups.find(group => group.label === 'Resultados')?.items).toEqual([
      { label: 'Relatórios', href: '/portal/relatorios', moduleKey: 'bi_reports' },
    ])
    expect(groups.find(group => group.label === 'Empresa')?.items).toEqual([
      { label: 'Perfil da empresa', href: '/portal/empresa/perfil' },
      { label: 'Marca e tom de voz', href: '/portal/empresa/marca' },
      { label: 'Base de conhecimento', href: '/portal/empresa/conhecimento' },
      { label: 'Equipe', href: '/portal/empresa/usuarios' },
      { label: 'Conexões', href: '/portal/empresa/integracoes' },
      { label: 'Modelos de e-mail', href: '/portal/configuracoes/emails' },
    ])
  })

  it('never repeats an href inside the portal navigation', () => {
    const workspaceContext: PlatformContext = { ...allModulesPortalContext, mode: 'client_workspace' }
    for (const context of [allModulesPortalContext, workspaceContext]) {
      const hrefs = buildNavigation(context).map(item => item.href)
      expect(new Set(hrefs).size).toBe(hrefs.length)
    }
  })

  it('shows only the base groups when no module is contracted', () => {
    const groups = buildNavigationGroups({ ...allModulesPortalContext, enabledModuleKeys: [] })

    expect(groups.map(group => group.label)).toEqual(['Início', 'Empresa'])
  })

  it('exposes the footer items according to the contracted modules', () => {
    expect(buildNavigationFooter(allModulesPortalContext)).toEqual([
      { label: 'Financeiro', href: '/portal/financeiro', moduleKey: 'finance' },
      { label: 'Ajuda e suporte', href: '/portal/suporte', moduleKey: 'support' },
      { label: 'Minha conta', href: '/portal/configuracoes/conta' },
    ])
    expect(buildNavigationFooter({ ...allModulesPortalContext, enabledModuleKeys: ['finance'] })).toEqual([
      { label: 'Financeiro', href: '/portal/financeiro', moduleKey: 'finance' },
      { label: 'Minha conta', href: '/portal/configuracoes/conta' },
    ])
    expect(buildNavigationFooter({ ...allModulesPortalContext, enabledModuleKeys: [] })).toEqual([
      { label: 'Minha conta', href: '/portal/configuracoes/conta' },
    ])
    expect(buildNavigationFooter(internalContext)).toEqual([])
  })

  it('keeps the old automation logs route out of the menu', () => {
    const groups = buildNavigationGroups({
      ...allModulesPortalContext,
      enabledModuleKeys: ['automations'],
    })

    expect(groups.find(group => group.label === 'Automações')?.items).toEqual([
      { label: 'Fluxos', href: '/portal/automacoes/fluxos', moduleKey: 'automations' },
      { label: 'Modelos de fluxo', href: '/portal/automacoes/templates', moduleKey: 'automations' },
      { label: 'Execuções', href: '/portal/automacoes/execucoes', moduleKey: 'automations' },
    ])
    expect(buildNavigation(allModulesPortalContext).some(item => item.href.endsWith('/automacoes/logs'))).toBe(false)
  })

  it('adds portal email templates only to the real client portal', () => {
    const portalItems = buildNavigation({ ...allModulesPortalContext, enabledModuleKeys: [] })
    const workspaceItems = buildNavigation({
      ...allModulesPortalContext,
      mode: 'client_workspace',
      enabledModuleKeys: [],
    })

    expect(portalItems).toContainEqual({ label: 'Modelos de e-mail', href: '/portal/configuracoes/emails' })
    expect(workspaceItems.find(item => item.label === 'Modelos de e-mail')).toBeUndefined()
    expect(workspaceItems).toContainEqual({ label: 'Minha conta', href: '/client-workspaces/org-client-1/configuracoes/conta' })
  })

  it('builds client workspace navigation with selected client route prefix', () => {
    const context: PlatformContext = {
      ...allModulesPortalContext,
      mode: 'client_workspace',
      enabledModuleKeys: ['crm', 'whatsapp_ai', 'marketing_studio', 'projects', 'finance'],
    }
    const groups = buildNavigationGroups(context)

    expect(groups.find(group => group.label === 'Início')?.items).toEqual([
      { label: 'Visão geral', href: '/client-workspaces/org-client-1' },
      { label: 'Aprovações', href: '/client-workspaces/org-client-1/projetos/aprovacoes', badge: 'approvals' },
    ])
    expect(groups.find(group => group.label === 'Comercial')?.items).toEqual(expect.arrayContaining([
      { label: 'Leads', href: '/client-workspaces/org-client-1/comercial/leads', moduleKey: 'crm' },
      { label: 'Funis', href: '/client-workspaces/org-client-1/comercial/funis', moduleKey: 'crm' },
    ]))
    expect(groups.find(group => group.label === 'Atendimento')?.items).toEqual(expect.arrayContaining([
      { label: 'Conversas', href: '/client-workspaces/org-client-1/atendimento/conversas', moduleKey: 'whatsapp_ai' },
    ]))
    expect(buildNavigationFooter(context)).toContainEqual({
      label: 'Financeiro',
      href: '/client-workspaces/org-client-1/financeiro',
      moduleKey: 'finance',
    })
    // A troca de cliente fica no cartão da empresa, não numa entrada do menu.
    expect(groups.some(group => group.label === 'Workspaces dos Clientes')).toBe(false)
  })

  it('does not show portal journeys in client workspace before a client is selected', () => {
    const context: PlatformContext = {
      ...internalContext,
      mode: 'client_workspace',
      organization: null,
      enabledModuleKeys: ['crm', 'finance'],
    }

    expect(buildNavigationGroups(context)).toEqual([
      {
        label: 'Workspaces dos Clientes',
        items: [{ label: 'Selecionar cliente', href: '/client-workspaces' }],
      },
    ])
    expect(buildNavigationFooter(context)).toEqual([])
  })

  it('does not expose technical module labels as portal groups', () => {
    const groups = buildNavigationGroups({
      ...allModulesPortalContext,
      enabledModuleKeys: ['whatsapp_ai', 'crm'],
    })

    expect(groups.map(group => group.label)).not.toEqual(expect.arrayContaining([
      'Omnichannel',
      'CRM Governance',
      'Knowledge Source',
    ]))
  })
})

describe('resolveActiveNavigationItem', () => {
  const items = buildNavigation(allModulesPortalContext)

  it('keeps the root item active only on its exact address', () => {
    expect(resolveActiveNavigationItem(items, '/portal')?.label).toBe('Visão geral')
    expect(resolveActiveNavigationItem(items, '/portal/comercial/leads')?.label).toBe('Leads')
    expect(resolveActiveNavigationItem(items, '/portal/pagina-sem-menu')).toBeUndefined()
  })

  it('activates exactly one item per address, including child routes', () => {
    expect(resolveActiveNavigationItem(items, '/portal/projetos/aprovacoes')?.label).toBe('Aprovações')
    expect(resolveActiveNavigationItem(items, '/portal/projetos/propostas')?.label).toBe('Propostas')
    expect(resolveActiveNavigationItem(items, '/portal/missoes/conversas/abc')?.label).toBe('Missões')
    expect(resolveActiveNavigationItem(items, '/portal/automacoes/execucoes/')?.label).toBe('Execuções')
  })

  it('does not light up the workspace root on inner pages', () => {
    const workspaceItems = buildNavigation({ ...allModulesPortalContext, mode: 'client_workspace' })

    expect(resolveActiveNavigationItem(workspaceItems, '/client-workspaces/org-client-1')?.label).toBe('Visão geral')
    expect(resolveActiveNavigationItem(workspaceItems, '/client-workspaces/org-client-1/missoes/m1')?.label).toBe('Missões')
  })
})

describe('buildBreadcrumbs', () => {
  it('builds client-oriented breadcrumbs from portal journeys', () => {
    const breadcrumbs = buildBreadcrumbs({
      ...allModulesPortalContext,
      enabledModuleKeys: ['marketing_studio'],
    }, '/portal/marketing/calendario')

    expect(breadcrumbs).toEqual([
      { label: 'Portal do Cliente', href: '/portal' },
      { label: 'Marketing' },
      { label: 'Calendário editorial' },
    ])
  })

  it('collapses a group label that equals the item label', () => {
    expect(buildBreadcrumbs(allModulesPortalContext, '/portal/relatorios')).toEqual([
      { label: 'Portal do Cliente', href: '/portal' },
      { label: 'Resultados' },
      { label: 'Relatórios' },
    ])
    expect(buildBreadcrumbs(allModulesPortalContext, '/portal/financeiro').map(crumb => crumb.label))
      .toEqual(['Portal do Cliente', 'Financeiro'])
    expect(buildBreadcrumbs(allModulesPortalContext, '/portal/projetos/projetos').map(crumb => crumb.label))
      .toEqual(['Portal do Cliente', 'Projetos', 'Projetos e entregas'])
  })

  it('never returns two consecutive crumbs with the same label', () => {
    for (const item of buildNavigation(allModulesPortalContext)) {
      const labels = buildBreadcrumbs(allModulesPortalContext, item.href).map(crumb => crumb.label.toLowerCase())
      labels.forEach((label, index) => {
        if (index > 0) expect(label).not.toBe(labels[index - 1])
      })
    }
  })

  it('keeps the child item link for nested routes', () => {
    expect(buildBreadcrumbs(allModulesPortalContext, '/portal/missoes/m1')).toEqual([
      { label: 'Portal do Cliente', href: '/portal' },
      { label: 'Execução YUX' },
      { label: 'Missões', href: '/portal/missoes' },
    ])
  })

  it('uses the workspace home for assisted client journeys', () => {
    expect(buildBreadcrumbs({
      ...allModulesPortalContext,
      mode: 'client_workspace',
    }, '/client-workspaces/org-client-1/configuracoes/conta')).toEqual([
      { label: 'Workspaces dos Clientes', href: '/client-workspaces' },
      { label: 'Minha conta' },
    ])
  })
})

describe('Radar gating in the portal navigation', () => {
  it('shows Radar only when the radar module is entitled', () => {
    const withRadar = buildNavigation({ ...allModulesPortalContext, enabledModuleKeys: ['radar', 'crm'] })
    const withoutRadar = buildNavigation({ ...allModulesPortalContext, enabledModuleKeys: ['crm'] })

    expect(withRadar.some(item => item.moduleKey === 'radar')).toBe(true)
    expect(withoutRadar.some(item => item.moduleKey === 'radar')).toBe(false)
  })

  it('hides Radar from roles without Radar permission even when the module is contracted', () => {
    const items = buildNavigation({
      ...allModulesPortalContext,
      role: { key: 'client_member', name: 'Membro', scope: 'client', permissions: ['platform.manage'] },
      enabledModuleKeys: ['radar', 'crm'],
    })

    expect(items.some(item => item.moduleKey === 'radar')).toBe(false)
  })
})
