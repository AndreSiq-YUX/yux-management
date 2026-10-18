import { Plus } from 'lucide-react'
import { useId, useState } from 'react'
import toast from 'react-hot-toast'
import { TaskEditorDialog } from '@/components/crm/tasks/TaskEditorDialog'
import { WorkItemsDailyQueue } from '@/components/work-items/WorkItemsDailyQueue'
import { PortalPage } from '@/components/client-portal/PortalPage'
import { ErrorState, SkeletonCard, portalButtonClasses } from '@/components/portal-ui'
import { usePortalCrmContext } from '@/hooks/usePortalCrmContext'
import { countItems } from '@/lib/client-portal/portalDisplay'
import { crmService } from '@/services/crmService'
import type { CrmTaskStatus } from '@/types/crm'

/** Motivo (em texto visível) pelo qual "Nova tarefa" está desabilitada; `null` quando está liberada. */
export function newTaskDisabledReason(input: {
  loading: boolean
  organizationId?: string
  pipelineCount: number
  crmInstanceId?: string
  leadCount: number
}): string | null {
  if (input.loading) return 'Carregando seus dados comerciais...'
  if (!input.organizationId) return 'Escolha uma empresa para criar tarefas.'
  if (input.pipelineCount === 0) return 'Ainda não há um funil. Configure um funil em Funis para poder criar tarefas.'
  if (!input.crmInstanceId) return 'O CRM da sua empresa ainda não foi publicado. Fale com a equipe YUX.'
  if (input.leadCount === 0) return 'Cadastre ao menos um lead para criar uma tarefa: toda tarefa fica ligada a um lead.'
  return null
}

export function PortalCommercialTasksPage() {
  const { organization, loading, error, tasks, leads, pipelines, reload } = usePortalCrmContext()
  const [editorOpen, setEditorOpen] = useState(false)
  const [queueVersion, setQueueVersion] = useState(0)
  const reasonId = useId()

  const pendingTasks = tasks.filter(task => task.status === 'pending')
  const overdueTasks = pendingTasks.filter(task => new Date(task.dueAt).getTime() < Date.now())
  const crmInstanceId = pipelines.find(pipeline => pipeline.crmInstanceId)?.crmInstanceId
  const disabledReason = newTaskDisabledReason({
    loading,
    organizationId: organization?.id,
    pipelineCount: pipelines.length,
    crmInstanceId,
    leadCount: leads.length,
  })

  const updateStatus = async (taskId: string, status: CrmTaskStatus) => {
    try {
      await crmService.patchTask(taskId, { status })
      await reload()
      toast.success(status === 'completed' ? 'Tarefa concluída.' : status === 'cancelled' ? 'Tarefa cancelada.' : 'Tarefa reaberta.')
    } catch (updateError) {
      console.error('Erro ao atualizar tarefa:', updateError)
      toast.error('Não foi possível atualizar a tarefa.')
      throw updateError
    }
  }

  return (
    <PortalPage
      eyebrow="Comercial"
      title="Tarefas e follow-ups"
      description="Veja o que você precisa fazer hoje, o que está atrasado e todo o resto da fila, em uma lista só."
      help={[
        'Use os filtros Hoje, Atrasadas e Todas para escolher o que ver primeiro.',
        'Crie tarefas ligadas a um lead e acompanhe o prazo de cada uma.',
        'Conclua uma tarefa descrevendo o que foi feito; cancele ou reabra tarefas comerciais quando precisar.',
        'Entregas de projeto e passos de missões atribuídos a você aparecem na mesma fila.',
      ]}
      primaryAction={
        <div className="flex flex-col items-start gap-1.5 md:items-end">
          <button
            type="button"
            onClick={() => setEditorOpen(true)}
            disabled={Boolean(disabledReason)}
            aria-describedby={disabledReason ? reasonId : undefined}
            className={portalButtonClasses('primary')}
          >
            <Plus aria-hidden="true" />
            Nova tarefa
          </button>
          {disabledReason ? <p id={reasonId} className="max-w-xs text-xs leading-snug text-yx-fg-3 md:text-right">{disabledReason}</p> : null}
        </div>
      }
      metrics={[
        { label: 'Pendentes', value: String(pendingTasks.length), detail: 'Tarefas comerciais em aberto.' },
        { label: 'Atrasadas', value: String(overdueTasks.length), detail: 'Passaram do prazo.' },
        { label: 'Concluídas', value: String(countItems(tasks, task => task.status === 'completed')), detail: 'Já feitas.' },
      ]}
      related={[
        { label: 'Leads', href: '/portal/comercial/leads' },
        { label: 'Funis', href: '/portal/comercial/funis' },
        { label: 'Empresas e contas', href: '/portal/comercial/contas' },
      ]}
    >
      {loading && !organization?.id ? <SkeletonCard lines={4} /> : null}
      {error ? <ErrorState title="Não foi possível carregar as tarefas comerciais" description={error} onRetry={() => void reload()} /> : null}
      {organization?.id ? (
        <WorkItemsDailyQueue
          organizationId={organization.id}
          crmTasks={tasks}
          onCrmTaskStatusChange={updateStatus}
          onCompleted={reload}
          reloadToken={queueVersion}
        />
      ) : null}
      <TaskEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        leads={leads}
        onCreate={async input => {
          if (!organization?.id) throw new Error('organization_required')
          await crmService.createLeadTask({ organizationId: organization.id, ...input })
          await reload()
          setQueueVersion(current => current + 1)
          toast.success('Tarefa criada.')
        }}
      />
    </PortalPage>
  )
}
