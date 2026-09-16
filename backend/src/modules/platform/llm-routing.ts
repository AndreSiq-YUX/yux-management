import type pg from 'pg'

export const LLM_PROVIDERS = ['openrouter', 'openai_direct'] as const
export type LlmUseCaseDefinition = { key: string; title: string; description: string; kind: 'chat' | 'embedding'; group: string }
export const TECHNICAL_LLM_USE_CASES: LlmUseCaseDefinition[] = [
  { key: 'global_llm', title: 'Modelo global de texto', description: 'Usado sem rota específica e como último fallback das funções de texto.', kind: 'chat', group: 'Globais' },
  { key: 'global_embeddings', title: 'Fallback global de embeddings', description: 'Reserva exclusiva para embeddings; não utiliza o modelo global de texto.', kind: 'embedding', group: 'Globais' },
  { key: 'action_engine_strategist', title: 'Action Engine — conversa estratégica', description: 'Interpreta pedidos com conhecimento e contexto do cliente.', kind: 'chat', group: 'Action Engine' },
  { key: 'mission_supervisor', title: 'Action Engine — planejamento da missão', description: 'Converte o brief confirmado em plano operacional governado.', kind: 'chat', group: 'Action Engine' },
  { key: 'campaign_launch_specialist', title: 'Especialistas — criação de campanhas', description: 'Cria os artefatos de campanhas nas missões; sem rota própria, herda o supervisor.', kind: 'chat', group: 'Action Engine' },
  { key: 'funnel_nurture_specialist', title: 'Especialistas — funis e nutrição', description: 'Cria sequências e artefatos de nutrição nas missões; sem rota própria, herda o supervisor.', kind: 'chat', group: 'Action Engine' },
  { key: 'automation_lead_classification', title: 'Automação — classificação de leads', description: 'Classifica leads; sem rota própria, mantém o modelo do perfil vinculado à automação.', kind: 'chat', group: 'Automações' },
  { key: 'automation_message_generation', title: 'Automação — geração de mensagens', description: 'Gera mensagens; sem rota própria, mantém o modelo do perfil vinculado à automação.', kind: 'chat', group: 'Automações' },
  { key: 'automation_proposal_generation', title: 'Automação — geração de propostas', description: 'Gera propostas; sem rota própria, mantém o modelo do perfil vinculado à automação.', kind: 'chat', group: 'Automações' },
  { key: 'strategy_curator', title: 'Curadoria — Strategy Packs', description: 'Extrai conhecimento reutilizável, exemplos e estratégias dos materiais importados.', kind: 'chat', group: 'Conhecimento' },
  { key: 'knowledge_curator', title: 'Curadoria — inteligência empresarial', description: 'Analisa documentos e sites e extrai o perfil e conhecimento da empresa.', kind: 'chat', group: 'Conhecimento' },
  { key: 'knowledge_embeddings', title: 'Embeddings — ingestão e busca', description: 'Modelo compartilhado para indexar e consultar conhecimento estratégico e empresarial.', kind: 'embedding', group: 'Conhecimento' },
]

const profileTitles: Record<string, string> = {
  growth_strategist: 'Estratégia de crescimento', crm_controller: 'Controle de CRM',
  ai_sdr_comercial_1: 'Atendimento — SDR / WhatsApp', ai_closer: 'Atendimento — Closer',
  support_assistant: 'Atendimento — Suporte', customer_growth_comercial_2: 'Retenção e crescimento do cliente',
  revenue_recovery: 'Recuperação de receita', offer_conversion: 'Ofertas e conversão',
  marketing_strategist: 'Estratégia de marketing', referral_growth: 'Indicações',
  metrics_cash_mroi: 'Métricas, caixa e MROI', proposal_delivery: 'Propostas comerciais',
}

export function isEmbeddingUseCase(key: string | null) {
  return key === 'knowledge_embeddings' || key === 'global_embeddings'
}

export async function getAdminLlmUseCases(pool: pg.Pool): Promise<LlmUseCaseDefinition[]> {
  const [profiles, agents, saved] = await Promise.all([
    pool.query('SELECT profile_key, name, description FROM public.yux_strategy_agent_profiles ORDER BY profile_key'),
    pool.query('SELECT id, agent_type, name FROM public.marketing_agents ORDER BY name'),
    pool.query('SELECT DISTINCT agent_type FROM public.model_routing_rules WHERE agent_type IS NOT NULL ORDER BY agent_type'),
  ])
  const cases = new Map(TECHNICAL_LLM_USE_CASES.map(item => [item.key, item]))
  for (const [key, title] of Object.entries(profileTitles)) {
    cases.set(key, { key, title, description: 'Rota do perfil, utilizada pelos assistentes e automações vinculados a ele.', kind: 'chat', group: 'Perfis e atendimento' })
  }
  for (const profile of profiles.rows) {
    const key = profile.profile_key as string
    if (key && !cases.has(key)) cases.set(key, { key, title: profile.name || key, description: profile.description || 'Perfil estratégico.', kind: 'chat', group: 'Perfis e atendimento' })
  }
  for (const agent of agents.rows) {
    const key = agent.agent_type as string
    if (key && !cases.has(key)) cases.set(key, { key, title: agent.name || key, description: 'Agente do Marketing Studio; overrides por agente ficam nas rotas salvas.', kind: 'chat', group: 'Marketing Studio' })
  }
  for (const route of saved.rows) {
    const key = route.agent_type as string
    if (key && !cases.has(key)) cases.set(key, { key, title: key, description: 'Caso de uso já registrado no sistema.', kind: 'chat', group: 'Outras rotas existentes' })
  }
  return [...cases.values()]
}
