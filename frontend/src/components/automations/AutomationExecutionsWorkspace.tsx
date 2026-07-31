import { ChevronDown, ChevronRight, Clock, History, RotateCcw } from 'lucide-react'
import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { AutomationExecutionRun } from '@/types/automation'

interface AutomationExecutionsWorkspaceProps {
  runs: AutomationExecutionRun[]
  onRetry?: (runId: string) => void
}

export function AutomationExecutionsWorkspace({ runs, onRetry }: AutomationExecutionsWorkspaceProps) {
  const failures = runs.filter(run => run.status === 'failed').length
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null)

  const formatDuration = (startedAt?: string, completedAt?: string) => {
    if (!startedAt || !completedAt) return '-'
    const start = new Date(startedAt).getTime()
    const end = new Date(completedAt).getTime()
    const ms = end - start
    if (ms < 1000) return `${ms}ms`
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
    return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`
  }

  const formatDate = (iso?: string) => {
    if (!iso) return '-'
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  }

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
        {runs.length === 0 && <p className="p-3 text-sm text-gray-500">Sem execucoes registradas.</p>}
        {runs.map(run => {
          const isExpanded = expandedRunId === run.id
          const duration = formatDuration(run.startedAt, run.completedAt)
          const statusColor =
            run.status === 'completed' ? 'text-green-600' :
            run.status === 'failed' ? 'text-red-600' :
            run.status === 'processing' ? 'text-blue-600' :
            'text-gray-500'

          return (
            <article key={run.id} className="space-y-2">
              <div
                className="flex cursor-pointer items-center gap-3 p-3 hover:bg-slate-50"
                onClick={() => setExpandedRunId(isExpanded ? null : run.id)}
              >
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4 shrink-0 text-gray-400" />
                ) : (
                  <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" />
                )}
                <div className={`flex h-2 w-2 shrink-0 rounded-full ${statusColor.replace('text-', 'bg-')}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-gray-500">{run.id.slice(0, 8)}</span>
                    <Badge variant={run.status === 'failed' ? 'destructive' : run.status === 'completed' ? 'default' : 'secondary'} className="text-xs">
                      {run.status}
                    </Badge>
                    {run.eventType && <Badge variant="outline" className="text-xs">{run.eventType}</Badge>}
                  </div>
                  {run.lastError && (
                    <p className="mt-1 truncate text-xs text-red-600">{run.lastError}</p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2 text-xs text-gray-500">
                  <Clock className="h-3 w-3" />
                  <span>{duration}</span>
                  <span>{formatDate(run.startedAt)}</span>
                </div>
              </div>

              {isExpanded && (
                <div className="border-t bg-slate-50 p-3 space-y-3">
                  <div className="grid gap-3 text-xs md:grid-cols-3">
                    <div>
                      <span className="font-semibold text-gray-700">ID:</span>
                      <span className="ml-2 font-mono text-gray-600">{run.id}</span>
                    </div>
                    <div>
                      <span className="font-semibold text-gray-700">Inicio:</span>
                      <span className="ml-2 text-gray-600">{formatDate(run.startedAt)}</span>
                    </div>
                    <div>
                      <span className="font-semibold text-gray-700">Fim:</span>
                      <span className="ml-2 text-gray-600">{formatDate(run.completedAt)}</span>
                    </div>
                  </div>

                  {run.leadId && (
                    <div className="text-xs">
                      <span className="font-semibold text-gray-700">Lead:</span>
                      <span className="ml-2 font-mono text-gray-600">{run.leadId}</span>
                    </div>
                  )}

                  {run.lastError && (
                    <div className="rounded-md border border-red-200 bg-red-50 p-2">
                      <p className="text-xs font-semibold text-red-900">Erro:</p>
                      <pre className="mt-1 whitespace-pre-wrap text-xs text-red-800">{run.lastError}</pre>
                    </div>
                  )}

                  {run.status === 'failed' && onRetry && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => onRetry(run.id)}
                    >
                      <RotateCcw className="mr-1 h-3 w-3" />
                      Tentar novamente
                    </Button>
                  )}
                </div>
              )}
            </article>
          )
        })}
      </div>
    </section>
  )
}
