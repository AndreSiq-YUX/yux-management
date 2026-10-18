import { CheckCircle2, ClipboardCheck, ExternalLink, Loader2, RotateCcw, XCircle } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { EmptyState, ErrorState, SkeletonCard, StatusChip, portalButtonClasses } from '@/components/portal-ui'
import { usePortalWorkspacePath } from '@/hooks/usePortalWorkspacePath'
import { formatPortalDateTime } from '@/lib/client-portal/portalDisplay'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/authStore'
import { workItemsService, type WorkItem } from '@/services/workItemsService'
import type { CrmTaskListItem, CrmTaskStatus } from '@/types/crm'

export type WorkQueueFilter = 'today' | 'overdue' | 'all' | 'done'

const filterOptions: Array<{ key: WorkQueueFilter; label: string }> = [
  { key: 'today', label: 'Hoje' },
  { key: 'overdue', label: 'Atrasadas' },
  { key: 'all', label: 'Todas' },
  { key: 'done', label: 'Concluídas' },
]

type QueueRow = {
  key: string
  item?: WorkItem
  task?: CrmTaskListItem
  title: string
  dueAt: string | null
}

export interface WorkItemsDailyQueueProps {
  organizationId: string
  onCompleted?: () => Promise<void> | void
  /**
   * Tarefas comerciais da empresa. Servem para mostrar o lead de cada tarefa, permitir cancelar
   * e reabrir e listar as concluídas/canceladas na mesma fila.
   */
  crmTasks?: CrmTaskListItem[]
  onCrmTaskStatusChange?: (taskId: string, status: CrmTaskStatus) => Promise<void>
  /** Mude este número para recarregar a fila (ex.: depois de criar uma tarefa). */
  reloadToken?: number
  initialFilter?: WorkQueueFilter
}

const isActive = (item: WorkItem) => !['blocked', 'awaiting_approval'].includes(item.status)

/** Filtros rápidos da fila única: "Hoje", "Atrasadas" e "Todas" (as concluídas vêm das tarefas comerciais). */
export function matchesQueueFilter(item: WorkItem, filter: Exclude<WorkQueueFilter, 'done'>, now = new Date()) {
  if (filter === 'all') return true
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  if (!item.dueAt || !isActive(item)) return false
  const due = new Date(item.dueAt)
  return filter === 'today' ? due >= start && due < end : due < start
}

function sortByDue(rows: QueueRow[]) {
  return [...rows].sort((a, b) => {
    const left = a.dueAt ? new Date(a.dueAt).getTime() : Number.POSITIVE_INFINITY
    const right = b.dueAt ? new Date(b.dueAt).getTime() : Number.POSITIVE_INFINITY
    return left - right
  })
}

