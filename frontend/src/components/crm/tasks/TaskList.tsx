import { AlertCircle, CheckCircle2, ClipboardCheck, RotateCcw, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatPortalDateTime } from '@/lib/client-portal/portalDisplay'
import type { CrmTaskListItem, CrmTaskStatus } from '@/types/crm'

interface TaskListProps {
  tasks: CrmTaskListItem[]
  busyTaskId?: string | null
  onStatusChange: (taskId: string, status: CrmTaskStatus) => Promise<void>
}

const priorityLabel: Record<string, string> = { urgent: 'Urgente', high: 'Alta', medium: 'Média', low: 'Baixa' }

export function TaskList({ tasks, busyTaskId = null, onStatusChange }: TaskListProps) {
  if (!tasks.length) return <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center"><ClipboardCheck className="mx-auto h-7 w-7 text-slate-400" aria-hidden="true" /><p className="mt-3 text-sm font-semibold text-slate-800">Nenhuma tarefa encontrada</p><p className="mt-1 text-sm text-slate-500">Ajuste os filtros ou crie o próximo follow-up de um lead.</p></div>
  return <div className="space-y-3">{tasks.map(task => {
    const isBusy = busyTaskId === task.id
    const isOverdue = task.status === 'pending' && new Date(task.dueAt).getTime() < Date.now()
    return (
    <article key={task.id} className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-yux-300 md:flex-row md:items-center md:justify-between">
      <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className={`text-sm font-semibold ${task.status === 'completed' ? 'text-slate-500 line-through' : 'text-slate-950'}`}>{task.title}</p>{isOverdue && <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-1 text-xs font-medium text-red-700"><AlertCircle className="h-3 w-3" aria-hidden="true" />Atrasada</span>}</div><p className="mt-1 text-sm text-slate-600">{task.leadName}{task.leadCompany ? ` · ${task.leadCompany}` : ''}{task.stageName ? ` · ${task.stageName}` : ''}</p><p className="mt-2 text-xs text-slate-500">{formatPortalDateTime(task.dueAt)} · {priorityLabel[task.priority || 'medium'] || 'Média'}{task.assignedToName ? ` · ${task.assignedToName}` : ''}</p></div>
      <div className="flex shrink-0 flex-wrap gap-2">{task.status === 'pending' && <><Button size="sm" variant="outline" disabled={isBusy} onClick={() => void onStatusChange(task.id, 'completed')} aria-label={`Concluir ${task.title}`}><CheckCircle2 className="mr-1 h-3.5 w-3.5" />Concluir</Button><Button size="sm" variant="outline" disabled={isBusy} onClick={() => void onStatusChange(task.id, 'cancelled')} aria-label={`Cancelar ${task.title}`}><XCircle className="mr-1 h-3.5 w-3.5" />Cancelar</Button></>}{task.status !== 'pending' && <Button size="sm" variant="outline" disabled={isBusy} onClick={() => void onStatusChange(task.id, 'pending')} aria-label={`Reabrir ${task.title}`}><RotateCcw className="mr-1 h-3.5 w-3.5" />Reabrir</Button>}</div>
    </article>
  )})}</div>
}
