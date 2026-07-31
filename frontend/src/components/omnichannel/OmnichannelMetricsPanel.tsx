export interface AdminMetrics {
  volume: number
  slaRate: number
  handoffCount: number
  channelMix: Record<string, number>
  aiCost?: number
  latencyMs?: number
}

interface OmnichannelMetricsPanelProps {
  metrics: AdminMetrics
  profile: 'internal' | 'portal'
}

export function OmnichannelMetricsPanel({ metrics, profile }: OmnichannelMetricsPanelProps) {
  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold text-gray-900">Metricas</h2>
      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Metric label="Volume" value={String(metrics.volume)} />
        <Metric label="SLA" value={`${Math.round(metrics.slaRate * 100)}%`} />
        <Metric label="Handoffs" value={String(metrics.handoffCount)} />
        <Metric label="Canais" value={Object.entries(metrics.channelMix).map(([channel, total]) => `${channel} ${total}`).join(' | ')} />
        {profile === 'internal' && <Metric label="Custo IA" value={`R$ ${(metrics.aiCost || 0).toFixed(2).replace('.', ',')}`} />}
        {profile === 'internal' && <Metric label="Latencia" value={`${metrics.latencyMs || 0} ms`} />}
      </div>
    </section>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-white p-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-gray-900">{label} {value}</p>
    </div>
  )
}
