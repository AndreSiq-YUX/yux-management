import type pg from 'pg'

export const LLM_PROVIDERS = ['openrouter', 'openai_direct'] as const
export type LlmRouteKind='chat'|'embedding'|'decision'|'research'
export type LlmUseCaseDefinition = { key: string; title: string; description: string; kind:LlmRouteKind|null; group: string;classificationStatus?:'registered'|'pending' }
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
  { key: 'radar_business_qualification', title: 'Radar — qualificação de empresas pela oferta', description: 'Interpreta evidências públicas coletadas e os critérios da campanha. Exige rota própria ativa; a coleta de contatos funciona sem LLM.', kind: 'chat', group: 'Radar Comercial' },
  {key:'radar_presence_resolution',title:'Radar — identificação de site e canais oficiais',description:'Resolve identidade de site, marca e grupo usando somente evidências coletadas. Exige rota própria; não pesquisa nem inventa contatos.',kind:'chat',group:'Radar Comercial'},
  {key:'radar_discovery_extraction',title:'Radar — extração de empresas em páginas e listas',description:'Extrai menções provisórias com trechos literais, sem admitir empresas nem herdar contatos do publicador. Exige rota própria ativa.',kind:'chat',group:'Radar Comercial'},
  ...(['radar_decision_default','radar_initial_triage','radar_next_action','radar_quality_gate'] as const).map((key,index)=>({key,title:['Radar — decisão geral e reserva','Radar — triagem inicial','Radar — decisão do próximo passo','Radar — decisão de qualidade'][index],description:'Decisão estruturada via OpenRouter. Herda somente a decisão geral compatível; nunca chat. Sem calibração correspondente, opera em observação.',kind:'decision' as const,group:'Radar Comercial'})),
  {key:'radar_deep_research',title:'Radar — investigação aprofundada (integração futura)',description:'Capacidade reservada para investigação com fontes. Requer adaptador próprio, não herda chat ou decisão.',kind:'research',group:'Radar Comercial'},
]

const profileTitles: Record<string, string> = {
  growth_strategist: 'Estratégia de crescimento', crm_controller: 'Controle de CRM',
  ai_sdr_comercial_1: 'Atendimento — SDR / WhatsApp', ai_closer: 'Atendimento — Closer',
  support_assistant: 'Atendimento — Suporte', customer_growth_comercial_2: 'Retenção e crescimento do cliente',
  revenue_recovery: 'Recuperação de receita', offer_conversion: 'Ofertas e conversão',
  marketing_strategist: 'Estratégia de marketing', referral_growth: 'Indicações',
  metrics_cash_mroi: 'Métricas, caixa e MROI', proposal_delivery: 'Propostas comerciais',
}

export function isEmbeddingUseCase(key:string|null,definitions:LlmUseCaseDefinition[]=TECHNICAL_LLM_USE_CASES) {
  return definitions.some(item=>item.key===key&&item.kind==='embedding')
}
export function resolveUseCaseDefinition(key:string,definitions:LlmUseCaseDefinition[]):LlmUseCaseDefinition{
 const definition=definitions.find(item=>item.key===key)
 if(!definition)throw Object.assign(Error('llm_use_case_unknown'),{statusCode:400})
 if(!definition.kind)throw Object.assign(Error('llm_route_classification_required'),{statusCode:409})
 return definition
}
export function validateLlmRouteCapability(input:{agentType:string|null;agentId?:string|null;kind?:LlmRouteKind;protocol?:string;provider:string;modelName:string;fallbackModelName?:string|null;fallbackRoutes?:Array<{provider:string;modelName:string}>},definitions:LlmUseCaseDefinition[]){
 const kind=input.agentType?resolveUseCaseDefinition(input.agentType,definitions).kind:input.agentId?'chat':null
 if(!kind||input.kind&&input.kind!==kind)throw Object.assign(Error('llm_route_capability_incompatible'),{statusCode:400})
 const protocol=kind==='decision'?'openrouter-decisions-alpha-v1':kind==='research'?'perplexity-agent-v1':'openai-compatible-v1'
 if(input.protocol&&input.protocol!==protocol||kind==='decision'&&(input.provider!=='openrouter'||input.fallbackRoutes?.some(item=>item.provider!=='openrouter'))||kind==='research')throw Object.assign(Error('llm_route_capability_incompatible'),{statusCode:400})
 const fallbacks=[...(input.fallbackRoutes??[]),...(input.fallbackModelName?[{provider:input.provider,modelName:input.fallbackModelName}]:[])]
 if(kind==='decision'&&[input.modelName,...fallbacks.map(item=>item.modelName)].some(model=>model.trim().length>200||model.trim().startsWith('~')))throw Object.assign(Error('llm_route_capability_incompatible'),{statusCode:400})
 const seen=new Set([`${input.provider}:${input.modelName.trim()}`])
 for(const fallback of fallbacks){const key=`${fallback.provider}:${fallback.modelName.trim()}`;if(seen.has(key))throw Object.assign(Error('llm_route_fallback_cycle'),{statusCode:400});seen.add(key)}
 return{kind,protocol,adapterVersion:kind==='decision'?'openrouter-decisions-alpha-v1':'v1'}
}

export async function getAdminLlmUseCases(pool: Pick<pg.Pool,'query'>, options:{sequential?:boolean}={}): Promise<LlmUseCaseDefinition[]> {
  const queries=[
    'SELECT profile_key, name, description FROM public.yux_strategy_agent_profiles ORDER BY profile_key',
    'SELECT id, agent_type, name FROM public.marketing_agents ORDER BY name',
    'SELECT DISTINCT agent_type FROM public.model_routing_rules WHERE agent_type IS NOT NULL ORDER BY agent_type',
    'SELECT key,title,description,kind,group_name FROM public.llm_use_case_definitions ORDER BY key',
  ]
  const results:pg.QueryResult[]=[]
  if(options.sequential)for(const sql of queries)results.push(await pool.query(sql))
  else results.push(...await Promise.all(queries.map(sql=>pool.query(sql))))
  const [profiles,agents,saved,registered]=results
  const cases = new Map(TECHNICAL_LLM_USE_CASES.map(item => [item.key, item]))
  for(const row of registered.rows)if(typeof row.key==='string'&&['chat','embedding','decision','research'].includes(row.kind)&&!cases.has(row.key))cases.set(row.key,{key:row.key,title:row.title||row.key,description:row.description||'',kind:row.kind,group:row.group_name||'Funções registradas',classificationStatus:'registered'})
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
    if (key && !cases.has(key)) cases.set(key, { key, title: key, description: 'Rota legada sem capacidade classificada. Revise antes de editar ou executar.', kind:null,classificationStatus:'pending', group: 'Rotas pendentes de classificação' })
  }
  return [...cases.values()]
}
