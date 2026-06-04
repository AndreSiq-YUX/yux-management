import { canAccessModule } from '@/lib/platform/accessControl'
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

const portalLabelByModule: Record<string, string> = {
  crm: 'Leads & Funil',
  bi_reports: 'Relatorios',
}

const internalModuleGroups: Array<{ label: string; items: NavigationItem[] }> = [
  {
    label: 'Operacao',
    items: [
      { label: 'Dashboard', href: '/dashboard' },
      { label: 'Clientes', href: '/clients', moduleKey: 'clients' },
      { label: 'Projetos e Entregas', href: '/projects', moduleKey: 'projects' },
      { label: 'Suporte', href: '/support', moduleKey: 'support' },
    ],
  },
  {
    label: 'Comercial',
    items: [
      { label: 'CRM & Funis', href: '/leads', moduleKey: 'crm' },
      { label: 'Automacoes', href: '/automations', moduleKey: 'automations' },
      { label: 'Propostas', href: '/proposals', moduleKey: 'proposals' },
      { label: 'Campanhas', href: '/campaigns', moduleKey: 'campaigns' },
      { label: 'Landing Pages', href: '/landing-pages', moduleKey: 'landing_pages' },
      { label: 'Relatorios & ROI', href: '/reports', moduleKey: 'bi_reports' },
      { label: 'Conversas IA', href: '/omnichannel', moduleKey: 'whatsapp_ai' },
    ],
  },
  {
    label: 'Gestao YUX Hub',
    items: [
      { label: 'Admin YUX Hub', href: '/admin' },
      { label: 'Contratos', href: '/contracts' },
      { label: 'Pacotes', href: '/packages' },
      { label: 'Modulos', href: '/modules' },
      { label: 'Governanca por Modulo', href: '/admin/modules-governance' },
      { label: 'Blueprints', href: '/blueprints', moduleKey: 'blueprints' },
      { label: 'Governanca CRM', href: '/crm-governance' },
    ],
  },
  {
    label: 'Infraestrutura',
    items: [
      { label: 'Integracoes', href: '/admin/integrations' },
      { label: 'IA', href: '/admin/ai' },
      { label: 'Email', href: '/admin/email' },
      { label: 'Saude', href: '/admin/health' },
    ],
  },
  {
    label: 'Financeiro',
    items: [
      { label: 'Financeiro', href: '/finance', moduleKey: 'finance' },
    ],
  },
]

function filterNavigationItem(item: NavigationItem, context: PlatformContext) {
  if (!item.moduleKey) return item

  const module = PLATFORM_MODULES.find(platformModule => platformModule.key === item.moduleKey)
  if (!module || !canAccessModule(module, context.role, context.enabledModuleKeys)) {
    return null
  }

  return item
}

function buildPortalNavigationGroup(context: PlatformContext): NavigationGroup {
  const moduleItems = PLATFORM_MODULES.flatMap(module => {
    const href = module.portalRoute

    if (!href || !canAccessModule(module, context.role, context.enabledModuleKeys)) {
      return []
    }

    return [
      {
        label: context.mode === 'portal' ? portalLabelByModule[module.key] || module.name : module.name,
        href,
        moduleKey: module.key,
      },
    ]
  })

  return {
    label: 'Portal',
    items: [{ label: 'Portal', href: '/portal' }, ...moduleItems],
  }
}

export function buildNavigationGroups(context: PlatformContext): NavigationGroup[] {
  if (context.mode === 'portal') {
    return [buildPortalNavigationGroup(context)]
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
