import { History } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import type { AutomationExecutionRun } from '@/types/automation'

export function AutomationExecutionsWorkspace({ runs }: { runs: AutomationExecutionRun[] }) {
  const failures = runs.filter(run => run.status === 'failed').length

  return (
    <section className="rounded-md border bg-white">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
          <History className="h-4 w-4" />
          Execucoes
        </div>
        <div className="flex gap-2">
          <Badge variant="secondary">{runs.length} registros</Badge>
          {failures > 0 && <Badge variant="destructive">{failures} falhas</Badge>}
        </div>
      </header>
      <div className="divide-y">
        {runs.length ? runs.map(run => (
          <article key={run.id} className="grid gap-2 p-3 text-sm md:grid-cols-[160px_120px_1fr]">
            <span>{run.id}</span>
            <Badge variant={run.status === 'failed' ? 'destructive' : 'secondary'}>{run.status}</Badge>
            <span className={run.lastError ? 'text-red-600' : 'text-gray-600'}>{run.lastError || run.eventType || run.startedAt || 'sem detalhe'}</span>
          </article>
        )) : <p className="p-3 text-sm text-gray-500">Sem execucoes registradas.</p>}
      </div>
    </section>
  )
}
