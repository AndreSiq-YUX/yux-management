import type { CapabilityRegistry } from './capability-registry.js'

const tools: Record<string, { title: string; description: string }> = {
  radar: { title: 'Radar Comercial', description: 'Prospecção de empresas: definir ou selecionar campanha, verificar prontidão, pesquisar com aprovação e avaliar resultados.' },
  crm: { title: 'CRM e relacionamento', description: 'Consultar funis e histórico, organizar responsáveis e tarefas, preparar funis e sequências de relacionamento.' },
  growth: { title: 'Segmentação comercial', description: 'Avaliar segmentos e oportunidades para a estratégia comercial.' },
  campaign: { title: 'Campanhas de marketing', description: 'Preparar campanhas e aquisição, acompanhar métricas e propor otimizações com controle de aprovação.' },
  marketing: { title: 'Criativos de marketing', description: 'Preparar e revisar criativos para campanhas.' },
  automation: { title: 'Automações', description: 'Preparar, simular e publicar fluxos; executar somente após as verificações aplicáveis.' },
  email: { title: 'E-mail', description: 'Preparar modelos e mensagens de e-mail, com configuração, consentimento e aprovação necessários.' },
  whatsapp: { title: 'WhatsApp', description: 'Preparar envios por modelos aprovados, respeitando canal, consentimento e permissões.' },
  omnichannel: { title: 'Atendimento e mensagens', description: 'Preparar mensagens para atendimento e acompanhamento comercial.' },
  landing_page: { title: 'Landing pages', description: 'Preparar páginas de aquisição como rascunho.' },
  lead_form: { title: 'Formulários de captação', description: 'Configurar rascunhos de formulários para aquisição.' },
  reports: { title: 'Relatórios', description: 'Consultar resultados e indicadores comerciais disponíveis na conta.' },
  human: { title: 'Tarefas e revisão humana', description: 'Organizar tarefas que dependem de participação humana.' },
  system: { title: 'Aprovações e acompanhamento', description: 'Verificar prontidão, aguardar aprovação e acompanhar marcos da missão.' },
}

export type PlatformToolCatalog = {
  knowledgeScope: 'shared_platform'
  executionPolicy: 'requires_account_readiness_and_approval'
  tools: Array<{ key: string; title: string; description: string; planningAvailable: boolean }>
}

// Knowledge of a tool is platform-wide. This catalog never grants capabilities.
export function buildPlatformToolCatalog(registry: CapabilityRegistry, allowedCapabilityKeys: string[]): PlatformToolCatalog {
  const registered = new Set(registry.listMetadata().map(item => item.key.split('.')[0]))
  const allowed = new Set(allowedCapabilityKeys.map(key => key.split('.')[0]))
  return {
    knowledgeScope: 'shared_platform',
    executionPolicy: 'requires_account_readiness_and_approval',
    tools: Object.entries(tools).filter(([key]) => registered.has(key)).map(([key, tool]) => ({
      key, ...tool, planningAvailable: allowed.has(key),
    })),
  }
}
