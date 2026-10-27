import { canAccessModule } from '@/lib/platform/accessControl'
import { canShowRadarNavigation } from '@/lib/radar/radarRules'
import { PLATFORM_MODULES } from '@/lib/platform/moduleRegistry'
import type { PlatformContext } from '@/types/platform'

export interface NavigationItem {
  label: string
  href: string
  moduleKey?: string
  /** Contador real exibido ao lado do item (ex.: aprovações pendentes). */
  badge?: 'approvals'
}

export interface NavigationGroup {
  label: string
  items: NavigationItem[]
}

export interface BreadcrumbItem {
  label: string
  href?: string
}

const internalModuleGroups: Array<{ label: string; items: NavigationItem[] }> = [
  {
    label: 'Visao Geral',
    items: [
      { label: 'Dashboard', href: '/dashboard' },
    ],
  },
  {
    label: 'Clientes & Contratos',
    items: [
      { label: 'Clientes', href: '/clients', moduleKey: 'clients' },
      { label: 'Conversoes de Leads', href: '/client-conversions', moduleKey: 'crm' },
      { label: 'Contratos', href: '/contracts' },
      { label: 'Pacotes', href: '/packages' },
      { label: 'Modulos Contratados', href: '/modules' },
      { label: 'Creditos e Limites', href: '/admin/limits' },
    ],
  },
  {
    label: 'Operacao',
    items: [
      { label: 'Missões', href: '/missions', moduleKey: 'action_engine' },
      { label: 'Projetos', href: '/projects', moduleKey: 'projects' },
      { label: 'Entregaveis', href: '/projects', moduleKey: 'projects' },
      { label: 'Aprovacoes', href: '/projects', moduleKey: 'projects' },
      { label: 'Suporte', href: '/support', moduleKey: 'support' },
    ],
  },
  {
    label: 'Workspaces dos Clientes',
    items: [
      { label: 'Selecionar Cliente', href: '/client-workspaces' },
      { label: 'Crescimento YUX', href: '/client-workspaces' },
    ],
  },
  {
    label: 'Administracao da Plataforma',
    items: [
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
    ],
  },
  {
    label: 'Financeiro',
    items: [
      { label: 'Faturas', href: '/finance', moduleKey: 'finance' },
      { label: 'Cobrancas', href: '/finance', moduleKey: 'finance' },
      { label: 'Receita', href: '/finance', moduleKey: 'finance' },
    ],
  },
]

function canAccessModuleKey(moduleKey: string, context: PlatformContext) {
  const module = PLATFORM_MODULES.find(platformModule => platformModule.key === moduleKey)
  return Boolean(module && canAccessModule(module, context.role, context.enabledModuleKeys))
}

function filterNavigationItem(item: NavigationItem, context: PlatformContext) {
  if (!item.moduleKey) return item
  return canAccessModuleKey(item.moduleKey, context) ? item : null
}

function moduleItem(context: PlatformContext, item: NavigationItem): NavigationItem[] {
  if (!item.moduleKey) return [item]
  return canAccessModuleKey(item.moduleKey, context) ? [item] : []
}

