import { ChevronDown, ChevronRight, Clock, History, RotateCcw } from 'lucide-react'
import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { EmptyState, PendingAction, ResponsiveTable, ShowMoreButton, StatusChip, useShowMore, type ResponsiveTableColumn } from '@/components/portal-ui'
import { formatPortalDateTime } from '@/lib/client-portal/portalDisplay'
import { runStatusLabel, runStatusVariant, triggerLabel } from './automationLabels'
import type { AutomationExecutionRun } from '@/types/automation'

export type AutomationExecutionRow = AutomationExecutionRun & { flowName?: string }

interface AutomationExecutionsWorkspaceProps {
  runs: AutomationExecutionRow[]
  /** `portal` = visual do Portal do Cliente (tabela no computador, cartões no celular). */
  variant?: 'default' | 'portal'
  /** Mostra só as primeiras N execuções (mais recentes). */
  limit?: number
}

export function AutomationExecutionsWorkspace({ runs, variant = 'default', limit }: AutomationExecutionsWorkspaceProps) {
  if (variant === 'portal') return <PortalExecutionsList runs={runs} limit={limit} />
  return <InternalExecutionsWorkspace runs={runs} />
}

function InternalExecutionsWorkspace({ runs }: { runs: AutomationExecutionRow[] }) {
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
    <section className="rounded-md border bg-yx-surface">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-yx-fg">
          <History className="h-4 w-4" />
          Execuções
        </div>
        <div className="flex gap-2">
          <Badge variant="secondary">{runs.length} registros</Badge>
          {failures > 0 && <Badge variant="destructive">{failures} falhas</Badge>}
        </div>
      </header>
      <div className="divide-y">
        {runs.length === 0 && <p className="p-3 text-sm text-yx-fg-3">Sem execuções registradas.</p>}
        {runs.map(run => {
          const isExpanded = expandedRunId === run.id
          const duration = formatDuration(run.startedAt, run.completedAt)
          const statusColor =
            run.status === 'completed' ? 'text-yx-ok' :
            run.status === 'failed' ? 'text-yx-crit' :
            run.status === 'processing' ? 'text-yx-blue' :
            'text-yx-fg-3'

          return (
            <article key={run.id} className="space-y-2">
              <div
                className="flex cursor-pointer items-center gap-3 p-3 hover:bg-yx-surface-2"
                onClick={() => setExpandedRunId(isExpanded ? null : run.id)}
              >
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4 shrink-0 text-yx-fg-3" />
                ) : (
                  <ChevronRight className="h-4 w-4 shrink-0 text-yx-fg-3" />
                )}
                <div className={`flex h-2 w-2 shrink-0 rounded-full ${statusColor.replace('text-', 'bg-')}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-yx-fg-3">{run.id.slice(0, 8)}</span>
                    <Badge variant={run.status === 'failed' ? 'destructive' : run.status === 'completed' ? 'default' : 'secondary'} className="text-xs">
                      {run.status}
                    </Badge>
                    {run.eventType && <Badge variant="outline" className="text-xs">{run.eventType}</Badge>}
                  </div>
                  {run.lastError && (
                    <p className="mt-1 truncate text-xs text-yx-crit">{run.lastError}</p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2 text-xs text-yx-fg-3">
                  <Clock className="h-3 w-3" />
                  <span>{duration}</span>
                  <span>{formatDate(run.startedAt)}</span>
                </div>
              </div>

              {isExpanded && (
                <div className="border-t bg-yx-surface-2 p-3 space-y-3">
                  <div className="grid gap-3 text-xs md:grid-cols-3">
                    <div>
                      <span className="font-semibold text-yx-fg-2">ID:</span>
                      <span className="ml-2 font-mono text-yx-fg-2">{run.id}</span>
                    </div>
                    <div>
                      <span className="font-semibold text-yx-fg-2">Início:</span>
                      <span className="ml-2 text-yx-fg-2">{formatDate(run.startedAt)}</span>
                    </div>
                    <div>
                      <span className="font-semibold text-yx-fg-2">Fim:</span>
                      <span className="ml-2 text-yx-fg-2">{formatDate(run.completedAt)}</span>
                    </div>
                  </div>

                  {run.leadId && (
                    <div className="text-xs">
                      <span className="font-semibold text-yx-fg-2">Lead:</span>
                      <span className="ml-2 font-mono text-yx-fg-2">{run.leadId}</span>
                    </div>
                  )}

                  {run.lastError && (
                    <div className="rounded-md border border-yx-crit-line bg-yx-crit-soft p-2">
                      <p className="text-xs font-semibold text-yx-crit">Erro:</p>
                      <pre className="mt-1 whitespace-pre-wrap text-xs text-yx-crit">{run.lastError}</pre>
                    </div>
                  )}

                  {run.status === 'failed' && (
                    <PendingAction code="B8" size="sm">
                      <RotateCcw className="h-3 w-3" />
                      Reprocessar
                    </PendingAction>
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

function formatRunDuration(startedAt?: string, completedAt?: string) {
  if (!startedAt || !completedAt) return '—'
  const ms = new Date(completedAt).getTime() - new Date(startedAt).getTime()
  if (!Number.isFinite(ms) || ms < 0) return '—'
  if (ms < 1000) return `${ms} ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1).replace('.', ',')} s`
  return `${Math.floor(ms / 60000)} min ${Math.floor((ms % 60000) / 1000)} s`
}

/** Execuções no visual do portal: tabela a partir de 720px, cartões abaixo. */
function PortalExecutionsList({ runs, limit }: { runs: AutomationExecutionRow[]; limit?: number }) {
  const sorted = [...runs].sort((a, b) => new Date(b.startedAt ?? 0).getTime() - new Date(a.startedAt ?? 0).getTime())
  const limited = limit ? sorted.slice(0, limit) : sorted
  // Sem `limit` explícito, mostra 10 por vez (em qualquer largura).
  const pager = useShowMore(limited, { enabled: !limit })
  const rows = pager.visibleItems
  const showFlow = rows.some(run => run.flowName)

  const columns: ResponsiveTableColumn<AutomationExecutionRow>[] = [
    ...(showFlow ? [{ key: 'flow', header: 'Fluxo', render: (run: AutomationExecutionRow) => <span className="font-semibold">{run.flowName ?? '—'}</span> }] : []),
    { key: 'trigger', header: 'Gatilho', render: run => (run.eventType ? triggerLabel(run.eventType) : '—') },
    {
      key: 'status',
      header: 'Situação',
      render: run => (
        <div className="grid justify-items-start gap-1">
          <StatusChip variant={runStatusVariant[run.status]}>{runStatusLabel[run.status]}</StatusChip>
          {run.lastError ? <span className="max-w-[34ch] text-[12.5px] leading-snug text-yx-crit">{run.lastError}</span> : null}
        </div>
      ),
    },
    { key: 'startedAt', header: 'Início', render: run => <span className="whitespace-nowrap">{formatPortalDateTime(run.startedAt)}</span> },
    { key: 'duration', header: 'Duração', render: run => <span className="whitespace-nowrap">{formatRunDuration(run.startedAt, run.completedAt)}</span> },
    {
      key: 'actions',
      header: <span className="sr-only">Ações</span>,
      mobileLabel: '',
      render: run => (run.status === 'failed' ? <PendingAction code="B8" size="sm"><RotateCcw className="h-3 w-3" />Reprocessar</PendingAction> : null),
    },
  ]

  return (
    <>
    <ResponsiveTable
      caption="Execuções dos fluxos"
      columns={columns}
      rows={rows}
      getRowKey={run => run.id}
      empty={<EmptyState icon={History} title="Nenhuma execução ainda" description="Quando um fluxo ativo rodar, cada execução aparece aqui com o resultado, o horário e o motivo de qualquer falha." />}
    />
    {pager.hasMore ? <ShowMoreButton shown={pager.shown} total={pager.total} onClick={pager.showMore} /> : null}
    </>
  )
}