export function WorkItemsDailyQueue({
  organizationId,
  onCompleted,
  crmTasks = [],
  onCrmTaskStatusChange,
  reloadToken = 0,
  initialFilter,
}: WorkItemsDailyQueueProps) {
  const currentUserId = useAuthStore(state => state.user?.id)
  const currentUserRole = useAuthStore(state => state.user?.role)
  const portalPath = usePortalWorkspacePath()
  const [searchParams] = useSearchParams()
  const selectedSourceId = searchParams.get('sourceId')
  const [items, setItems] = useState<WorkItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [evidence, setEvidence] = useState('')
  const [minutes, setMinutes] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [filter, setFilter] = useState<WorkQueueFilter | null>(initialFilter ?? null)
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await workItemsService.list({ organizationId, due: 'all' })
      setItems(result.items)
    } catch (loadError) {
      console.error('Erro ao carregar fila de tarefas:', loadError)
      setError('Não foi possível carregar a fila de tarefas. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }, [organizationId])

  useEffect(() => { void load() }, [load, reloadToken])

  const taskById = useMemo(() => new Map(crmTasks.map(task => [task.id, task])), [crmTasks])

  const activeRows = useMemo<QueueRow[]>(() => items.map(item => ({
    key: `${item.sourceType}:${item.sourceId}`,
    item,
    task: item.sourceType === 'crm_task' ? taskById.get(item.sourceId) : undefined,
    title: item.title,
    dueAt: item.dueAt,
  })), [items, taskById])

  const doneRows = useMemo<QueueRow[]>(() => crmTasks
    .filter(task => task.status !== 'pending')
    .map(task => ({ key: `done:${task.id}`, task, title: task.title, dueAt: task.dueAt })), [crmTasks])

  const counts = useMemo(() => ({
    today: activeRows.filter(row => matchesQueueFilter(row.item as WorkItem, 'today')).length,
    overdue: activeRows.filter(row => matchesQueueFilter(row.item as WorkItem, 'overdue')).length,
    all: activeRows.length,
    done: doneRows.length,
  }), [activeRows, doneRows])

  // Sem escolha do usuário, abre onde há trabalho: Hoje, depois Atrasadas, depois Todas.
  const effectiveFilter: WorkQueueFilter = filter ?? (counts.today > 0 ? 'today' : counts.overdue > 0 ? 'overdue' : 'all')

  const visibleRows = useMemo(() => {
    const base = effectiveFilter === 'done'
      ? doneRows
      : activeRows.filter(row => matchesQueueFilter(row.item as WorkItem, effectiveFilter))
    const query = search.trim().toLowerCase()
    const searched = query
      ? base.filter(row => `${row.title} ${row.task?.leadName || ''} ${row.task?.leadCompany || ''}`.toLowerCase().includes(query))
      : base
    return sortByDue(searched)
  }, [activeRows, doneRows, effectiveFilter, search])

  const startCompletion = (item: WorkItem) => {
    setEditing(item.sourceId)
    setEvidence('')
    setMinutes('')
    setActionError(null)
  }

  const complete = async (item: WorkItem) => {
    const trimmed = evidence.trim()
    const minutesSpent = Number(minutes)
    if (!trimmed) return setActionError('Descreva o que foi feito para concluir.')
    if (!Number.isInteger(minutesSpent) || minutesSpent <= 0 || minutesSpent > 1440) return setActionError('Informe o tempo gasto em minutos, entre 1 e 1440.')
    setBusy(item.sourceId)
    setActionError(null)
    try {
      await workItemsService.complete(item, { evidence: { note: trimmed }, minutesSpent })
      setEditing(null)
      await Promise.all([load(), onCompleted?.()])
      toast.success('Tarefa concluída e registrada.')
    } catch (completionError) {
      console.error('Erro ao concluir trabalho:', completionError)
      setActionError('Não foi possível concluir. A fila foi atualizada para evitar sobrescrever uma alteração recente.')
      await load()
    } finally {
      setBusy(null)
    }
  }

  const changeCrmStatus = async (taskId: string, status: CrmTaskStatus) => {
    if (!onCrmTaskStatusChange) return
    setBusy(taskId)
    setActionError(null)
    try {
      await onCrmTaskStatusChange(taskId, status)
      await load()
    } catch (statusError) {
      console.error('Erro ao atualizar tarefa:', statusError)
      setActionError('Não foi possível atualizar a tarefa.')
    } finally {
      setBusy(null)
    }
  }

  if (loading && items.length === 0 && crmTasks.length === 0) return <SkeletonCard lines={4} />
  if (error && items.length === 0) return <ErrorState title="Não foi possível carregar a fila" description={error} onRetry={() => void load()} />

  return (
    <section className="rounded-[10px] border border-yx-line bg-yx-surface text-yx-fg" aria-labelledby="task-queue-title">
      <div className="space-y-3 border-b border-yx-line px-[18px] py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="task-queue-title" className="font-display text-base font-semibold">Fila de tarefas</h2>
            <p className="mt-0.5 text-[13px] text-yx-fg-3">Tarefas comerciais, entregas de projeto e passos de missões, em uma lista só.</p>
          </div>
          <button type="button" onClick={() => void load()} disabled={loading} className={portalButtonClasses('ghost')}>
            {loading ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
            Atualizar fila
          </button>
        </div>
        <div role="group" aria-label="Filtros rápidos" className="flex gap-2 overflow-x-auto pb-1">
          {filterOptions.map(option => (
            <button
              key={option.key}
              type="button"
              aria-pressed={effectiveFilter === option.key}
              onClick={() => setFilter(option.key)}
              className={cn(
                'inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yx-blue sm:min-h-[34px]',
                effectiveFilter === option.key
                  ? 'border-yx-blue bg-yx-blue-soft text-yx-blue'
                  : 'border-yx-line-strong bg-yx-surface text-yx-fg-2 hover:border-yx-blue',
              )}
            >
              {option.label}
              <span className="font-mono text-[11.5px] opacity-80">({counts[option.key]})</span>
            </button>
          ))}
        </div>
        <div>
          <label htmlFor="task-queue-search" className="font-mono text-[11px] font-medium uppercase tracking-[0.07em] text-yx-fg-3">Buscar tarefa</label>
          <input
            id="task-queue-search"
            type="search"
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder="Tarefa, lead ou empresa"
            className="mt-1 flex h-10 w-full max-w-md rounded-lg border border-yx-line-strong bg-yx-surface px-3 text-sm text-yx-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yx-blue"
          />
        </div>
      </div>

      {error ? <p className="mx-[18px] mt-4 rounded-lg border border-yx-crit-line bg-yx-crit-soft px-3 py-2 text-sm text-yx-crit" role="alert">{error}</p> : null}
      {actionError ? <p className="mx-[18px] mt-4 rounded-lg border border-yx-crit-line bg-yx-crit-soft px-3 py-2 text-sm text-yx-crit" role="alert">{actionError}</p> : null}

      <div className="p-[18px]">
        {visibleRows.length === 0 ? (
          <QueueEmpty filter={effectiveFilter} hasSearch={Boolean(search.trim())} onShowAll={() => { setFilter('all'); setSearch('') }} />
        ) : (
          <ul className="m-0 grid list-none gap-2.5 p-0">
            {visibleRows.map(row => (
              <QueueRowItem
                key={row.key}
                row={row}
                highlighted={row.item?.sourceId === selectedSourceId}
                currentUserId={currentUserId}
                currentUserRole={currentUserRole}
                portalPath={portalPath}
                editing={editing}
                evidence={evidence}
                minutes={minutes}
                busy={busy}
                canChangeCrmStatus={Boolean(onCrmTaskStatusChange)}
                onStart={startCompletion}
                onCancelEdit={() => setEditing(null)}
                onEvidence={setEvidence}
                onMinutes={setMinutes}
                onComplete={complete}
                onCrmStatus={changeCrmStatus}
              />
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

function QueueEmpty({ filter, hasSearch, onShowAll }: { filter: WorkQueueFilter; hasSearch: boolean; onShowAll: () => void }) {
  if (hasSearch) {
    return <EmptyState icon={ClipboardCheck} title="Nenhuma tarefa encontrada" description="Nada combina com a sua busca neste filtro. Limpe a busca ou veja todas as tarefas." action={{ label: 'Ver todas', onClick: onShowAll }} />
  }
  if (filter === 'today') {
    return <EmptyState icon={ClipboardCheck} title="Nada com prazo para hoje" description="Você não tem tarefas vencendo hoje. Veja as atrasadas ou toda a fila." action={{ label: 'Ver todas', onClick: onShowAll }} />
  }
  if (filter === 'overdue') {
    return <EmptyState icon={ClipboardCheck} title="Nenhuma tarefa atrasada" description="Tudo o que tinha prazo até ontem já foi tratado." action={{ label: 'Ver todas', onClick: onShowAll }} />
  }
  if (filter === 'done') {
    return <EmptyState icon={ClipboardCheck} title="Nenhuma tarefa concluída ainda" description="Quando você concluir ou cancelar uma tarefa comercial, ela aparece aqui e pode ser reaberta." />
  }
  return <EmptyState icon={ClipboardCheck} title="Nenhuma tarefa na fila" description="Crie uma tarefa ligada a um lead para acompanhar o próximo passo da venda. Entregas de projeto e passos de missões também aparecem aqui." />
}

type RowProps = {
  row: QueueRow
  highlighted: boolean
  currentUserId?: string
  currentUserRole?: 'admin' | 'manager' | 'client'
  portalPath: (href?: string) => string
  editing: string | null
  evidence: string
  minutes: string
  busy: string | null
  canChangeCrmStatus: boolean
  onStart: (item: WorkItem) => void
  onCancelEdit: () => void
  onEvidence: (value: string) => void
  onMinutes: (value: string) => void
  onComplete: (item: WorkItem) => void
  onCrmStatus: (taskId: string, status: CrmTaskStatus) => void
}

function QueueRowItem({ row, highlighted, currentUserId, currentUserRole, portalPath, editing, evidence, minutes, busy, canChangeCrmStatus, onStart, onCancelEdit, onEvidence, onMinutes, onComplete, onCrmStatus }: RowProps) {
  const { item, task } = row
  const overdue = item ? matchesQueueFilter(item, 'overdue') : false
  const assignmentAllowed = item ? !item.assigneeId || item.assigneeId === currentUserId || currentUserRole === 'admin' : false
  const sourceAllowed = item ? item.sourceType !== 'mission_human_task' || currentUserRole === 'admin' || currentUserRole === 'manager' : false
  const canComplete = Boolean(item) && ['pending', 'in_progress'].includes(item!.status) && assignmentAllowed && sourceAllowed
  const busyId = item?.sourceId ?? task?.id ?? ''
  const isBusy = busy === busyId
  const detail = task ? [task.leadName, task.leadCompany, task.stageName].filter(Boolean).join(' · ') : ''
  const href = item
    ? sourceHref(item, task, portalPath)
    : task ? portalPath(`/portal/comercial/leads?leadId=${task.leadId}`) : undefined

  return (
    <li
      id={item ? `work-item-${item.sourceId}` : undefined}
      className={cn('rounded-lg border bg-yx-surface p-3.5', highlighted ? 'border-yx-blue ring-2 ring-yx-blue' : 'border-yx-line')}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[11px] font-medium uppercase tracking-[0.07em] text-yx-fg-3">{item ? sourceLabel(item.sourceType) : 'Comercial'}</span>
            {overdue ? <StatusChip variant="crit">Atrasada</StatusChip> : null}
            {item?.status === 'blocked' ? <StatusChip variant="warn">Bloqueada</StatusChip> : null}
            {item?.status === 'awaiting_approval' ? <StatusChip variant="neutral">Aguardando aprovação</StatusChip> : null}
            {task?.status === 'completed' ? <StatusChip variant="ok">Concluída</StatusChip> : null}
            {task?.status === 'cancelled' ? <StatusChip variant="neutral">Cancelada</StatusChip> : null}
          </div>
          <h3 className={cn('mt-1 text-sm font-semibold', task && task.status !== 'pending' ? 'text-yx-fg-3 line-through' : 'text-yx-fg')}>{row.title}</h3>
          {detail ? <p className="mt-0.5 text-[13px] text-yx-fg-2">{detail}</p> : null}
          <p className="mt-1 text-xs text-yx-fg-3">{row.dueAt ? `Prazo: ${formatPortalDateTime(row.dueAt)}` : 'Sem prazo definido'}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {href ? (
            <Link to={href} className={portalButtonClasses('ghost')}>
              <ExternalLink aria-hidden="true" />
              {task ? 'Abrir lead' : 'Abrir origem'}
            </Link>
          ) : null}
          {canComplete && item ? (
            <button type="button" onClick={() => onStart(item)} className={portalButtonClasses('primary')} aria-label={`Concluir ${row.title}`}>
              <CheckCircle2 aria-hidden="true" />
              Concluir
            </button>
          ) : null}
          {item?.sourceType === 'crm_task' && canChangeCrmStatus && ['pending', 'in_progress'].includes(item.status) ? (
            <button type="button" disabled={isBusy} onClick={() => onCrmStatus(item.sourceId, 'cancelled')} className={portalButtonClasses('ghost')} aria-label={`Cancelar ${row.title}`}>
              <XCircle aria-hidden="true" />
              Cancelar
            </button>
          ) : null}
          {!item && task && canChangeCrmStatus ? (
            <button type="button" disabled={isBusy} onClick={() => onCrmStatus(task.id, 'pending')} className={portalButtonClasses('ghost')} aria-label={`Reabrir ${row.title}`}>
              <RotateCcw aria-hidden="true" />
              Reabrir
            </button>
          ) : null}
        </div>
      </div>
      {item && editing === item.sourceId ? (
        <div className="mt-3 space-y-3 rounded-lg border border-yx-line bg-yx-surface-2 p-3">
          <label className="block text-[13px] font-semibold text-yx-fg-2">
            O que foi feito
            <textarea
              autoFocus
              value={evidence}
              onChange={event => onEvidence(event.target.value)}
              rows={3}
              className="mt-1 w-full rounded-lg border border-yx-line-strong bg-yx-surface p-2 text-sm font-normal text-yx-fg"
              placeholder="Descreva o resultado, link ou confirmação obtida"
            />
          </label>
          <label className="block text-[13px] font-semibold text-yx-fg-2">
            Tempo gasto (minutos)
            <input
              type="number"
              min={1}
              max={1440}
              step={1}
              value={minutes}
              onChange={event => onMinutes(event.target.value)}
              className="mt-1 block h-10 w-36 rounded-lg border border-yx-line-strong bg-yx-surface px-2 text-sm font-normal text-yx-fg"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy === item.sourceId} onClick={() => onComplete(item)} className={portalButtonClasses('primary')}>
              {busy === item.sourceId ? <Loader2 aria-hidden="true" className="animate-spin" /> : <CheckCircle2 aria-hidden="true" />}
              Registrar conclusão
            </button>
            <button type="button" disabled={busy === item.sourceId} onClick={onCancelEdit} className={portalButtonClasses('ghost')}>Cancelar</button>
          </div>
        </div>
      ) : null}
    </li>
  )
}

function sourceLabel(sourceType: WorkItem['sourceType']) {
  if (sourceType === 'crm_task') return 'Comercial'
  if (sourceType === 'project_task') return 'Projeto'
  return 'Missão'
}

function sourceHref(item: WorkItem, task: CrmTaskListItem | undefined, portalPath: (href?: string) => string) {
  if (item.missionId) return portalPath(`/portal/missoes/${item.missionId}`)
  if (item.sourceType === 'project_task') return portalPath(`/portal/projetos/projetos?taskId=${item.sourceId}`)
  if (task) return portalPath(`/portal/comercial/leads?leadId=${task.leadId}`)
  return portalPath(`/portal/comercial/tarefas?sourceType=${item.sourceType}&sourceId=${item.sourceId}`)
}
