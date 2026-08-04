import { CheckCircle2, RotateCcw, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatPortalDateTime } from '@/lib/client-portal/portalDisplay'
import type { CrmTaskListItem, CrmTaskStatus } from '@/types/crm'

interface TaskListProps {
  tasks: CrmTaskListItem[]
  onStatusChange: (taskId: string, status: CrmTaskStatus) => Promise<void>
}

export function TaskList({ tasks, onStatusChange }: TaskListProps) {
  if (!tasks.length) return <p className="rounded-md border border-dashed p-6 text-sm text-gray-600">Nenhuma tarefa encontrada para os filtros atuais.</p>
  return <div className="space-y-2">{tasks.map(task => (
    <article key={task.id} className="flex flex-col gap-3 rounded-md border bg-white p-3 md:flex-row md:items-center md:justify-between">
      <div className="min-w-0"><p className={`text-sm font-medium ${task.status === 'completed' ? 'text-gray-500 line-through' : 'text-gray-900'}`}>{task.title}</p><p className="mt-1 text-xs text-gray-600">{task.leadName}{task.leadCompany ? ` · ${task.leadCompany}` : ''}{task.stageName ? ` · ${task.stageName}` : ''}</p><p className="mt-1 text-xs text-gray-500">{formatPortalDateTime(task.dueAt)} · {task.priority || 'medium'}{task.assignedToName ? ` · ${task.assignedToName}` : ''}</p></div>
      <div className="flex shrink-0 gap-2">{task.status === 'pending' && <><Button size="sm" variant="outline" onClick={() => void onStatusChange(task.id, 'completed')} aria-label={`Concluir ${task.title}`}><CheckCircle2 className="mr-1 h-3.5 w-3.5" />Concluir</Button><Button size="sm" variant="outline" onClick={() => void onStatusChange(task.id, 'cancelled')} aria-label={`Cancelar ${task.title}`}><XCircle className="mr-1 h-3.5 w-3.5" />Cancelar</Button></>}{task.status !== 'pending' && <Button size="sm" variant="outline" onClick={() => void onStatusChange(task.id, 'pending')} aria-label={`Reabrir ${task.title}`}><RotateCcw className="mr-1 h-3.5 w-3.5" />Reabrir</Button>}</div>
    </article>
  ))}</div>
}
