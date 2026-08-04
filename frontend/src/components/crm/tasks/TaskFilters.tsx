import { RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { CrmTaskFilters, CrmTaskPriority, CrmTaskStatus } from '@/types/crm'

type FilterValues = Pick<CrmTaskFilters, 'status' | 'priority' | 'assignedTo' | 'due' | 'search'>

interface TaskFiltersProps {
  value: FilterValues
  onChange: (next: FilterValues) => void
  onReset: () => void
}

export function TaskFilters({ value, onChange, onReset }: TaskFiltersProps) {
  const update = <Key extends keyof FilterValues>(key: Key, next: FilterValues[Key]) => onChange({ ...value, [key]: next })
  return (
    <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50/80 p-4 md:grid-cols-[minmax(0,1fr)_auto_auto_auto_auto] md:items-end">
      <div>
        <label htmlFor="task-search" className="text-xs font-semibold uppercase tracking-wide text-slate-500">Buscar</label>
        <Input className="mt-1 h-11 bg-white" id="task-search" value={value.search || ''} placeholder="Tarefa, lead ou empresa" onChange={event => update('search', event.target.value || undefined)} />
      </div>
      <div>
        <label htmlFor="task-due" className="text-xs font-semibold uppercase tracking-wide text-slate-500">Prazo</label>
        <select id="task-due" className="mt-1 flex h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm" value={value.due || ''} onChange={event => update('due', (event.target.value || undefined) as FilterValues['due'])}>
          <option value="">Todos</option><option value="overdue">Atrasadas</option><option value="today">Hoje</option><option value="upcoming">Próximas</option>
        </select>
      </div>
      <div>
        <label htmlFor="task-status" className="text-xs font-semibold uppercase tracking-wide text-slate-500">Status</label>
        <select id="task-status" className="mt-1 flex h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm" value={value.status || ''} onChange={event => update('status', (event.target.value || undefined) as CrmTaskStatus | undefined)}>
          <option value="">Todos</option><option value="pending">Pendentes</option><option value="completed">Concluídas</option><option value="cancelled">Canceladas</option>
        </select>
      </div>
      <div>
        <label htmlFor="task-priority" className="text-xs font-semibold uppercase tracking-wide text-slate-500">Prioridade</label>
        <select id="task-priority" className="mt-1 flex h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm" value={value.priority || ''} onChange={event => update('priority', (event.target.value || undefined) as CrmTaskPriority | undefined)}>
          <option value="">Todas</option><option value="urgent">Urgente</option><option value="high">Alta</option><option value="medium">Média</option><option value="low">Baixa</option>
        </select>
      </div>
      <Button type="button" variant="outline" onClick={onReset}><RotateCcw className="mr-2 h-4 w-4" />Limpar</Button>
    </div>
  )
}
