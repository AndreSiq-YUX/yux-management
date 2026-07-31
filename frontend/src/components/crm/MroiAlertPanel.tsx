import { AlertTriangle, CheckCircle2, Info, Siren } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import type { CrmMroiAlert } from '@/types/crmAttribution'

interface MroiAlertPanelProps {
  alerts: CrmMroiAlert[]
}

const severityConfig = {
  info: { label: 'Info', icon: Info, className: 'border-slate-200 bg-slate-50 text-slate-700' },
  warning: { label: 'Atencao', icon: AlertTriangle, className: 'border-amber-200 bg-amber-50 text-amber-800' },
  critical: { label: 'Critico', icon: Siren, className: 'border-red-200 bg-red-50 text-red-800' },
  success: { label: 'Oportunidade', icon: CheckCircle2, className: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
} as const

export function MroiAlertPanel({ alerts }: MroiAlertPanelProps) {
  const openAlerts = alerts.filter(alert => alert.status === 'open')

  return (
    <section className="rounded-md border bg-white">
      <header className="border-b px-4 py-3">
        <h2 className="font-semibold text-slate-950">Alertas de campanha</h2>
        <p className="text-sm text-slate-500">Sinais simples para ajustar investimento, origem e conversao.</p>
      </header>
      <div className="divide-y">
        {openAlerts.map(alert => {
          const config = severityConfig[alert.severity]
          const Icon = config.icon
          return (
            <article key={`${alert.sourceId || alert.campaignId}-${alert.title}-${alert.metricKey}`} className="flex items-start gap-3 px-4 py-3 text-sm">
              <Icon className="mt-0.5 h-4 w-4 text-slate-500" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-medium text-slate-950">{alert.title}</h3>
                  <Badge variant="outline" className={config.className}>{config.label}</Badge>
                </div>
                <p className="mt-1 text-slate-600">{alert.description}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {alert.metricKey}: {alert.metricValue} | limite {alert.thresholdValue}
                </p>
              </div>
            </article>
          )
        })}
        {openAlerts.length === 0 && <p className="px-4 py-6 text-sm text-slate-500">Nenhum alerta aberto para as fontes no periodo.</p>}
      </div>
    </section>
  )
}
