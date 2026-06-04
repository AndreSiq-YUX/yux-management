import { Badge } from '@/components/ui/badge'
import { automationTriggerCatalog } from '@/lib/automations/automationCatalog'
import { estimateAutomationRisk } from '@/lib/automations/intelligentAutomationRules'
import type { AutomationFlow } from '@/types/automation'

export function AutomationTechnicalBuilder({ flow }: { flow?: AutomationFlow }) {
  const risk = estimateAutomationRisk(flow?.actions || [])

  return (
    <section className="rounded-md border bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-950">Builder tecnico YUX</h2>
          <p className="text-sm text-slate-600">Eventos, payloads, risco e publicacao por versao.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant={risk.level === 'high' ? 'destructive' : risk.level === 'medium' ? 'secondary' : 'outline'}>
            risco {risk.level}
          </Badge>
          {flow?.builderMode && <Badge variant="outline">{flow.builderMode}</Badge>}
        </div>
      </div>
      <div className="mt-3 grid gap-3 text-sm md:grid-cols-3">
        <Metric label="Gatilhos catalogados" value={automationTriggerCatalog.length} />
        <Metric label="Versao publicada" value={flow?.publishedVersion || 0} />
        <Metric label="Limite diario" value={flow?.dailyRunLimit || 500} />
      </div>
    </section>
  )
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border bg-slate-50 p-3">
      <p className="text-xs uppercase text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-slate-950">{value}</p>
    </div>
  )
}