function buildPortalNavigationGroups(context: PlatformContext, basePath = '/portal'): NavigationGroup[] {
  const href = (path = '') => `${basePath}${path}`

  const groups: NavigationGroup[] = [
    {
      label: 'Início',
      items: [
        { label: 'Visão geral', href: href() },
        { label: 'Aprovações', href: href('/projetos/aprovacoes'), badge: 'approvals' },
      ],
    },
    {
      label: 'Comercial',
      items: [
        ...moduleItem(context, { label: 'Leads', href: href('/comercial/leads'), moduleKey: 'crm' }),
        ...moduleItem(context, { label: 'Funis', href: href('/comercial/funis'), moduleKey: 'crm' }),
        ...moduleItem(context, { label: 'Tarefas e follow-ups', href: href('/comercial/tarefas'), moduleKey: 'crm' }),
        ...moduleItem(context, { label: 'Empresas e contas', href: href('/comercial/contas'), moduleKey: 'crm' }),
        ...moduleItem(context, { label: 'Pontuação de leads', href: href('/comercial/scoring'), moduleKey: 'crm' }),
        ...(canShowRadarNavigation(context) ? [{ label: 'Radar Comercial', href: href('/comercial/radar'), moduleKey: 'radar' }] : []),
      ],
    },
    {
      label: 'Atendimento',
      items: [
        ...moduleItem(context, { label: 'Conversas', href: href('/atendimento/conversas'), moduleKey: 'whatsapp_ai' }),
        ...moduleItem(context, { label: 'Agente IA', href: href('/atendimento/agente-ia'), moduleKey: 'whatsapp_ai' }),
        ...moduleItem(context, { label: 'Canais conectados', href: href('/atendimento/canais'), moduleKey: 'whatsapp_ai' }),
        ...moduleItem(context, { label: 'Filas e transferência', href: href('/atendimento/filas-handoff'), moduleKey: 'whatsapp_ai' }),
      ],
    },
    {
      label: 'Marketing',
      items: [
        ...moduleItem(context, { label: 'Campanhas', href: href('/marketing/campanhas'), moduleKey: 'campaigns' }),
        ...moduleItem(context, { label: 'Landing pages', href: href('/marketing/landing-pages'), moduleKey: 'landing_pages' }),
        ...moduleItem(context, { label: 'Formulários externos', href: href('/marketing/formularios'), moduleKey: 'landing_pages' }),
        ...moduleItem(context, { label: 'Marketing Studio', href: href('/marketing/studio'), moduleKey: 'marketing_studio' }),
        ...moduleItem(context, { label: 'Central de conteúdo', href: href('/marketing/conteudo'), moduleKey: 'marketing_studio' }),
        ...moduleItem(context, { label: 'Calendário editorial', href: href('/marketing/calendario'), moduleKey: 'marketing_studio' }),
        ...moduleItem(context, { label: 'Criativos e inspirações', href: href('/marketing/criativos'), moduleKey: 'marketing_studio' }),
      ],
    },
    {
      label: 'Automações',
      items: [
        ...moduleItem(context, { label: 'Fluxos', href: href('/automacoes/fluxos'), moduleKey: 'automations' }),
        ...moduleItem(context, { label: 'Modelos de fluxo', href: href('/automacoes/templates'), moduleKey: 'automations' }),
        ...moduleItem(context, { label: 'Execuções', href: href('/automacoes/execucoes'), moduleKey: 'automations' }),
      ],
    },
    {
      label: 'Execução YUX',
      items: [
        ...moduleItem(context, { label: 'Missões', href: href('/missoes'), moduleKey: 'action_engine' }),
      ],
    },
    {
      label: 'Projetos',
      items: [
        ...moduleItem(context, { label: 'Projetos e entregas', href: href('/projetos/projetos'), moduleKey: 'projects' }),
        ...moduleItem(context, { label: 'Documentos', href: href('/projetos/documentos'), moduleKey: 'projects' }),
        ...moduleItem(context, { label: 'Propostas', href: href('/projetos/propostas'), moduleKey: 'proposals' }),
      ],
    },
    {
      label: 'Resultados',
      items: moduleItem(context, { label: 'Relatórios', href: href('/relatorios'), moduleKey: 'bi_reports' }),
    },
    {
      label: 'Empresa',
      items: [
        { label: 'Perfil da empresa', href: href('/empresa/perfil') },
        { label: 'Marca e tom de voz', href: href('/empresa/marca') },
        { label: 'Estratégia', href: href('/empresa/estrategia') },
        { label: 'Base de conhecimento', href: href('/empresa/conhecimento') },
        { label: 'Equipe', href: href('/empresa/usuarios') },
        { label: 'Conexões', href: href('/empresa/integracoes') },
        ...(context.mode === 'portal' ? [{ label: 'Modelos de e-mail', href: href('/configuracoes/emails') }] : []),
      ],
    },
  ]

  return groups.filter(group => group.items.length > 0)
}

function buildPortalNavigationFooter(context: PlatformContext, basePath = '/portal'): NavigationItem[] {
  const href = (path = '') => `${basePath}${path}`

  return [
    ...moduleItem(context, { label: 'Financeiro', href: href('/financeiro'), moduleKey: 'finance' }),
    ...moduleItem(context, { label: 'Ajuda e suporte', href: href('/suporte'), moduleKey: 'support' }),
    { label: 'Minha conta', href: href('/configuracoes/conta') },
  ]
}

