import { useState } from 'react'
import { apiRequest } from '@/lib/apiClient'
import { AgentUsageBreakdown, ProviderUsageDetails, type CommercialCredits, type ProviderUsage } from './AgentUsageBreakdown'

type Execution = {
  id: string
  startedAt: string
  state: 'queued' | 'running' | 'completed' | 'failed'
  provider: ProviderUsage
  credits: CommercialCredits
  stages: (ProviderUsage & { name: string })[]
}

const stateLabel = { queued: 'Na fila', running: 'Em andamento', completed: 'Concluída', failed: 'Falhou' }
const stageLabels = new Map([
  ['retrieval', 'Recuperação de fontes'], ['synthesizer', 'Síntese'],
  ['proposal_scope_analyst', 'Escopo da proposta'], ['cash_metrics_analyst', 'Métricas financeiras'],
  ['risk_auditor', 'Análise de riscos'], ['unidentified', 'Etapa sem identificação'],
])

export function PresalesUsageHistory({ organizationId, contractId }: { organizationId: string; contractId: string }) {
  const [executions, setExecutions] = useState<Execution[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)

  async function load() {
    setLoading(true)
    setFailed(false)
    try {
      const params = new URLSearchParams({ organizationId })
      if (contractId) params.set('contractId', contractId)
      const data = await apiRequest<{ executions: Execution[] }>(`/strategy-engine/agent-prompts/presales-history?${params}`)
      setExecutions(data.executions)
    } catch {
      setExecutions(null)
      setFailed(true)
    } finally {
      setLoading(false)
    }
  }

  return <section aria-label="Consumo da pré-venda" className="space-y-4 rounded-lg border bg-white p-5 text-sm">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <h2 className="text-lg font-semibold">Consumo da pré-venda</h2>
      <button type="button" onClick={load} disabled={loading} className="rounded-md border px-3 py-2 font-medium disabled:opacity-50">
        {loading ? 'Consultando…' : executions ? 'Atualizar consumo' : 'Consultar consumo da pré-venda'}
      </button>
    </div>
    {failed && <p role="alert" className="text-red-700">Não foi possível consultar o consumo deste escopo.</p>}
    {executions?.length === 0 && <p role="status" className="text-gray-600">Sem registros de pré-venda neste escopo.</p>}
    {executions?.length === 10 && <p className="text-gray-600">Dez análises mais recentes.</p>}
    {executions?.map(({ id, startedAt, state, provider, credits, stages }) => (
      <article key={id} className="space-y-3 rounded-md border p-3">
        <header className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-semibold">Análise · {stateLabel[state]}</h3>
          <time dateTime={startedAt} className="text-gray-600">{new Date(startedAt).toLocaleString('pt-BR')}</time>
        </header>
        <AgentUsageBreakdown provider={provider} credits={credits} />
        {stages.length > 0 && <details className="border-t pt-2">
          <summary className="cursor-pointer font-medium">Consumo medido por etapa</summary>
          <ul className="mt-2 grid gap-3 sm:grid-cols-2">
            {stages.map(stage => <li key={stage.name} className="space-y-1 rounded-md border p-2">
              <p className="font-medium">{stageLabels.get(stage.name) ?? stage.name}</p>
              <ProviderUsageDetails provider={stage} />
            </li>)}
          </ul>
        </details>}
      </article>
    ))}
  </section>
}
