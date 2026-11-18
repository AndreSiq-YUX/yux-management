import { useEffect, useState } from 'react'
import { apiRequest } from '@/lib/apiClient'

type Scope = { organizationId: string; contractId: string; audience: string }
type Conversation = { id: string; title: string }
type Turn = {
  id: string
  startedAt: string
  provider: {
    attempts: number | null; knownSubtotalUsd: number | null; totalUsd: number | null
    inputTokens: number | null; outputTokens: number | null; reasoningTokens: number | null
  }
  credits: {
    state: 'held' | 'executing' | 'released' | 'settled' | 'uncertain' | 'unbilled' | 'unmeasured'
    unlimited: boolean | null; reserved: number | null; charged: number | null; released: number | null
  }
}

const endpoint = '/strategy-engine/agent-prompts'
const usd = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'USD', maximumFractionDigits: 6 })
const count = new Intl.NumberFormat('pt-BR')
const creditStatus = {
  held: 'Reserva aberta', executing: 'Em processamento', released: 'Reserva liberada', settled: 'Concluído',
  uncertain: 'Aguardando conciliação', unbilled: 'Sem cobrança de créditos', unmeasured: 'Sem registro de créditos',
}

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
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <h4 className="font-medium">Uso do provedor</h4>
              <dl className="grid grid-cols-2 gap-2">
                <div><dt className="text-gray-600">{provider.totalUsd === null ? 'Subtotal informado' : 'Custo informado'}</dt>
                  <dd className="font-semibold">
                    {provider.knownSubtotalUsd === null ? 'Sem medição' : usd.format(provider.knownSubtotalUsd)}
                    {provider.totalUsd === null && provider.knownSubtotalUsd !== null && <span className="block text-xs font-normal text-gray-600">Total pendente</span>}
                  </dd>
                </div>
                {([
                  ['Tentativas', provider.attempts], ['Tokens de entrada', provider.inputTokens],
                  ['Tokens de saída', provider.outputTokens], ['Tokens de raciocínio', provider.reasoningTokens],
                ] as const).map(([label, value]) => <div key={label}><dt className="text-gray-600">{label}</dt>
                  <dd>{value === null ? '—' : count.format(value)}</dd></div>)}
              </dl>
            </div>
            <div className="space-y-2 border-t pt-3 md:border-l md:border-t-0 md:pl-4 md:pt-0">
              <h4 className="font-medium">Créditos comerciais</h4>
              <p>{creditStatus[credits.state]}{credits.unlimited ? ' · Carteira ilimitada' : ''}</p>
              {credits.state !== 'unbilled' && credits.state !== 'unmeasured' && <dl className="grid grid-cols-3 gap-2">
                {([
                  ['Reservados', credits.reserved], [credits.unlimited ? 'Consumidos' : 'Debitados', credits.charged], ['Liberados', credits.released],
                ] as const).map(([label, value]) => <div key={label}><dt className="text-gray-600">{label}</dt>
                  <dd className="font-semibold">{value === null ? '—' : count.format(value)}</dd></div>)}
              </dl>}
            </div>
          </div>
        </article>
      ))}
    </div>
  )
}
