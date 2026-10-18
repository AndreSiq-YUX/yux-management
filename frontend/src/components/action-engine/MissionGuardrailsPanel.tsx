import { AlertTriangle, CheckCircle2, ShieldAlert } from 'lucide-react'
import { formatBrl, formatMetric } from '@/lib/action-engine/missionRules'
import type { MissionMetricSpec, MissionMetrics, MissionStatus } from '@/types/actionEngine'

export function MissionGuardrailsPanel({ metrics, metricSpec, status }: { metrics: MissionMetrics; metricSpec?: MissionMetricSpec; status: MissionStatus }) {
  const keys = metricSpec?.guardrails ?? []
  if (!keys.length) return null
  const breached = guardrailBreaches(metrics)
  const protectedPause = status === 'paused' && breached.length > 0
  return (
    <section aria-labelledby="mission-guardrails-title" className={`border bg-yx-surface ${protectedPause ? 'border-yx-crit-line' : 'border-yx-line'}`}>
      <div className={`border-b px-5 py-4 ${protectedPause ? 'border-yx-crit-line bg-yx-crit-soft' : 'border-yx-line'}`}>
        <div className="flex items-center gap-2">
          {protectedPause ? <ShieldAlert className="h-4 w-4 text-yx-crit" /> : <CheckCircle2 className="h-4 w-4 text-yx-ok" />}
          <h2 id="mission-guardrails-title" className="font-semibold text-yx-fg">Limites de proteção</h2>
        </div>
        <p className="mt-1 text-xs text-yx-fg-2">{protectedPause ? 'A missão foi pausada por uma condição de segurança.' : 'Nenhum limite crítico observado exige pausa neste momento.'}</p>
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
  return <div className={`border-b border-yx-line p-4 sm:border-r xl:border-b-0 ${breached ? 'bg-yx-crit-soft' : ''}`}><AlertTriangle className={`h-4 w-4 ${breached ? 'text-yx-crit' : 'text-yx-fg-3'}`} /><p className="mt-3 text-[10px] font-bold uppercase tracking-wide text-yx-fg-3">{guardrailLabel[metricKey] ?? humanize(metricKey)}</p><p className="mt-1 text-sm font-semibold text-yx-fg">{current}</p>{breached ? <p className="mt-1 text-xs font-medium text-yx-crit">Limite acionado</p> : null}</div>
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