export function buildNavigationGroups(context: PlatformContext): NavigationGroup[] {
  if (context.mode === 'portal') {
    return buildPortalNavigationGroups(context)
  }

  if (context.mode === 'client_workspace') {
    if (!context.organization?.id) {
      return [
        {
          label: 'Workspaces dos Clientes',
          items: [
            { label: 'Selecionar cliente', href: '/client-workspaces' },
          ],
        },
      ]
    }

    // Com um cliente aberto, a troca de cliente fica no cartão da empresa (Sidebar).
    return buildPortalNavigationGroups(context, `/client-workspaces/${context.organization.id}`)
  }

  return internalModuleGroups.map(group => ({
    label: group.label,
    items: group.items.flatMap(item => {
      const filteredItem = filterNavigationItem(item, context)
      return filteredItem ? [filteredItem] : []
    }),
  }))
}

/** Itens fixados no rodapé do menu lateral (Financeiro, Ajuda e suporte, Minha conta). */
export function buildNavigationFooter(context: PlatformContext): NavigationItem[] {
  if (context.mode === 'portal') {
    return buildPortalNavigationFooter(context)
  }

  if (context.mode === 'client_workspace' && context.organization?.id) {
    return buildPortalNavigationFooter(context, `/client-workspaces/${context.organization.id}`)
  }

  return []
}

export function buildNavigation(context: PlatformContext): NavigationItem[] {
  return [
    ...buildNavigationGroups(context).flatMap(group => group.items),
    ...buildNavigationFooter(context),
  ]
}

function isRootHref(href: string) {
  return href === '/portal'
    || href === '/dashboard'
    || href === '/client-workspaces'
    || /^\/client-workspaces\/[^/]+$/.test(href)
}

function normalizePathname(pathname: string) {
  return pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname
}

/**
 * Descobre o único item de menu ativo para o endereço atual.
 * Endereço igual vence; senão vale o prefixo mais específico (ex.: `/portal/missoes/123`
 * acende "Missões"). Itens raiz (Visão geral, Dashboard) só acendem no endereço exato.
 */
export function resolveActiveNavigationItem(items: NavigationItem[], pathname: string): NavigationItem | undefined {
  const current = normalizePathname(pathname)
  const exact = items.find(item => item.href === current)
  if (exact) return exact

  return items
    .filter(item => !isRootHref(item.href) && current.startsWith(`${item.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]
}

const sameLabel = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

/** Remove migalhas repetidas em sequência ("Relatórios › Relatórios" vira "Relatórios"). */
function collapseRepeatedCrumbs(crumbs: BreadcrumbItem[]): BreadcrumbItem[] {
  return crumbs.filter((crumb, index) => {
    const next = crumbs[index + 1]
    return !next || !sameLabel(crumb.label, next.label)
  })
}

export function buildBreadcrumbs(context: PlatformContext, pathname: string): BreadcrumbItem[] {
  const home: BreadcrumbItem = context.mode === 'portal'
    ? { label: 'Portal do Cliente', href: '/portal' }
    : context.mode === 'client_workspace'
      ? { label: 'Workspaces dos Clientes', href: '/client-workspaces' }
      : { label: 'YUX Hub', href: '/dashboard' }
  const groups = buildNavigationGroups(context)
  const footer = buildNavigationFooter(context)
  const entries: Array<{ groupLabel?: string; item: NavigationItem }> = [
    ...groups.flatMap(group => group.items.map(item => ({ groupLabel: group.label, item }))),
    ...footer.map(item => ({ item })),
  ]
  const activeItem = resolveActiveNavigationItem(entries.map(entry => entry.item), pathname)
  const active = entries.find(entry => entry.item === activeItem)

  if (!active) return [home]

  const isExact = active.item.href === normalizePathname(pathname)
  const trail: BreadcrumbItem[] = [
    home,
    ...(active.groupLabel ? [{ label: active.groupLabel }] : []),
    isExact ? { label: active.item.label } : { label: active.item.label, href: active.item.href },
  ]

  return collapseRepeatedCrumbs(trail)
}
