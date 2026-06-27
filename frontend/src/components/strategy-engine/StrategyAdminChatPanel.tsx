import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Bot, Building2, FileText, Lightbulb, Loader2, Map, MessageSquarePlus, Send, ShieldCheck } from 'lucide-react'
import { strategyEngineService } from '@/services/strategyEngineService'
import type { StrategyAdminChatMode, StrategyChatMessage, StrategyChatSession, StrategyLlmProvider, StrategyModelRoute, StrategyOrganization } from '@/types/strategyEngine'

const promptPresets: Array<{ mode: StrategyAdminChatMode; label: string; icon: typeof Lightbulb; prompt: string }> = [
  {
    mode: 'initial_analysis',
    label: 'Analise inicial',
    icon: Lightbulb,
    prompt: 'Faca uma analise inicial deste cliente/prospect. Identifique os gargalos provaveis, oportunidades de caixa e quais dados ainda preciso levantar antes da reuniao.',
  },
  {
    mode: 'diagnostic_48h',
    label: 'Diagnostico 48h',
    icon: ShieldCheck,
    prompt: 'Monte um diagnostico 48h com hipoteses, perguntas de investigacao, dados que preciso coletar, quick wins e criterio de sucesso.',
  },
  {
    mode: 'service_plan',
    label: 'Plano ideal',
    icon: FileText,
    prompt: 'Sugira o plano de servicos ideal da YUX para este cliente, priorizando caixa, CRM, follow-up, recuperacao, recorrencia, oferta e aquisicao apenas se fizer sentido.',
  },
  {
    mode: 'proposal',
    label: 'Proposta',
    icon: FileText,
    prompt: 'Estruture uma proposta comercial consultiva: diagnostico resumido, escopo recomendado, fases, entregaveis, riscos, premissas, metricas e proximo passo.',
  },
  {
    mode: 'roadmap_30_60_90',
    label: 'Roadmap 30/60/90',
    icon: Map,
    prompt: 'Crie um roadmap 30/60/90 dias para implantar o sistema comercial inteligente deste cliente com prioridades, donos, canais e metricas.',
  },
  {
    mode: 'do_not_do',
    label: 'O que nao fazer',
    icon: ShieldCheck,
    prompt: 'Diga o que a YUX nao deveria recomendar agora para este cliente e explique por que. Priorize riscos de caixa, complexidade operacional e baixa previsibilidade.',
  },
]

