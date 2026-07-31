import { CheckCircle2, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { CrmTask } from '@/types/crm'

interface LeadTaskPanelProps {
  tasks: CrmTask[]
  taskTitle: string
  dueAt: string
  onTaskTitleChange: (value: string) => void
  onDueAtChange: (value: string) => void
  onCreateTask: () => void
  onCompleteTask: (taskId: string) => void
}

export function LeadTaskPanel({
  tasks,
  taskTitle,
  dueAt,
  onTaskTitleChange,
  onDueAtChange,
  onCreateTask,
  onCompleteTask,
}: LeadTaskPanelProps) {
  return (
    <div className="space-y-3">
      <div className="grid gap-2 md:grid-cols-[1fr_220px_auto]">
        <Input placeholder="Proxima acao" value={taskTitle} onChange={event => onTaskTitleChange(event.target.value)} />
        <Input type="datetime-local" value={dueAt} onChange={event => onDueAtChange(event.target.value)} />
        <Button title="Criar tarefa comercial" onClick={onCreateTask}>
          <Plus className="mr-1 h-4 w-4" />
          Criar
        </Button>
      </div>
      {tasks.length === 0 && <p className="text-sm text-slate-500">Nenhuma tarefa aberta para este lead.</p>}
      {tasks.map(item => (
        <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3 text-sm">
          <div>
            <p className="font-medium text-slate-950">{item.title}</p>
            <p className="text-xs text-slate-500">{new Date(item.dueAt).toLocaleString('pt-BR')}</p>
          </div>
          {item.status === 'pending' && (
            <Button size="sm" variant="outline" title="Concluir tarefa" onClick={() => onCompleteTask(item.id)}>
              <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
              Concluir
            </Button>
          )}
        </div>
      ))}
    </div>
  )
}
