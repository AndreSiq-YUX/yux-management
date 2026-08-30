import { Activity, CircleDollarSign, Gauge, MessageSquare, MousePointerClick, PhoneCall, Target, UserRoundCheck, Users } from 'lucide-react'
import { formatMetric } from '@/lib/action-engine/missionRules'
import type { MissionMetric, MissionMetricDefinition, MissionMetrics, MissionMetricSpec } from '@/types/actionEngine'

const fallbackDefinitions: MissionMetricDefinition[] = [
  { key: 'signed_revenue', unit: 'BRL', group: 'primary' },
  { key: 'contacted_opportunities', unit: 'count', group: 'operational' },
  { key: 'positive_responses', unit: 'count', group: 'operational' },
  { key: 'meetings_booked', unit: 'count', group: 'operational' },
  { key: 'human_hours', unit: 'hours', group: 'economics' },
]

export function MissionMetricsPanel({ metrics, metricSpec, showTechnicalProof = false }: { metrics: MissionMetrics; metricSpec?: MissionMetricSpec; showTechnicalProof?: boolean }) {
  const definitions = metricDefinitions(metricSpec)
  return (
    <section className="border border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-5 py-4"><h2 className="font-semibold text-slate-950">Resultados observados</h2><p className="mt-1 text-xs text-slate-500">Valores ausentes continuam desconhecidos; métricas sem denominador aparecem como não aplicáveis.</p></div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {definitions.map(definition => <MetricCard key={definition.key} definition={definition} metric={metrics[definition.key]} showTechnicalProof={showTechnicalProof} />)}
      </div>
    </section>
  )
}

function MetricCard({ definition, metric, showTechnicalProof }: { definition: MissionMetricDefinition; metric?: MissionMetric; showTechnicalProof: boolean }) {
  const Icon = metricIcon[definition.key] ?? Activity
  const policy = definition.attributionPolicy ?? {}
  return <div className="border-b border-slate-200 p-4 sm:border-r"><Icon className="h-4 w-4 text-[#2563EB]" /><p className="mt-4 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">{metricLabel[definition.key] ?? humanize(definition.key)}</p><p className="mt-2 text-lg font-semibold text-slate-950">{metricText(metric)}</p>{metric && metric.kind !== 'known' ? <p className="mt-1 text-[11px] leading-4 text-slate-500">{reasonLabel[metric.reason] ?? humanize(metric.reason)}</p> : null}{definition.attributionPolicy ? <p className="mt-2 text-[10px] leading-4 text-slate-500">Atribuição: {humanize(String(policy.model ?? 'versionada'))} · {String(policy.windowDays ?? '—')} dias · v{String(policy.version ?? '—')}</p> : null}{showTechnicalProof && definition.attributionPolicyHash ? <p className="mt-1 break-all font-mono text-[9px] text-slate-400">{definition.attributionPolicyHash}</p> : null}</div>
}

export function metricDefinitions(spec?: MissionMetricSpec): MissionMetricDefinition[] {
  if (!spec) return fallbackDefinitions
  const result: MissionMetricDefinition[] = []
  const primary = Array.isArray(spec.primary) ? spec.primary : spec.primary ? [spec.primary] : []
  for (const item of primary) if (item?.key) result.push({ ...item, group: 'primary' })
  append(result, spec.leading, 'leading')
  append(result, spec.operational, 'operational')
  append(result, spec.economics, 'economics')
  if (!result.length) return fallbackDefinitions
  const seen = new Set<string>()
  return result.filter(item => !seen.has(item.key) && Boolean(seen.add(item.key)))
}

function append(target: MissionMetricDefinition[], keys: string[] | undefined, group: MissionMetricDefinition['group']) { for (const key of keys ?? []) target.push({ key, group }) }
function metricText(metric?: MissionMetric) { return metric?.kind === 'known' ? formatMetric(metric) : metric?.kind === 'not_applicable' ? 'Não se aplica' : 'Desconhecido' }
function humanize(value: string) { return value.replace(/_/g, ' ').replace(/^./, (letter: string) => letter.toUpperCase()) }

const metricLabel: Record<string, string> = {
  signed_revenue: 'Receita recuperada', contacted_opportunities: 'Oportunidades contatadas', positive_responses: 'Respostas positivas', meetings_booked: 'Reuniões', human_hours: 'Horas humanas',
  leads: 'Leads', qualified_leads: 'Leads qualificados', attributed_revenue_brl: 'Receita atribuída', impressions: 'Impressões', clicks: 'Cliques', ctr: 'CTR', landing_conversion_rate: 'Conversão da landing page', spend_brl: 'Investimento em mídia', total_execution_cost_brl: 'Custo total', cpl_brl: 'Custo por lead', mroi: 'MROI',
}
const metricIcon: Record<string, typeof Activity> = { signed_revenue: CircleDollarSign, attributed_revenue_brl: CircleDollarSign, spend_brl: CircleDollarSign, total_execution_cost_brl: CircleDollarSign, contacted_opportunities: PhoneCall, positive_responses: MessageSquare, meetings_booked: UserRoundCheck, leads: Users, qualified_leads: UserRoundCheck, impressions: Gauge, clicks: MousePointerClick, ctr: Target, landing_conversion_rate: Target, cpl_brl: CircleDollarSign, mroi: Activity }
const reasonLabel: Record<string, string> = { campaign_tracking_unresolved: 'O tracking ainda não permite atribuição confiável.', attribution_identity_unresolved: 'A identidade entre campanha, lead e receita não foi resolvida.', zero_denominator: 'Ainda não há volume suficiente para calcular.', campaign_snapshot_unavailable: 'O provedor ainda não entregou um snapshot.' }