export function StrategyAdminChatPanel({
  organizations,
  sessions,
  providers,
  modelRoutes,
  onRefreshSessions,
}: {
  organizations: StrategyOrganization[]
  sessions: StrategyChatSession[]
  providers: StrategyLlmProvider[]
  modelRoutes: StrategyModelRoute[]
  onRefreshSessions: () => Promise<void>
}) {
  const [selectedSessionId, setSelectedSessionId] = useState(sessions[0]?.id || '')
  const selectedSession = useMemo(() => sessions.find(session => session.id === selectedSessionId), [sessions, selectedSessionId])
  const [organizationId, setOrganizationId] = useState(selectedSession?.organizationId || organizations[0]?.id || '')
  const [mode, setMode] = useState<StrategyAdminChatMode>(selectedSession?.mode || 'initial_analysis')
  const [messages, setMessages] = useState<StrategyChatMessage[]>([])
  const [input, setInput] = useState(promptPresets[0].prompt)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const growthRoute = modelRoutes.find(route => route.agentType === 'growth_strategist' && route.routingTier === 'default' && route.status === 'active')
  const activeProvider = growthRoute ? providers.find(provider => (provider.provider_key || provider.providerKey) === growthRoute.provider && provider.status === 'active') : null

  useEffect(() => {
    if (!selectedSessionId && sessions[0]?.id) setSelectedSessionId(sessions[0].id)
  }, [selectedSessionId, sessions])

  useEffect(() => {
    if (!selectedSession) return
    setOrganizationId(selectedSession.organizationId || '')
    setMode(selectedSession.mode)
  }, [selectedSession])

  useEffect(() => {
    let active = true
    async function loadMessages() {
      if (!selectedSessionId) {
        setMessages([])
        return
      }
      setLoadingMessages(true)
      try {
        const result = await strategyEngineService.getStrategyChatMessages(selectedSessionId)
        if (active) setMessages(result)
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Nao foi possivel carregar a conversa.')
      } finally {
        if (active) setLoadingMessages(false)
      }
    }
    loadMessages()
    return () => { active = false }
  }, [selectedSessionId])

  function startNewSession() {
    setSelectedSessionId('')
    setMessages([])
    setMode('initial_analysis')
    setOrganizationId(organizations[0]?.id || '')
    setInput(promptPresets[0].prompt)
    setError(null)
  }

  function applyPreset(preset: typeof promptPresets[number]) {
    setMode(preset.mode)
    setInput(preset.prompt)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmed = input.trim()
    if (!trimmed || sending) return
    setSending(true)
    setError(null)
    try {
      const response = await strategyEngineService.runStrategyAdminChat({
        sessionId: selectedSessionId || undefined,
        message: trimmed,
        mode,
        organizationId: organizationId || undefined,
      })
      setSelectedSessionId(response.session.id)
      setMessages(current => [...current, response.userMessage, response.assistantMessage])
      setInput('')
      await onRefreshSessions()
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : 'Nao foi possivel rodar o estrategista YUX.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="grid min-h-[720px] gap-4 xl:grid-cols-[340px_1fr]">
      <aside className="flex min-h-0 flex-col rounded-lg border bg-white">
        <div className="border-b p-4">
          <button
            type="button"
            onClick={startNewSession}
            className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-yux-600 px-3 py-2 text-sm font-semibold text-white hover:bg-yux-700"
          >
            <MessageSquarePlus className="h-4 w-4" aria-hidden="true" />
            Nova analise estrategica
          </button>
        </div>

        <div className="space-y-3 border-b p-4">
          <label className="space-y-1 text-sm">
            <span className="font-medium text-gray-700">Cliente/prospect</span>
            <select value={organizationId} onChange={event => setOrganizationId(event.target.value)} className="w-full rounded-md border border-gray-300 bg-white px-3 py-2">
              <option value="">Sem cliente selecionado</option>
              {organizations.map(org => <option key={org.id} value={org.id}>{org.name}</option>)}
            </select>
          </label>
          <div className="rounded-md border border-yux-100 bg-yux-50 p-3 text-xs text-yux-900">
            <div className="flex items-center gap-2 font-semibold">
              <Bot className="h-4 w-4" aria-hidden="true" />
              Growth Strategist interno
            </div>
            <p className="mt-1 leading-relaxed">
              Usa o profile `growth_strategist`, skills estrategicas, RAG disponivel e dados do cliente para diagnostico e plano comercial.
            </p>
          </div>
          {(!growthRoute || !activeProvider) && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              {!growthRoute
                ? 'Rota default do growth_strategist nao encontrada.'
                : `Provider ${growthRoute.provider} ainda nao esta ativo em IA/LLM.`}
            </div>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Historico</h2>
          <div className="mt-2 space-y-2">
            {sessions.map(session => (
              <button
                key={session.id}
                type="button"
                onClick={() => setSelectedSessionId(session.id)}
                className={`w-full rounded-md border px-3 py-2 text-left text-sm ${session.id === selectedSessionId ? 'border-yux-600 bg-yux-50' : 'border-gray-200 hover:bg-gray-50'}`}
              >
                <span className="line-clamp-1 font-semibold text-gray-900">{session.title}</span>
                <span className="mt-1 flex items-center gap-1 text-xs text-gray-500">
                  <Building2 className="h-3 w-3" aria-hidden="true" />
                  {session.mode} / {new Date(session.lastMessageAt).toLocaleDateString('pt-BR')}
                </span>
              </button>
            ))}
            {sessions.length === 0 && <p className="rounded-md border border-dashed p-3 text-sm text-gray-500">Nenhuma conversa estrategica ainda.</p>}
          </div>
        </div>
      </aside>

      <section className="grid min-h-0 grid-rows-[auto_1fr_auto] rounded-lg border bg-white">
        <header className="border-b p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Chat com Estrategista YUX</h2>
              <p className="text-sm text-gray-600">Analise inicial, diagnostico 48h, plano ideal, proposta e roadmap para uso interno.</p>
            </div>
            <select value={mode} onChange={event => setMode(event.target.value as StrategyAdminChatMode)} className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm">
              {promptPresets.map(preset => <option key={preset.mode} value={preset.mode}>{preset.label}</option>)}
              <option value="general">Geral</option>
            </select>
          </div>

          <div className="mt-4 flex gap-2 overflow-x-auto">
            {promptPresets.map(preset => {
              const Icon = preset.icon
              return (
                <button
                  key={preset.mode}
                  type="button"
                  onClick={() => applyPreset(preset)}
                  className={`inline-flex shrink-0 items-center gap-2 rounded-md border px-3 py-2 text-xs font-semibold ${mode === preset.mode ? 'border-yux-600 bg-yux-50 text-yux-800' : 'border-gray-200 text-gray-700 hover:bg-gray-50'}`}
                >
                  <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                  {preset.label}
                </button>
              )
            })}
          </div>
        </header>

        <div className="min-h-0 overflow-y-auto bg-slate-50 p-4">
          {loadingMessages && <p className="text-sm text-gray-500">Carregando conversa...</p>}
          {!loadingMessages && messages.length === 0 && (
            <div className="flex h-full min-h-[360px] items-center justify-center text-center">
              <div className="max-w-md">
                <Bot className="mx-auto h-10 w-10 text-yux-600" aria-hidden="true" />
                <h3 className="mt-3 text-base font-semibold text-gray-900">Comece pelo diagnostico</h3>
                <p className="mt-1 text-sm text-gray-600">Escolha um cliente/prospect, selecione um atalho e envie a primeira pergunta para o Growth Strategist.</p>
              </div>
            </div>
          )}

          <div className="space-y-4">
            {messages.map(message => (
              <article key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[82%] rounded-lg border px-4 py-3 shadow-sm ${message.role === 'user' ? 'border-yux-200 bg-yux-600 text-white' : 'border-gray-200 bg-white text-gray-900'}`}>
                  <div className="mb-2 flex items-center gap-2 text-xs font-semibold opacity-80">
                    <Bot className="h-3.5 w-3.5" aria-hidden="true" />
                    {message.role === 'user' ? 'Voce' : `Growth Strategist${message.modelName ? ` / ${message.modelName}` : ''}`}
                  </div>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.content}</p>
                </div>
              </article>
            ))}
            {sending && (
              <div className="inline-flex items-center gap-2 rounded-md border bg-white px-3 py-2 text-sm text-gray-600">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Estrategista analisando contexto...
              </div>
            )}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="border-t bg-white p-4">
          {error && <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
          <div className="grid gap-3 md:grid-cols-[1fr_auto]">
            <textarea
              value={input}
              onChange={event => setInput(event.target.value)}
              placeholder="Pergunte ao estrategista YUX..."
              className="min-h-24 rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
            <button type="submit" disabled={sending || !input.trim()} className="inline-flex items-center justify-center gap-2 rounded-md bg-yux-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
              <Send className="h-4 w-4" aria-hidden="true" />
              Enviar
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}
