import { Badge } from '@/components/ui/badge'
import { LeadDetailPanel } from '@/components/crm/LeadDetailPanel'
import { LeadAiInsightPanel } from '@/components/crm/LeadAiInsightPanel'
import { LeadConversationPanel, type LeadConversationView } from '@/components/crm/LeadConversationPanel'
import { LeadResponseComposer } from '@/components/crm/LeadResponseComposer'
import { LeadTaskPanel } from '@/components/crm/LeadTaskPanel'
import { LeadTimeline } from '@/components/crm/LeadTimeline'
import type { CrmInteraction, CrmLead, CrmTask } from '@/types/crm'
import type { CrmMessageTemplate, CrmQuickReply, LeadAiFieldSuggestion, LeadAiInsight, LeadResponseSuggestion, LeadSlaEvent } from '@/types/crmAi'
import type { CrmNextAction } from '@/types/crmCockpit'

interface Lead360PanelProps {
  lead: CrmLead
  interactions: CrmInteraction[]
  tasks: CrmTask[]
  nextActions?: CrmNextAction[]
  conversations?: LeadConversationView[]
  aiInsights?: LeadAiInsight[]
  fieldSuggestions?: LeadAiFieldSuggestion[]
  responseSuggestions?: LeadResponseSuggestion[]
  slaEvents?: LeadSlaEvent[]
  quickReplies?: CrmQuickReply[]
  templates?: CrmMessageTemplate[]
  onSendSuggestion?: (suggestionId: string) => void
  taskTitle: string
  dueAt: string
  onTaskTitleChange: (value: string) => void
  onDueAtChange: (value: string) => void
  onCreateTask: () => void
  onCompleteTask: (taskId: string) => void
  onMarkWon: () => void
  onMarkLost: () => void
}

export function Lead360Panel({
  lead,
  interactions,
  tasks,
  nextActions = [],
  conversations = [],
  aiInsights = [],
  fieldSuggestions = [],
  responseSuggestions = [],
  slaEvents = [],
  quickReplies = [],
  templates = [],
  onSendSuggestion,
  taskTitle,
  dueAt,
  onTaskTitleChange,
  onDueAtChange,
  onCreateTask,
  onCompleteTask,
  onMarkWon,
  onMarkLost,
}: Lead360PanelProps) {
  return (
    <div className="space-y-5">
      <LeadDetailPanel lead={lead} onMarkWon={onMarkWon} onMarkLost={onMarkLost} />
      <section className="grid gap-3 md:grid-cols-3">
        <Info label="Interesse" value={lead.interest || 'Nao informado'} />
        <Info label="Temperatura" value={lead.temperature || 'Nao definida'} />
        <Info label="Urgencia" value={lead.urgency || 'Nao definida'} />
      </section>
      <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <LeadConversationPanel conversations={conversations} slaEvents={slaEvents} />
        <LeadAiInsightPanel lead={lead} insights={aiInsights} fieldSuggestions={fieldSuggestions} />
      </section>
      <LeadResponseComposer lead={lead} suggestions={responseSuggestions} quickReplies={quickReplies} templates={templates} onSendSuggestion={onSendSuggestion} />
      <section className="rounded-md border bg-white p-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-medium text-gray-900">Proximas acoes</h3>
          <Badge variant="secondary">{nextActions.length}</Badge>
        </div>
        <div className="mt-3 space-y-2">
          {nextActions.map(action => (
            <div key={action.id} className="rounded-md border p-2 text-sm">
              <span className="font-medium">{action.title}</span>
              {action.dueAt && <span className="ml-2 text-xs text-gray-500">{new Date(action.dueAt).toLocaleString('pt-BR')}</span>}
            </div>
          ))}
          {nextActions.length === 0 && <p className="text-sm text-gray-500">Nenhuma proxima acao registrada.</p>}
        </div>
      </section>
      <LeadTaskPanel tasks={tasks} taskTitle={taskTitle} dueAt={dueAt} onTaskTitleChange={onTaskTitleChange} onDueAtChange={onDueAtChange} onCreateTask={onCreateTask} onCompleteTask={onCompleteTask} />
      <LeadTimeline interactions={interactions} />
    </div>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-white p-3">
      <p className="text-xs font-medium uppercase text-gray-500">{label}</p>
      <p className="mt-1 text-sm font-medium text-gray-950">{value}</p>
    </div>
  )
}
