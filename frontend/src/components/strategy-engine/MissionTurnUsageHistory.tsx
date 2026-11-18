import { useEffect, useState } from 'react'
import { apiRequest } from '@/lib/apiClient'
import { AgentUsageBreakdown, type CommercialCredits, type ProviderUsage } from './AgentUsageBreakdown'

type Scope = { organizationId: string; contractId: string; audience: string }
type Conversation = { id: string; title: string }
type Turn = {
  id: string
  startedAt: string
  provider: ProviderUsage
  credits: CommercialCredits
}

const endpoint = '/strategy-engine/agent-prompts'

export function MissionTurnUsageHistory({ organizationId, contractId, audience }: Scope) {
  const [conversations, setConversations] = useState<Conversation[] | null>(null)
  const [conversationId, setConversationId] = useState('')
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    const params = new URLSearchParams({ organizationId })
    if (contractId) params.set('contractId', contractId)
    apiRequest<{ conversations: Conversation[] }>(`${endpoint}/conversations?${params}`, { signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) setConversations(data.conversations) })
      .catch(() => { if (!controller.signal.aborted) setFailed(true) })
    return () => controller.abort()
  }, [organizationId, contractId])

  return (
    <section aria-label="Consumo das conversas de missão" className="space-y-4 rounded-lg border bg-white p-5 text-sm">
      <h2 className="text-lg font-semibold">Consumo das conversas de missão</h2>
      <label className="block max-w-xl">Conversa da missão
        <select aria-label="Conversa da missão" value={conversationId} disabled={!conversations?.length}
          onChange={event => setConversationId(event.target.value)} className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2">
          <option value="">{conversations?.length === 0 ? 'Nenhuma conversa neste escopo'
            : conversations || failed ? 'Selecione uma conversa' : 'Consultando conversas…'}</option>
          {conversations?.map(conversation => <option key={conversation.id} value={conversation.id}>{conversation.title}</option>)}
        </select>
      </label>
      {failed && <p role="alert" className="text-red-700">Não foi possível consultar as conversas deste escopo.</p>}
      {conversationId && <ConversationTurns key={conversationId}
        organizationId={organizationId} contractId={contractId} audience={audience} conversationId={conversationId} />}
    </section>
  )
}

function ConversationTurns({ organizationId, contractId, audience, conversationId }: Scope & { conversationId: string }) {
  const [turns, setTurns] = useState<Turn[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)

  async function load() {
    const params = new URLSearchParams({ organizationId, audience, conversationId })
    if (contractId) params.set('contractId', contractId)
    setLoading(true)
    setFailed(false)
    try {
      const result = await apiRequest<{ turns: Turn[] }>(`${endpoint}/mission-turn-history?${params}`)
      setTurns(result.turns)
    } catch {
      setTurns(null)
      setFailed(true)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-3">
      <button type="button" disabled={loading} onClick={load} className="rounded-md border px-3 py-2 font-medium disabled:opacity-50">
        {loading ? 'Consultando…' : turns ? 'Atualizar turnos' : 'Consultar turnos'}
      </button>
      {failed && <p role="alert" className="text-red-700">Não foi possível consultar os turnos desta conversa.</p>}
      {turns?.length === 0 && <p role="status" className="text-gray-600">Sem registros de consumo para o público selecionado.</p>}
      {turns?.map(({ id, startedAt, provider, credits }) => (
        <article key={id} className="space-y-3 rounded-md border p-3">
          <h3 className="font-semibold">Turno · <time dateTime={startedAt}>{new Date(startedAt).toLocaleString('pt-BR')}</time></h3>
          <AgentUsageBreakdown provider={provider} credits={credits} />
        </article>
      ))}
    </div>
  )
}
