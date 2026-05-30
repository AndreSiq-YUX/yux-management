import type { PlatformModule } from '@/types/platform'

export const PLATFORM_MODULES: PlatformModule[] = [
  {
    key: 'clients',
    name: 'Clientes',
    base: true,
    internalRoute: '/clients',
    portalRoute: null,
    requiredPermissions: ['clients.read'],
  },
  {
    key: 'crm',
    name: 'CRM',
    base: false,
    internalRoute: '/leads',
    portalRoute: '/portal/crm',
    requiredPermissions: ['crm.read', 'leads.read'],
  },
  {
    key: 'projects',
    name: 'Projetos e Entregas',
    base: true,
    internalRoute: '/projects',
    portalRoute: '/portal/projects',
    requiredPermissions: ['projects.read'],
  },
  {
    key: 'proposals',
    name: 'Propostas',
    base: false,
    internalRoute: '/proposals',
    portalRoute: null,
    requiredPermissions: ['proposals.read'],
  },
  {
    key: 'whatsapp_ai',
    name: 'WhatsApp IA',
    base: false,
    internalRoute: '/whatsapp-ai',
    portalRoute: '/portal/whatsapp-ai',
    requiredPermissions: ['support.read'],
  },
  {
    key: 'campaigns',
    name: 'Campanhas e Ads',
    base: false,
    internalRoute: '/campaigns',
    portalRoute: '/portal/campaigns',
    requiredPermissions: ['campaigns.read'],
  },
  {
    key: 'bi_reports',
    name: 'BI e Relatorios',
    base: false,
    internalRoute: '/reports',
    portalRoute: '/portal/reports',
    requiredPermissions: ['reports.read'],
  },
  {
    key: 'automations',
    name: 'Automacoes',
    base: false,
    internalRoute: '/automations',
    portalRoute: null,
    requiredPermissions: ['automations.read'],
  },
  {
    key: 'support',
    name: 'Suporte',
    base: true,
    internalRoute: '/support',
    portalRoute: '/portal/support',
    requiredPermissions: ['support.read'],
  },
  {
    key: 'finance',
    name: 'Financeiro',
    base: false,
    internalRoute: '/finance',
    portalRoute: '/portal/finance',
    requiredPermissions: ['finance.read'],
  },
  {
    key: 'blueprints',
    name: 'Blueprints',
    base: false,
    internalRoute: '/blueprints',
    portalRoute: null,
    requiredPermissions: ['blueprints.read'],
  },
]

export function getPlatformModule(key: string) {
  return PLATFORM_MODULES.find(module => module.key === key)
}
