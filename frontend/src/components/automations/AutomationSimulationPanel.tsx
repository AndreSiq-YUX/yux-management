import { FlaskConical, Play } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { AutomationFlow } from '@/types/automation'

export function AutomationSimulationPanel({ flow }: { flow?: AutomationFlow }) {
  return (
    <section className="rounded-md border bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-start gap-2">
          <FlaskConical className="mt-0.5 h-4 w-4 text-slate-600" />
          <div>
            <h2 className="text-base font-semibold text-slate-950">Simulacao</h2>
            <p className="text-sm text-slate-600">{flow ? `Testar ${flow.name}` : 'Testar payloads antes de publicar.'}</p>
          </div>
        </div>
        <Button type="button" size="sm" variant="outline">
          <Play className="mr-2 h-4 w-4" />
          Simular
        </Button>
      </div>
    </section>
  )
}
