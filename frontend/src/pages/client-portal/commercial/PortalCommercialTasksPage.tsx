import { CheckCircle2, Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/button'
import { TaskEditorDialog } from '@/components/crm/tasks/TaskEditorDialog'
import { TaskFilters } from '@/components/crm/tasks/TaskFilters'
import { TaskList } from '@/components/crm/tasks/TaskList'
import { PortalJourneyPage } from '@/components/client-portal/PortalJourneyPage'
import { usePortalCrmContext } from '@/hooks/usePortalCrmContext'
import { countItems } from '@/lib/client-portal/portalDisplay'
import { crmService } from '@/services/crmService'
import type { CrmTaskFilters, CrmTaskStatus } from '@/types/crm'

type LocalFilters = Pick<CrmTaskFilters, 'status' | 'priority' | 'assignedTo' | 'due' | 'search'>

function matchesDue(dueAt: string, due: LocalFilters['due']) {
  if (!due) return true
  const date = new Date(dueAt)
  const now = new Date()
  if (due === 'overdue') return date.getTime() < now.getTime()
  if (due === 'today') return date.toDateString() === now.toDateString()
  return date.getTime() >= new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime()
}

export function PortalCommercialTasksPage() {
  const { organization, loading, error, tasks, leads, pipelines, reload } = usePortalCrmContext()
  const [filters, setFilters] = useState<LocalFilters>({})
  const [editorOpen, setEditorOpen] = useState(false)
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null)

  const filteredTasks = useMemo(() => tasks.filter(task => {
    if (filters.status && task.status !== filters.status) return false
    if (filters.priority && task.priority !== filters.priority) return false
    if (filters.due && !matchesDue(task.dueAt, filters.due)) return false
    const query = filters.search?.trim().toLowerCase()
    if (query && !`${task.title} ${task.leadName} ${task.leadCompany || ''}`.toLowerCase().includes(query)) return false
    return true
  }), [filters, tasks])

  const pendingTasks = tasks.filter(task => task.status === 'pending')
  const overdueTasks = pendingTasks.filter(task => new Date(task.dueAt).getTime() < Date.now())
  const crmInstanceId = pipelines.find(pipeline => pipeline.crmInstanceId)?.crmInstanceId

  const updateStatus = async (taskId: string, status: CrmTaskStatus) => {
    setBusyTaskId(taskId)
    try {
      await crmService.patchTask(taskId, { status })
      await reload()
      toast.success(status === 'completed' ? 'Tarefa concluída.' : status === 'cancelled' ? 'Tarefa cancelada.' : 'Tarefa reaberta.')
    } catch (updateError) {
      console.error('Erro ao atualizar tarefa:', updateError)
      toast.error('Não foi possível atualizar a tarefa.')
    } finally { setBusyTaskId(null) }
  }

  return (
    <PortalJourneyPage
      eyebrow="Comercial"
      title="Tarefas e Follow-ups"
      description="Centralize as próximas ações comerciais por lead, responsável e prazo."
      icon={CheckCircle2}
      metrics={[
        { label: 'Pendentes', value: String(pendingTasks.length), detail: 'Follow-ups e tarefas comerciais.' },
        { label: 'Atrasadas', value: String(overdueTasks.length), detail: 'Atividades que precisam de atenção.' },
        { label: 'Concluídas', value: String(countItems(tasks, task => task.status === 'completed')), detail: 'Histórico operacional.' },
      ]}
      capabilities={[
        'Criar tarefas ligadas a leads e organizar a fila por prazo.',
        'Filtrar por status, prioridade, prazo e texto de busca.',
        'Concluir, cancelar e reabrir tarefas mantendo a jornada do lead.',
        'Atualizar automaticamente a próxima ação do lead no CRM.',
      ]}
      primaryAction={{ label: 'Abrir Leads', href: '/portal/comercial/leads' }}
      secondaryActions={[{ label: 'Funis', href: '/portal/comercial/funis' }, { label: 'Empresas / Contas', href: '/portal/comercial/contas' }]}
    >
      <section className="rounded-lg border bg-white p-5" aria-labelledby="task-center-title">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h2 id="task-center-title" className="text-base font-semibold text-gray-900">Central de tarefas</h2><p className="mt-1 text-sm text-gray-600">Acompanhe a fila operacional e mantenha o próximo passo do lead atualizado.</p></div>
          <Button type="button" onClick={() => setEditorOpen(true)} disabled={!organization?.id || !crmInstanceId}><Plus className="mr-2 h-4 w-4" />Nova tarefa</Button>
        </div>
        <div className="mt-4"><TaskFilters value={filters} onChange={setFilters} onReset={() => setFilters({})} /></div>
        {loading ? <p className="mt-4 text-sm text-gray-600" role="status">Carregando tarefas comerciais...</p> : error ? <p className="mt-4 text-sm text-red-600" role="alert">{error}</p> : <div className="mt-4"><TaskList tasks={filteredTasks} onStatusChange={updateStatus} /></div>}
        {busyTaskId && <p className="mt-2 text-xs text-gray-500" role="status">Atualizando tarefa...</p>}
      </section>
      <TaskEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        leads={leads}
        onCreate={async input => {
          if (!organization?.id) throw new Error('organization_required')
          await crmService.createLeadTask({ organizationId: organization.id, ...input })
          await reload()
          toast.success('Tarefa criada.')
        }}
      />
    </PortalJourneyPage>
  )
}
