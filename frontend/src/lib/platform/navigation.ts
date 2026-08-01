import { canAccessModule } from '@/lib/platform/accessControl'
import { canShowRadarNavigation } from '@/lib/radar/radarRules'
import { PLATFORM_MODULES } from '@/lib/platform/moduleRegistry'
import type { PlatformContext } from '@/types/platform'

export interface NavigationItem {
  label: string
  href: string
  moduleKey?: string
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
      label: 'Visao Geral',
      items: [{ label: 'Visao Geral', href: href() }],
    },
    {
      label: 'Empresa',
      items: [
        { label: 'Perfil da Empresa', href: href('/empresa/perfil') },
        { label: 'Usuarios e Equipe', href: href('/empresa/usuarios') },
        { label: 'Base de Conhecimento', href: href('/empresa/conhecimento') },
        { label: 'Marca e Tom de Voz', href: href('/empresa/marca') },
        { label: 'Integracoes', href: href('/empresa/integracoes') },
      ],
    },
    {
      label: 'Comercial',
      items: [
        ...moduleItem(context, { label: 'Leads', href: href('/comercial/leads'), moduleKey: 'crm' }),
        ...moduleItem(context, { label: 'Empresas / Contas', href: href('/comercial/contas'), moduleKey: 'crm' }),
        ...moduleItem(context, { label: 'Funis', href: href('/comercial/funis'), moduleKey: 'crm' }),
        ...moduleItem(context, { label: 'Tarefas e Follow-ups', href: href('/comercial/tarefas'), moduleKey: 'crm' }),
        ...(canShowRadarNavigation(context) ? [{ label: 'Radar Comercial', href: href('/comercial/radar'), moduleKey: 'crm' }] : []),
      ],
    },
    {
      label: 'Atendimento & IA',
      items: [
        ...moduleItem(context, { label: 'Conversas', href: href('/atendimento/conversas'), moduleKey: 'whatsapp_ai' }),
        ...moduleItem(context, { label: 'Agente IA', href: href('/atendimento/agente-ia'), moduleKey: 'whatsapp_ai' }),
        ...moduleItem(context, { label: 'Canais', href: href('/atendimento/canais'), moduleKey: 'whatsapp_ai' }),
        ...moduleItem(context, { label: 'Filas e Handoff', href: href('/atendimento/filas-handoff'), moduleKey: 'whatsapp_ai' }),
      ],
    },
    {
      label: 'Marketing',
      items: [
        ...moduleItem(context, { label: 'Landing Pages', href: href('/marketing/landing-pages'), moduleKey: 'landing_pages' }),
        ...moduleItem(context, { label: 'Formulários externos', href: href('/marketing/formularios'), moduleKey: 'landing_pages' }),
        ...moduleItem(context, { label: 'Campanhas', href: href('/marketing/campanhas'), moduleKey: 'campaigns' }),
        ...moduleItem(context, { label: 'Marketing Studio', href: href('/marketing/studio'), moduleKey: 'marketing_studio' }),
        ...moduleItem(context, { label: 'Central de Conteudo', href: href('/marketing/conteudo'), moduleKey: 'marketing_studio' }),
        ...moduleItem(context, { label: 'Calendario Editorial', href: href('/marketing/calendario'), moduleKey: 'marketing_studio' }),
        ...moduleItem(context, { label: 'Criativos e Inspiracoes', href: href('/marketing/criativos'), moduleKey: 'marketing_studio' }),
      ],
    },
    {
      label: 'Automacoes',
      items: [
        ...moduleItem(context, { label: 'Fluxos', href: href('/automacoes/fluxos'), moduleKey: 'automations' }),
        ...moduleItem(context, { label: 'Templates', href: href('/automacoes/templates'), moduleKey: 'automations' }),
        ...moduleItem(context, { label: 'Execucoes', href: href('/automacoes/execucoes'), moduleKey: 'automations' }),
        ...moduleItem(context, { label: 'Logs', href: href('/automacoes/logs'), moduleKey: 'automations' }),
      ],
    },
    {
      label: 'Projetos',
      items: [
        ...moduleItem(context, { label: 'Projetos', href: href('/projetos/projetos'), moduleKey: 'projects' }),
        ...moduleItem(context, { label: 'Aprovacoes', href: href('/projetos/aprovacoes'), moduleKey: 'projects' }),
        ...moduleItem(context, { label: 'Documentos', href: href('/projetos/documentos'), moduleKey: 'projects' }),
        ...moduleItem(context, { label: 'Propostas', href: href('/projetos/aprovacoes'), moduleKey: 'proposals' }),
      ],
    },
    {
      label: 'Relatorios',
      items: moduleItem(context, { label: 'Relatorios', href: href('/relatorios'), moduleKey: 'bi_reports' }),
    },
    {
      label: 'Suporte',
      items: moduleItem(context, { label: 'Suporte', href: href('/suporte'), moduleKey: 'support' }),
    },
    {
      label: 'Financeiro',
      items: moduleItem(context, { label: 'Financeiro', href: href('/financeiro'), moduleKey: 'finance' }),
    },
    {
      label: 'Configuracoes da Conta',
      items: [
        { label: 'Conta', href: href('/configuracoes/conta') },
        ...(context.mode === 'portal' ? [{ label: 'Modelos de Email', href: href('/configuracoes/emails') }] : []),
      ],
    },
  ]

  return groups.filter(group => group.items.length > 0)
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
            { label: 'Selecionar Cliente', href: '/client-workspaces' },
          ],
        },
      ]
    }

    const basePath = `/client-workspaces/${context.organization.id}`

    return [
      {
        label: 'Workspaces dos Clientes',
        items: [
          { label: 'Selecionar Cliente', href: '/client-workspaces' },
        ],
      },
      ...buildPortalNavigationGroups(context, basePath),
    ]
  }

  return internalModuleGroups.map(group => ({
    label: group.label,
    items: group.items.flatMap(item => {
      const filteredItem = filterNavigationItem(item, context)
      return filteredItem ? [filteredItem] : []
    }),
  }))
}

export function buildNavigation(context: PlatformContext): NavigationItem[] {
  return buildNavigationGroups(context).flatMap(group => group.items)
}

export function buildBreadcrumbs(context: PlatformContext, pathname: string): BreadcrumbItem[] {
  const home: BreadcrumbItem = context.mode === 'portal'
    ? { label: 'Portal do Cliente', href: '/portal' }
    : context.mode === 'client_workspace'
      ? { label: 'Workspaces dos Clientes', href: '/client-workspaces' }
      : { label: 'YUX Hub', href: '/dashboard' }
  const groups = buildNavigationGroups(context)
  const exactMatch = groups
    .flatMap(group => group.items.map(item => ({ group, item })))
    .find(({ item }) => item.href === pathname)

  if (exactMatch) {
    return [
      home,
      { label: exactMatch.group.label },
      { label: exactMatch.item.label },
    ]
  }

  const prefixMatch = groups
    .flatMap(group => group.items.map(item => ({ group, item })))
    .filter(({ item }) => item.href !== home.href && pathname.startsWith(`${item.href}/`))
    .sort((a, b) => b.item.href.length - a.item.href.length)[0]

  if (prefixMatch) {
    return [
      home,
      { label: prefixMatch.group.label },
      { label: prefixMatch.item.label, href: prefixMatch.item.href },
    ]
  }

  return [home]
}
