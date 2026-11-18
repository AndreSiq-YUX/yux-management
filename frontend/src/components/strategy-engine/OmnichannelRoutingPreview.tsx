import { useEffect, useState, type FormEvent } from 'react'
import { apiRequest } from '@/lib/apiClient'
import { assistantSelectionReasons } from '@/lib/omnichannel/omnichannelRules'
import type { StrategyOrganization } from '@/types/strategyEngine'

type Connection = { id: string; name: string }
type Choice = { reason: keyof typeof assistantSelectionReasons; assistantName: string | null }
type Result = { enabled: boolean; baseline: { configuredAssistant: boolean }; candidate: Choice | { wait: string } }

const endpoint = '/strategy-engine/agent-prompts/omnichannel'
const control = 'w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm'
const waitReasons: Record<string, string> = {
  contract_unavailable: 'Encaminhar para revisão humana. O canal precisa de um contrato ativo identificável.',
  channel_assistant_unavailable: 'Encaminhar para revisão humana. O assistente vinculado está indisponível no contrato.',
  human_in_control: 'Atendimento humano em andamento.',
}

export function OmnichannelRoutingPreview({ organizations }: { organizations: StrategyOrganization[] }) {
  const [organizationId, setOrganizationId] = useState('')
  return (
    <details className="rounded-lg border bg-white p-5">
      <summary className="cursor-pointer font-semibold">Simular seleção no WhatsApp</summary>
      <div className="mt-3 space-y-3">
        <label className="block text-sm">Subconta do WhatsApp
          <select className={control} value={organizationId} onChange={event => setOrganizationId(event.target.value)}>
            <option value="">Selecione a subconta</option>
            {organizations.map(org => <option key={org.id} value={org.id}>{org.name}</option>)}
          </select>
        </label>
        {organizationId && <RoutingScenario key={organizationId} organizationId={organizationId} />}
      </div>
    </details>
  )
}

function RoutingScenario({ organizationId }: { organizationId: string }) {
  const [connections, setConnections] = useState<Connection[] | null>(null)
  const [connectionId, setConnectionId] = useState('')
  const [result, setResult] = useState<Result | null>(null)
  const [error, setError] = useState('')
  const [running, setRunning] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    apiRequest<Connection[]>(`${endpoint}/connections?organizationId=${encodeURIComponent(organizationId)}`, { signal: controller.signal })
      .then(setConnections).catch(() => {
        if (!controller.signal.aborted) setError('Não foi possível consultar os canais.')
      })
    return () => controller.abort()
  }, [organizationId])

  async function run(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    setRunning(true)
    setError('')
    setResult(null)
    try {
      setResult(await apiRequest<Result>(`${endpoint}/preview`, { method: 'POST', body: {
        organizationId, connectionId, message: String(data.get('message')).trim(),
        intent: String(data.get('intent')).trim() || undefined, stage: String(data.get('stage')).trim() || undefined,
      } }))
    } catch {
      setError('Não foi possível simular a seleção.')
    } finally {
      setRunning(false)
    }
  }

  return (
    <>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {connections === null && !error && <p role="status" className="text-sm">Carregando canais…</p>}
      {connections?.length === 0 && <p className="text-sm">A subconta está sem canais ativos de WhatsApp.</p>}
      {!!connections?.length && (
        <form onSubmit={run} onChange={() => setResult(null)} className="space-y-3 text-sm">
          <fieldset disabled={running} className="grid gap-3 md:grid-cols-2">
            <label>Canal
              <select className={control} required value={connectionId} onChange={event => setConnectionId(event.target.value)}>
                <option value="">Selecione o canal</option>
                {connections.map(connection => <option key={connection.id} value={connection.id}>{connection.name}</option>)}
              </select>
            </label>
            <label>Mensagem fictícia
              <textarea className={control} name="message" required maxLength={8000} rows={2} />
            </label>
            <label>Intenção anterior (opcional)<input className={control} name="intent" maxLength={120} /></label>
            <label>Etapa anterior (opcional)<input className={control} name="stage" maxLength={120} /></label>
          </fieldset>
          <button type="submit" disabled={running || !connectionId} className="rounded-md bg-yux-600 px-3 py-2 font-medium text-white disabled:opacity-60">
            {running ? 'Simulando…' : 'Simular seleção sem envio'}
          </button>
        </form>
      )}
      {result && <div role="status" className="space-y-1 rounded-md border bg-slate-50 p-3 text-sm">
        <p>{result.enabled ? 'Nova seleção habilitada para o canal.' : 'Canal com seleção herdada.'}</p>
        <p>Seleção herdada · {result.baseline.configuredAssistant ? 'Assistente da subconta' : 'SDR padrão'}</p>
        <p>Nova seleção · {'wait' in result.candidate ? waitReasons[result.candidate.wait] ?? 'Encaminhar para revisão humana.'
          : [assistantSelectionReasons[result.candidate.reason], result.candidate.assistantName].filter(Boolean).join(' · ')}</p>
      </div>}
    </>
  )
}
