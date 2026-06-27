import { corsHeaders, formatProtectedError, getAdminClient, json, requireAuthenticatedUser } from '../_shared/edge.ts'

type AdminClient = ReturnType<typeof getAdminClient>

type ChatRequest = {
  sessionId?: string
  message?: string
  mode?: string
  organizationId?: string
  clientId?: string
  contractId?: string
}

type ModelRoute = {
  id: string
  provider: string
  model_name: string
  fallback_model_name?: string | null
  max_input_tokens?: number
  max_output_tokens?: number
  temperature?: number
}

type ProviderConnection = {
  provider_key: string
  public_config?: Record<string, unknown>
  secret_reference?: string | null
}

type ChatCompletionBody = {
  choices?: Array<{ message?: { content?: string } }>
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
  }
  model?: string
}

const modeLabels: Record<string, string> = {
  general: 'Conversa estrategica geral',
  initial_analysis: 'Analise inicial',
  diagnostic_48h: 'Diagnostico 48h',
  service_plan: 'Plano de servicos ideal',
  proposal: 'Proposta comercial',
  roadmap_30_60_90: 'Roadmap 30/60/90',
  do_not_do: 'O que nao fazer agora',
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const authorization = req.headers.get('Authorization')
    const { user } = await requireAuthenticatedUser(authorization)
    const admin = getAdminClient()
    await assertInternalUser(admin, user.id)

    const body = await req.json() as ChatRequest
    const message = (body.message || '').trim()
    if (!message) return json({ error: 'message is required' }, 400)

    const mode = normalizeMode(body.mode)
    const profile = await loadGrowthProfile(admin)
    const session = await resolveSession(admin, {
      ...body,
      mode,
      actorUserId: user.id,
      profileId: profile.id,
    })

    const userMessage = await insertMessage(admin, {
      sessionId: session.id,
      actorUserId: user.id,
      role: 'user',
      content: message,
      status: 'completed',
    })

    const [history, context, route] = await Promise.all([
      loadSessionHistory(admin, session.id),
      buildStrategicContext(admin, {
        organizationId: session.organization_id,
        clientId: session.client_id,
        contractId: session.contract_id,
        profile,
      }),
      loadModelRoute(admin, 'growth_strategist'),
    ])
    const runtimeResult = await callAgentHarnessRuntime(Deno.env.get('YUX_AGENT_RUNTIME_URL'), Deno.env.get('YUX_AGENT_RUNTIME_TOKEN'), {
      message,
      mode,
      session,
      context,
    })
    const provider = runtimeResult.configured && runtimeResult.ok ? null : await loadProvider(admin, route.provider)
    const response = runtimeResult.configured && runtimeResult.ok
      ? runtimeResult.response
      : await callChatModel({
        route,
        provider: provider!,
        messages: buildModelMessages({ mode, message, history, context }),
      })

    const assistantMessage = await insertMessage(admin, {
      sessionId: session.id,
      actorUserId: user.id,
      role: 'assistant',
      content: response.content,
      status: 'completed',
      modelProvider: route.provider,
      modelName: response.model || route.model_name,
      routingRuleId: route.id,
      inputTokens: response.inputTokens,
      outputTokens: response.outputTokens,
      safeContext: context.safeContext,
      toolResults: context.toolResults,
    })

    await admin
      .from('yux_strategy_chat_sessions')
      .update({
        title: session.title === 'Nova conversa estrategica' ? buildTitle(message) : session.title,
        context_snapshot: context.safeContext,
        last_message_at: new Date().toISOString(),
      })
      .eq('id', session.id)

    return json({
      session: { ...session, title: session.title === 'Nova conversa estrategica' ? buildTitle(message) : session.title },
      userMessage,
      assistantMessage,
      route: {
        provider: route.provider,
        modelName: response.model || route.model_name,
        routingRuleId: route.id,
      },
    })
  } catch (error) {
    return json({ error: formatProtectedError(error) }, 500)
  }
})

async function assertInternalUser(admin: AdminClient, userId: string) {
  const [{ data: user }, { data: memberships }] = await Promise.all([
    admin.from('users').select('id, role').eq('id', userId).maybeSingle(),
    admin.from('memberships').select('role_key, roles(scope)').eq('user_id', userId),
  ])
  const hasInternalRole = (memberships || []).some((membership: Record<string, unknown>) => {
    const role = Array.isArray(membership.roles) ? membership.roles[0] : membership.roles
    return typeof role === 'object' && role !== null && (role as Record<string, unknown>).scope === 'internal'
  })
  if (!user || (!['ADMIN', 'MANAGER'].includes(String(user.role)) && !hasInternalRole)) {
    throw new Error('Only internal YUX users can use the strategic admin chat')
  }
}

