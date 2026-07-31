import { CheckCircle2 } from 'lucide-react'
import { PortalJourneyPage } from '@/components/client-portal/PortalJourneyPage'
import { usePortalCrmContext } from '@/hooks/usePortalCrmContext'
import { countItems, formatPortalDateTime, statusLabel } from '@/lib/client-portal/portalDisplay'

export function PortalCommercialTasksPage() {
  const { loading, error, tasks, leads } = usePortalCrmContext()
  const now = Date.now()
  const pendingTasks = tasks.filter(task => task.status === 'pending')
  const overdueTasks = pendingTasks.filter(task => new Date(task.dueAt).getTime() < now)
  const tasksByLead = new Map(leads.map(lead => [lead.id, lead]))

  return (
    <PortalJourneyPage
      eyebrow="Comercial"
      title="Tarefas e Follow-ups"
      description="Centraliza proximas acoes comerciais por lead, empresa, responsavel e prazo."
      icon={CheckCircle2}
      metrics={[
        { label: 'Pendentes', value: String(pendingTasks.length), detail: 'Follow-ups e tarefas comerciais.' },
        { label: 'Atrasadas', value: String(overdueTasks.length), detail: 'Atividades que precisam de atencao.' },
        { label: 'Concluidas', value: String(countItems(tasks, task => task.status === 'completed')), detail: 'Historico carregado dos leads.' },
      ]}
      capabilities={[
        'Ver tarefas comerciais atrasadas, pendentes e concluidas.',
        'Agrupar atividades por responsavel, lead, empresa ou etapa do funil.',
        'Criar, concluir e reagendar tarefas de follow-up.',
        'Preparar alertas automaticos e rotinas comerciais nas proximas fases.',
      ]}
      primaryAction={{ label: 'Abrir Leads', href: '/portal/comercial/leads' }}
      secondaryActions={[
        { label: 'Funis', href: '/portal/comercial/funis' },
        { label: 'Empresas / Contas', href: '/portal/comercial/contas' },
      ]}
    >
      <section className="rounded-lg border bg-white p-5">
        <h2 className="text-base font-semibold text-gray-900">Fila comercial</h2>
        {loading ? (
          <p className="mt-3 text-sm text-gray-600">Carregando tarefas comerciais...</p>
        ) : error ? (
          <p className="mt-3 text-sm text-red-600">{error}</p>
        ) : (
          <div className="mt-4 space-y-3">
            {pendingTasks.slice(0, 10).map(task => {
              const lead = tasksByLead.get(task.leadId)
              return (
                <article key={task.id} className="grid gap-2 rounded-md border bg-gray-50 p-3 md:grid-cols-[1fr_auto]">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{task.title}</p>
                    <p className="mt-1 text-xs text-gray-500">
                      {lead?.name || 'Lead nao identificado'}{lead?.company ? ` - ${lead.company}` : ''}
                    </p>
                  </div>
                  <div className="text-left md:text-right">
                    <p className="text-xs font-medium text-gray-700">{formatPortalDateTime(task.dueAt)}</p>
                    <p className="mt-1 text-xs text-gray-500">{statusLabel(task.priority || task.status)}</p>
                  </div>
                </article>
              )
            })}
            {!pendingTasks.length && (
              <p className="text-sm text-gray-600">Nenhuma tarefa comercial pendente encontrada.</p>
            )}
          </div>
        )}
      </section>
    </PortalJourneyPage>
  )
}
