import { useState } from 'react'
import { apiRequest } from '@/lib/apiClient'

type Stage = {
  name: string
  attempts: number | null
  inputTokens: number | null
  outputTokens: number | null
  reasoningTokens: number | null
  confirmedUsd: number | null
}

type Execution = {
  id: string
  revision: number
  state: 'active' | 'exhausted' | 'completed' | 'cancelled'
  startedAt: string
  reservedBrl: string
  reconciledBrl: string | null
  totalUsd: number | null
  knownSubtotalUsd: number | null
  stages: Stage[]
}

const stateLabel = { active: 'Em andamento', exhausted: 'Limite atingido', completed: 'Concluído', cancelled: 'Interrompido' }
const stageLabels: Record<string, string> = {
  planner: 'Supervisor',
  'funnel_nurture.crm_architect': 'Arquitetura de CRM',
  'funnel_nurture.copywriter': 'Redação de nutrição',
  'funnel_nurture.automation_architect': 'Arquitetura de automação',
  'funnel_nurture.brand_compliance_guardian': 'Revisão de marca da nutrição',
  'campaign_launch.campaign_strategist': 'Estratégia de campanha',
  'campaign_launch.copywriter': 'Redação de campanha',
  'campaign_launch.brand_compliance_guardian': 'Revisão de marca da campanha',
  'campaign_launch.measurement_analyst': 'Medição da campanha',
}
const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 6 })
const usd = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'USD', maximumFractionDigits: 6 })
const count = new Intl.NumberFormat('pt-BR')
const stageMetrics = [
  ['attempts', 'Tentativas'], ['inputTokens', 'Tokens de entrada'], ['outputTokens', 'Tokens de saída'],
  ['reasoningTokens', 'Tokens de raciocínio'], ['confirmedUsd', 'Valor informado'],
] as const

export function PlanningUsageHistory({ organizationId, contractId, missionId }: {
  organizationId: string
  contractId: string
  missionId: string
}) {
  const [result, setResult] = useState<Execution[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)

  async function load() {
    setLoading(true)
    setFailed(false)
    try {
      const params = new URLSearchParams({ organizationId, missionId })
      if (contractId) params.set('contractId', contractId)
      const data = await apiRequest<{ executions: Execution[] }>(`/strategy-engine/agent-prompts/planning-history?${params}`)
      setResult(data.executions)
    } catch {
      setResult(null)
      setFailed(true)
    } finally {
      setLoading(false)
    }
  }

  return (
    <section aria-label="Execuções do planejamento" className="space-y-4 rounded-lg border bg-white p-5 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="text-lg font-semibold">Execuções do planejamento</h2>
        <button type="button" onClick={load} disabled={loading} className="rounded-md border px-3 py-2 font-medium disabled:opacity-50">
          {loading ? 'Consultando…' : result ? 'Atualizar execuções' : 'Consultar execuções'}
        </button>
      </div>
      {failed && <p role="alert" className="text-red-700">Não foi possível consultar as execuções desta missão.</p>}
      {result?.length === 0 && <p role="status" className="text-gray-600">Sem registros de planejamento para esta missão.</p>}
      {result?.length === 10 && <p className="text-gray-600">Dez execuções mais recentes.</p>}
      {result?.map(execution => (
        <article key={execution.id} className="space-y-3 rounded-md border p-3">
          <header className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="font-semibold">Revisão {execution.revision} · {stateLabel[execution.state]}</h3>
            <time dateTime={execution.startedAt} className="text-gray-600">{new Date(execution.startedAt).toLocaleString('pt-BR')}</time>
          </header>
          <dl className="grid gap-3 sm:grid-cols-3">
            <div><dt className="text-gray-600">Reserva de planejamento</dt><dd className="font-semibold">{brl.format(Number(execution.reservedBrl))}</dd></div>
            <div><dt className="text-gray-600">{execution.totalUsd === null ? 'Subtotal do provedor' : 'Custo informado pelo provedor'}</dt>
              <dd className="font-semibold">{execution.knownSubtotalUsd === null ? 'Sem medição' : usd.format(execution.knownSubtotalUsd)}</dd></div>
            <div><dt className="text-gray-600">Conciliação em reais</dt>
              <dd className="font-semibold">{execution.reconciledBrl === null ? 'Pendente' : brl.format(Number(execution.reconciledBrl))}</dd></div>
          </dl>
          {execution.stages.length > 0 && <details className="border-t pt-2">
            <summary className="cursor-pointer font-medium">Consumo medido por etapa</summary>
            <div className="mt-2">
              <table role="table" aria-label={`Consumo medido da revisão ${execution.revision}`} className="block w-full text-left sm:table">
                <thead role="rowgroup" className="sr-only sm:not-sr-only sm:table-header-group"><tr role="row" className="border-b text-gray-600">
                  <th scope="col" className="p-2">Etapa</th>
                  {stageMetrics.map(([key, label]) => <th key={key} scope="col" className="p-2">{label}</th>)}
                </tr></thead>
                <tbody role="rowgroup" className="block divide-y sm:table-row-group">
                  {execution.stages.map((stage, index) => (
                    <tr key={`${stage.name}/${index}`} role="row" className="grid grid-cols-2 gap-2 py-2 sm:table-row">
                      <th role="rowheader" scope="row" className="col-span-2 font-medium sm:p-2">{stageLabels[stage.name] ?? stage.name}</th>
                      {stageMetrics.map(([field, label]) => {
                        const value = stage[field]
                        const formatted = field === 'confirmedUsd' ? (value === null ? 'Pendente' : usd.format(value))
                          : (value === null ? '—' : count.format(value))
                        return <td key={field} role="cell" className="block sm:table-cell sm:p-2">
                          <span aria-hidden="true" className="block text-xs text-gray-600 sm:hidden">{label}</span>
                          {formatted}
                        </td>
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>}
        </article>
      ))}
    </section>
  )
}