async function loadGrowthProfile(admin: AdminClient) {
  const { data, error } = await admin
    .from('yux_strategy_agent_profiles')
    .select('*')
    .eq('profile_key', 'growth_strategist')
    .eq('status', 'active')
    .maybeSingle()
  if (error) throw error
  if (!data) throw new Error('growth_strategist profile is not active')
  return data
}

async function resolveSession(admin: AdminClient, input: ChatRequest & { actorUserId: string; mode: string; profileId: string }) {
  if (input.sessionId) {
    const { data, error } = await admin
      .from('yux_strategy_chat_sessions')
      .select('*')
      .eq('id', input.sessionId)
      .maybeSingle()
    if (error) throw error
    if (!data) throw new Error('Strategy chat session not found')
    return data
  }

  const { data, error } = await admin
    .from('yux_strategy_chat_sessions')
    .insert({
      actor_user_id: input.actorUserId,
      organization_id: input.organizationId || null,
      client_id: input.clientId || null,
      contract_id: input.contractId || null,
      profile_id: input.profileId,
      profile_key: 'growth_strategist',
      mode: input.mode,
      title: modeLabels[input.mode] || 'Nova conversa estrategica',
    })
    .select()
    .single()
  if (error) throw error
  return data
}

async function insertMessage(admin: AdminClient, input: {
  sessionId: string
  actorUserId: string
  role: 'user' | 'assistant' | 'system'
  content: string
  status: string
  modelProvider?: string
  modelName?: string
  routingRuleId?: string
  inputTokens?: number
  outputTokens?: number
  safeContext?: Record<string, unknown>
  toolResults?: unknown[]
}) {
  const { data, error } = await admin
    .from('yux_strategy_chat_messages')
    .insert({
      session_id: input.sessionId,
      actor_user_id: input.actorUserId,
      role: input.role,
      content: input.content,
      status: input.status,
      model_provider: input.modelProvider || null,
      model_name: input.modelName || null,
      routing_rule_id: input.routingRuleId || null,
      input_tokens: input.inputTokens || 0,
      output_tokens: input.outputTokens || 0,
      safe_context: input.safeContext || {},
      tool_results: input.toolResults || [],
    })
    .select()
    .single()
  if (error) throw error
  return data
}

async function loadSessionHistory(admin: AdminClient, sessionId: string) {
  const { data, error } = await admin
    .from('yux_strategy_chat_messages')
    .select('role, content, created_at')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: false })
    .limit(10)
  if (error) throw error
  return [...(data || [])].reverse()
}

async function loadModelRoute(admin: AdminClient, profileKey: string): Promise<ModelRoute> {
  const { data, error } = await admin
    .from('model_routing_rules')
    .select('*')
    .eq('agent_type', profileKey)
    .eq('routing_tier', 'default')
    .eq('status', 'active')
    .maybeSingle()
  if (error) throw error
  if (!data) throw new Error(`No active model route for ${profileKey}`)
  return data
}

async function loadProvider(admin: AdminClient, providerKey: string): Promise<ProviderConnection> {
  const { data, error } = await admin
    .from('platform_provider_connections')
    .select('provider_key, public_config, secret_reference, status')
    .eq('provider_type', 'llm')
    .eq('provider_key', providerKey)
    .eq('status', 'active')
    .maybeSingle()
  if (error) throw error
  if (!data) throw new Error(`LLM provider ${providerKey} is not active`)
  return data
}

