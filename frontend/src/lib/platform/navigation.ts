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

const internalModuleGroups: Array<{ label: string; items: NavigationItem[] }> = [
  {
    label: 'Visao Geral',
    items: [
      { label: 'Dashboard', href: '/dashboard' },
    ],
  },
  {
    label: 'Comercial YUX',
    items: [
      { label: 'Leads YUX', href: '/leads', moduleKey: 'crm' },
      { label: 'Diagnosticos', href: '/leads', moduleKey: 'crm' },
      { label: 'Propostas', href: '/proposals', moduleKey: 'proposals' },
      { label: 'Follow-ups', href: '/leads', moduleKey: 'crm' },
    ],
  },
  {
    label: 'Clientes & Contratos',
    items: [
      { label: 'Clientes', href: '/clients', moduleKey: 'clients' },
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
    label: 'Operacao dos Clientes',
    items: [
      { label: 'CRM & Funis', href: '/leads', moduleKey: 'crm' },
      { label: 'Conversas', href: '/omnichannel', moduleKey: 'whatsapp_ai' },
      { label: 'Agente IA', href: '/omnichannel', moduleKey: 'whatsapp_ai' },
      { label: 'Landing Pages', href: '/landing-pages', moduleKey: 'landing_pages' },
      { label: 'Campanhas', href: '/campaigns', moduleKey: 'campaigns' },
      { label: 'Marketing Studio', href: '/marketing-studio', moduleKey: 'marketing_studio' },
      { label: 'Automacoes', href: '/automations', moduleKey: 'automations' },
      { label: 'Relatorios', href: '/reports', moduleKey: 'bi_reports' },
    ],
  },
  {
    label: 'Administracao da Plataforma',
    items: [
      { label: 'Admin YUX Hub', href: '/admin' },
      { label: 'Blueprints', href: '/blueprints', moduleKey: 'blueprints' },
      { label: 'Catalogo de Modulos', href: '/admin/modules-governance' },
      { label: 'Integracoes Globais', href: '/admin/integrations' },
      { label: 'IA / Modelos / Custos', href: '/admin/ai' },
      { label: 'Canais', href: '/admin/channels' },
      { label: 'Email', href: '/admin/email' },
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

function buildPortalNavigationGroups(context: PlatformContext): NavigationGroup[] {
  const groups: NavigationGroup[] = [
    {
      label: 'Visao Geral',
      items: [{ label: 'Visao Geral', href: '/portal' }],
    },
    {
      label: 'Empresa',
      items: [
        { label: 'Perfil da Empresa', href: '/portal/empresa/perfil' },
        { label: 'Usuarios e Equipe', href: '/portal/empresa/usuarios' },
        { label: 'Base de Conhecimento', href: '/portal/empresa/conhecimento' },
        { label: 'Marca e Tom de Voz', href: '/portal/empresa/marca' },
        { label: 'Integracoes', href: '/portal/empresa/integracoes' },
      ],
    },
    {
      label: 'Comercial',
      items: [
        ...moduleItem(context, { label: 'Leads', href: '/portal/comercial/leads', moduleKey: 'crm' }),
        ...moduleItem(context, { label: 'Empresas / Contas', href: '/portal/comercial/contas', moduleKey: 'crm' }),
        ...moduleItem(context, { label: 'Funis', href: '/portal/comercial/funis', moduleKey: 'crm' }),
        ...moduleItem(context, { label: 'Tarefas e Follow-ups', href: '/portal/comercial/tarefas', moduleKey: 'crm' }),
      ],
    },
    {
      label: 'Atendimento & IA',
      items: [
        ...moduleItem(context, { label: 'Conversas', href: '/portal/atendimento/conversas', moduleKey: 'whatsapp_ai' }),
        ...moduleItem(context, { label: 'Agente IA', href: '/portal/atendimento/agente-ia', moduleKey: 'whatsapp_ai' }),
        ...moduleItem(context, { label: 'Canais', href: '/portal/atendimento/canais', moduleKey: 'whatsapp_ai' }),
        ...moduleItem(context, { label: 'Filas e Handoff', href: '/portal/atendimento/filas-handoff', moduleKey: 'whatsapp_ai' }),
      ],
    },
    {
      label: 'Marketing',
      items: [
        ...moduleItem(context, { label: 'Landing Pages', href: '/portal/marketing/landing-pages', moduleKey: 'landing_pages' }),
        ...moduleItem(context, { label: 'Campanhas', href: '/portal/marketing/campanhas', moduleKey: 'campaigns' }),
        ...moduleItem(context, { label: 'Marketing Studio', href: '/portal/marketing/studio', moduleKey: 'marketing_studio' }),
        ...moduleItem(context, { label: 'Conteudo Organico', href: '/portal/marketing/conteudo', moduleKey: 'marketing_studio' }),
        ...moduleItem(context, { label: 'Calendario Editorial', href: '/portal/marketing/calendario', moduleKey: 'marketing_studio' }),
        ...moduleItem(context, { label: 'Criativos e Assets', href: '/portal/marketing/criativos', moduleKey: 'marketing_studio' }),
      ],
    },
    {
      label: 'Automacoes',
      items: [
        ...moduleItem(context, { label: 'Fluxos', href: '/portal/automacoes/fluxos', moduleKey: 'automations' }),
        ...moduleItem(context, { label: 'Templates', href: '/portal/automacoes/templates', moduleKey: 'automations' }),
        ...moduleItem(context, { label: 'Execucoes', href: '/portal/automacoes/execucoes', moduleKey: 'automations' }),
        ...moduleItem(context, { label: 'Logs', href: '/portal/automacoes/logs', moduleKey: 'automations' }),
      ],
    },
    {
      label: 'Projetos',
      items: [
        ...moduleItem(context, { label: 'Projetos', href: '/portal/projetos/projetos', moduleKey: 'projects' }),
        ...moduleItem(context, { label: 'Aprovacoes', href: '/portal/projetos/aprovacoes', moduleKey: 'projects' }),
        ...moduleItem(context, { label: 'Documentos', href: '/portal/projetos/documentos', moduleKey: 'projects' }),
        ...moduleItem(context, { label: 'Propostas', href: '/portal/projetos/aprovacoes', moduleKey: 'proposals' }),
      ],
    },
    {
      label: 'Relatorios',
      items: moduleItem(context, { label: 'Relatorios', href: '/portal/relatorios', moduleKey: 'bi_reports' }),
    },
    {
      label: 'Suporte',
      items: moduleItem(context, { label: 'Suporte', href: '/portal/suporte', moduleKey: 'support' }),
    },
    {
      label: 'Financeiro',
      items: moduleItem(context, { label: 'Financeiro', href: '/portal/financeiro', moduleKey: 'finance' }),
    },
    {
      label: 'Configuracoes da Conta',
      items: [{ label: 'Conta', href: '/portal/configuracoes/conta' }],
    },
  ]

  return groups.filter(group => group.items.length > 0)
}

export function buildNavigationGroups(context: PlatformContext): NavigationGroup[] {
  if (context.mode === 'portal') {
    return buildPortalNavigationGroups(context)
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
