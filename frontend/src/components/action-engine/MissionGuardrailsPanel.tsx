import { AlertTriangle, CheckCircle2, ShieldAlert } from 'lucide-react'
import { formatBrl, formatMetric } from '@/lib/action-engine/missionRules'
import type { MissionMetricSpec, MissionMetrics, MissionStatus } from '@/types/actionEngine'

export function MissionGuardrailsPanel({ metrics, metricSpec, status }: { metrics: MissionMetrics; metricSpec?: MissionMetricSpec; status: MissionStatus }) {
  const keys = metricSpec?.guardrails ?? []
  if (!keys.length) return null
  const breached = guardrailBreaches(metrics)
  const protectedPause = status === 'paused' && breached.length > 0
  return (
    <section aria-labelledby="mission-guardrails-title" className={`border bg-white ${protectedPause ? 'border-red-300' : 'border-slate-200'}`}>
      <div className={`border-b px-5 py-4 ${protectedPause ? 'border-red-200 bg-red-50' : 'border-slate-200'}`}>
        <div className="flex items-center gap-2">
          {protectedPause ? <ShieldAlert className="h-4 w-4 text-red-700" /> : <CheckCircle2 className="h-4 w-4 text-emerald-700" />}
          <h2 id="mission-guardrails-title" className="font-semibold text-slate-950">Limites de proteção</h2>
        </div>
        <p className="mt-1 text-xs text-slate-600">{protectedPause ? 'A missão foi pausada por uma condição de segurança.' : 'Nenhum limite crítico observado exige pausa neste momento.'}</p>
      </div>
      <div className="grid sm:grid-cols-2 xl:grid-cols-5">
        {keys.map(key => <Guardrail key={key} metricKey={key} metrics={metrics} breached={breached.includes(key)} />)}
      </div>
    </section>
  )
}

function Guardrail({ metricKey, metrics, breached }: { metricKey: string; metrics: MissionMetrics; breached: boolean }) {
  const metric = metrics[metricKey]
  const current = metricKey === 'total_budget_brl' && metrics.spend_brl?.kind === 'known'
    ? `${formatBrl(metrics.spend_brl.value)} de ${formatMetric(metric)}`
    : formatMetric(metric)
  return <div className={`border-b border-slate-200 p-4 sm:border-r xl:border-b-0 ${breached ? 'bg-red-50' : ''}`}><AlertTriangle className={`h-4 w-4 ${breached ? 'text-red-700' : 'text-slate-400'}`} /><p className="mt-3 text-[10px] font-bold uppercase tracking-wide text-slate-500">{guardrailLabel[metricKey] ?? humanize(metricKey)}</p><p className="mt-1 text-sm font-semibold text-slate-900">{current}</p>{breached ? <p className="mt-1 text-xs font-medium text-red-700">Limite acionado</p> : null}</div>
}

function guardrailBreaches(metrics: MissionMetrics): string[] {
  const result: string[] = []
  if (knownNumber(metrics.tracking_failure) > 0) result.push('tracking_failure')
  if (knownNumber(metrics.consent_blocks) > 0) result.push('consent_blocks')
  if (knownNumber(metrics.complaint_rate) > 0.02) result.push('complaint_rate')
  if (knownNumber(metrics.spend_brl) > knownNumber(metrics.total_budget_brl) && knownNumber(metrics.total_budget_brl) > 0) result.push('total_budget_brl')
  return result
}

function knownNumber(metric: MissionMetrics[string]) { return metric?.kind === 'known' && Number.isFinite(Number(metric.value)) ? Number(metric.value) : 0 }
function humanize(value: string) { return value.replace(/_/g, ' ').replace(/^./, (letter: string) => letter.toUpperCase()) }
const guardrailLabel: Record<string, string> = { total_budget_brl: 'Orçamento total', daily_budget_brl: 'Orçamento diário', consent_blocks: 'Bloqueios de consentimento', tracking_failure: 'Falhas de tracking', complaint_rate: 'Taxa de reclamação' }