async function buildStrategicContext(admin: AdminClient, input: {
  organizationId?: string | null
  clientId?: string | null
  contractId?: string | null
  profile: Record<string, unknown>
}) {
  const [skills, cards, organization, client, contract, leads, proposals, metrics, objections] = await Promise.all([
    loadProfileSkills(admin, String(input.profile.id)),
    loadConceptCards(admin),
    loadMaybe(admin, 'organizations', input.organizationId, 'id, name, slug, kind'),
    loadMaybe(admin, 'clients', input.clientId, 'id, company_name, contact_name, sector, status, lifetime_value, total_revenue, notes'),
    loadMaybe(admin, 'contracts', input.contractId, 'id, name, status, monthly_value, start_date, end_date'),
    loadScopedRows(admin, 'leads', input.organizationId, 'id, name, company, stage, status, score, value, commercial_stage, lead_temperature, main_objection, next_best_action, last_activity_at, updated_at', 'updated_at'),
    loadScopedRows(admin, 'proposals', input.organizationId, 'id, title, status, final_value, billing_cycle, selected_module_keys, updated_at', 'updated_at'),
    loadScopedRows(admin, 'yux_metrics_cash_snapshots', input.organizationId, 'id, snapshot_date, cac, average_ticket, ltv, mroi, gross_revenue, net_revenue, cash_gap, updated_at', 'snapshot_date'),
    loadScopedRows(admin, 'yux_objection_events', input.organizationId, 'id, category_key, normalized_text, source_channel, requires_follow_up, created_at', 'created_at'),
  ])

  const safeContext = {
    profile: pick(input.profile, ['profile_key', 'name', 'description', 'purpose', 'allowed_modules', 'allowed_tools', 'forbidden_actions', 'requires_human_approval_for', 'max_cards', 'max_chunks']),
    skills,
    cards,
    scope: { organization, client, contract },
    crm: { leads },
    commercial: { proposals, objections },
    metrics,
  }

  return {
    safeContext,
    toolResults: [
      { tool: 'strategy_profile', count: 1 },
      { tool: 'strategy_skills', count: skills.length },
      { tool: 'concept_cards', count: cards.length },
      { tool: 'crm_leads', count: leads.length },
      { tool: 'proposals', count: proposals.length },
      { tool: 'cash_metrics', count: metrics.length },
      { tool: 'objections', count: objections.length },
    ],
  }
}

async function loadProfileSkills(admin: AdminClient, profileId: string) {
  const { data, error } = await admin
    .from('yux_strategy_agent_profile_skills')
    .select('priority, required, yux_strategy_skills(skill_key, name, description, global_rules, decision_rules)')
    .eq('profile_id', profileId)
    .order('priority')
  if (error) throw error
  return (data || []).map((row: Record<string, unknown>) => {
    const skill = Array.isArray(row.yux_strategy_skills) ? row.yux_strategy_skills[0] : row.yux_strategy_skills
    return skill
  }).filter(Boolean)
}

async function loadConceptCards(admin: AdminClient) {
  const { data, error } = await admin
    .from('yux_strategy_concept_cards')
    .select('concept, category, problem_solved, trigger_signals, decision_rules, recommended_actions, stage_tags, retrieval_tags')
    .contains('allowed_agent_profile_keys', ['growth_strategist'])
    .eq('human_review_status', 'approved')
    .limit(8)
  if (error) throw error
  return data || []
}

async function loadMaybe(admin: AdminClient, table: string, id: string | null | undefined, select: string) {
  if (!id) return null
  const { data, error } = await admin.from(table).select(select).eq('id', id).maybeSingle()
  if (error) return { error: error.message }
  return data || null
}

async function loadScopedRows(admin: AdminClient, table: string, organizationId: string | null | undefined, select: string, orderColumn: string) {
  if (!organizationId) return []
  const { data, error } = await admin
    .from(table)
    .select(select)
    .eq('organization_id', organizationId)
    .order(orderColumn, { ascending: false })
    .limit(8)
  if (error) return [{ error: error.message }]
  return data || []
}

function buildModelMessages(input: {
  mode: string
  message: string
  history: Array<{ role: string; content: string }>
  context: { safeContext: Record<string, unknown> }
}) {
  const system = [
    'Voce e o Growth Strategist interno da YUX.',
    'Seu papel e fazer analise inicial, diagnostico 48h, priorizacao comercial, plano ideal de servicos, proposta e roadmap para clientes/prospects.',
    'Siga a doutrina YUX: antes de recomendar aquisicao, avalie base atual, recorrencia, ticket, CAC, follow-up, CRM, objeções e oportunidades perdidas.',
    'Nao envie mensagem externa, nao prometa desconto, nao altere proposta e nao afirme dados que nao estao no contexto.',
    'Responda em portugues do Brasil, direto, consultivo e orientado a caixa.',
    'Quando recomendar acao, inclua objetivo, publico, acao, canal, responsavel, metrica e proximo passo.',
    `Modo solicitado: ${modeLabels[input.mode] || modeLabels.general}.`,
    `Contexto disponivel:\n${JSON.stringify(input.context.safeContext).slice(0, 24000)}`,
  ].join('\n\n')

  const historicalMessages = input.history
    .filter(item => item.role === 'user' || item.role === 'assistant')
    .slice(-8)
    .map(item => ({ role: item.role as 'user' | 'assistant', content: item.content }))

  return [
    { role: 'system' as const, content: system },
    ...historicalMessages,
    { role: 'user' as const, content: input.message },
  ]
}

async function callChatModel(input: {
  route: ModelRoute
  provider: ProviderConnection
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
}) {
  const config = input.provider.public_config || {}
  const baseUrl = String(config.baseUrl || (input.provider.provider_key === 'openai_direct' ? 'https://api.openai.com/v1' : 'https://openrouter.ai/api/v1'))
  const secretName = input.provider.secret_reference || String(config.requiredSecret || '')
  const apiKey = secretName ? Deno.env.get(secretName) : ''
  if (!apiKey) throw new Error(`Missing LLM secret ${secretName || 'for provider ' + input.provider.provider_key}`)

  const payload = {
    model: input.route.model_name,
    messages: input.messages,
    temperature: Number(input.route.temperature ?? 0.4),
    max_tokens: Number(input.route.max_output_tokens || 1600),
  }
  const first = await postChatCompletion(baseUrl, apiKey, payload)
  if (first.ok) return first
  if (input.route.fallback_model_name) {
    const fallback = await postChatCompletion(baseUrl, apiKey, { ...payload, model: input.route.fallback_model_name })
    if (fallback.ok) return fallback
  }
  throw new Error(first.error || 'LLM provider failed')
}

async function callAgentHarnessRuntime(runtimeUrl: string | undefined, runtimeToken: string | undefined, input: {
  message: string
  mode: string
  session: Record<string, unknown>
  context: { safeContext: Record<string, unknown> }
}) {
  if (!runtimeUrl) return { configured: false, ok: false as const }
  const response = await fetch(`${runtimeUrl.replace(/\/$/, '')}/workflows/execute`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(runtimeToken ? { Authorization: `Bearer ${runtimeToken}` } : {}),
    },
    body: JSON.stringify({
      message: input.message,
      profile_key: 'growth_strategist',
      source: 'strategy_admin',
      organization_id: input.session.organization_id || null,
      client_id: input.session.client_id || null,
      mode: input.mode,
      retrieval_context: {
        cards: input.context.safeContext.cards || [],
        chunks: [],
        retrieval_log: { source: 'run-strategy-admin-chat' },
      },
      autonomy_policies: [],
    }),
  }).catch(error => ({ ok: false, status: 0, text: () => Promise.resolve(String(error)) } as Response))
  const text = await response.text()
  const body = safeJson(text) as Record<string, unknown> | null
  if (!response.ok || !body) return { configured: true, ok: false as const }
  const synthesis = body.synthesis as Record<string, unknown> | undefined
  const run = body.run as Record<string, unknown> | undefined
  const content = String(synthesis?.answer || '').trim()
  if (!content) return { configured: true, ok: false as const }
  return {
    configured: true,
    ok: true as const,
    response: {
      content,
      model: 'yux-agent-harness-runtime',
      inputTokens: Number(run?.input_tokens || 0),
      outputTokens: Number(run?.output_tokens || 0),
    },
  }
}

async function postChatCompletion(baseUrl: string, apiKey: string, payload: Record<string, unknown>) {
  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://hub.yux.com.br',
      'X-Title': 'YUX Strategy Engine',
    },
    body: JSON.stringify(payload),
  })
  const text = await response.text()
  const body = safeJson(text)
  if (!response.ok) {
    return { ok: false as const, error: `LLM provider returned ${response.status}: ${formatProtectedError(text).slice(0, 500)}` }
  }
  const content = String(body?.choices?.[0]?.message?.content || '').trim()
  if (!content) return { ok: false as const, error: 'LLM provider returned an empty answer' }
  return {
    ok: true as const,
    content,
    model: String(body?.model || payload.model || ''),
    inputTokens: Number(body?.usage?.prompt_tokens || 0),
    outputTokens: Number(body?.usage?.completion_tokens || 0),
  }
}

function normalizeMode(mode?: string) {
  return mode && modeLabels[mode] ? mode : 'general'
}

function buildTitle(message: string) {
  return message.replace(/\s+/g, ' ').slice(0, 80)
}

function pick(record: Record<string, unknown>, keys: string[]) {
  return Object.fromEntries(keys.map(key => [key, record[key]]).filter(([, value]) => value !== undefined && value !== null))
}

function safeJson(text: string): ChatCompletionBody | null {
  try {
    return text ? JSON.parse(text) : null
  } catch {
    return null
  }
}
