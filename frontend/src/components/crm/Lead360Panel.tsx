import { CalendarDays, CheckSquare, FileText, Mail, MessageCircle, Phone, StickyNote, Trophy, XCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { LeadDetailPanel } from '@/components/crm/LeadDetailPanel'
import { LeadAiInsightPanel } from '@/components/crm/LeadAiInsightPanel'
import { LeadConversationPanel, type LeadConversationView } from '@/components/crm/LeadConversationPanel'
import { LeadResponseComposer } from '@/components/crm/LeadResponseComposer'
import { LeadTaskPanel } from '@/components/crm/LeadTaskPanel'
import { Record360Layout } from '@/components/growth-workspace/Record360Layout'
import { RecordAssociationsPanel } from '@/components/growth-workspace/RecordAssociationsPanel'
import { RecordIdentityPanel } from '@/components/growth-workspace/RecordIdentityPanel'
import { RecordIntelligencePanel } from '@/components/growth-workspace/RecordIntelligencePanel'
import { RecordQuickActions } from '@/components/growth-workspace/RecordQuickActions'
import { RecordTabs } from '@/components/growth-workspace/RecordTabs'
import { UnifiedActivityTimeline } from '@/components/growth-workspace/UnifiedActivityTimeline'
import { buildUnifiedActivities } from '@/lib/growth-workspace/activityRules'
import { buildRecord360Tabs, pickNextBestAction, summarizeAssociations, summarizeMissingRecordData } from '@/lib/growth-workspace/record360Rules'
import type { CrmInteraction, CrmLead, CrmTask } from '@/types/crm'
import type { CrmMessageTemplate, CrmQuickReply, LeadAiFieldSuggestion, LeadAiInsight, LeadResponseSuggestion, LeadSlaEvent } from '@/types/crmAi'
import type { CrmNextAction } from '@/types/crmCockpit'
import type { Record360Input, UnifiedActivity } from '@/types/growthWorkspace'

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
  const latestInsight = aiInsights[0]
  const recordInput = buildLeadRecord360Input({
    lead,
    interactions,
    tasks,
    nextActions,
    conversations,
    aiInsights,
  })
  const tabs = buildRecord360Tabs(recordInput)
  const missingData = summarizeMissingRecordData(recordInput)
  const nextBestAction = pickNextBestAction(recordInput)
  const associations = summarizeAssociations(recordInput)
  const unifiedActivities = buildUnifiedActivities({
    interactions,
    tasks,
    conversations: conversations.map(link => ({
      id: link.conversationId,
      status: link.conversation?.status || link.status,
      channel: link.channel,
      summary: link.conversation?.summary || link.conversation?.subject,
      lastMessageAt: link.conversation?.last_message_at || link.conversation?.lastMessageAt || link.linkedAt || link.updatedAt,
    })),
    aiInsights,
    nextActions,
    currentDate: new Date(),
  })

  return (
    <Record360Layout
      identity={(
        <RecordIdentityPanel
          lead={lead}
          actions={[
            { key: 'note', label: 'Nota', icon: <StickyNote className="h-4 w-4" /> },
            { key: 'whatsapp', label: 'WhatsApp', icon: <MessageCircle className="h-4 w-4" /> },
            { key: 'email', label: 'E-mail', icon: <Mail className="h-4 w-4" /> },
            { key: 'call', label: 'Chamada', icon: <Phone className="h-4 w-4" /> },
            { key: 'task', label: 'Tarefa', icon: <CheckSquare className="h-4 w-4" /> },
            { key: 'meeting', label: 'Reuniao', icon: <CalendarDays className="h-4 w-4" /> },
          ]}
        />
      )}
      tabs={(
        <RecordTabs
          tabs={tabs.map(tab => ({
            key: tab.key,
            label: tab.label,
            disabled: !tab.isAvailable,
            content: renderTabContent(tab.key, {
              lead,
              interactions,
              tasks,
              nextActions,
              conversations,
              aiInsights,
              fieldSuggestions,
              responseSuggestions,
              slaEvents,
              quickReplies,
              templates,
              onSendSuggestion,
              taskTitle,
              dueAt,
              onTaskTitleChange,
              onDueAtChange,
              onCreateTask,
              onCompleteTask,
              onMarkWon,
              onMarkLost,
              missingData: missingData.map(item => item.label),
              nextBestAction,
              latestInsight,
              unifiedActivities,
            }),
          }))}
        />
      )}
      associations={(
        <RecordAssociationsPanel
          associations={associations.map(item => ({
            key: item.kind,
            label: item.label,
            count: item.count,
            description: associationDescription(item.kind, lead),
          }))}
        />
      )}
    />
  )
}

type Lead360TabContext = Lead360PanelProps & {
  missingData: string[]
  nextBestAction: ReturnType<typeof pickNextBestAction>
  latestInsight?: LeadAiInsight
  unifiedActivities: UnifiedActivity[]
}

function renderTabContent(key: string, context: Lead360TabContext) {
  if (key === 'summary') {
    return (
      <div className="space-y-4">
        <LeadDetailPanel lead={context.lead} onMarkWon={context.onMarkWon} onMarkLost={context.onMarkLost} />
        <section className="grid gap-3 md:grid-cols-3">
          <Info label="Interesse" value={context.lead.interest || 'Nao informado'} />
          <Info label="Temperatura" value={context.lead.temperature || 'Nao definida'} />
          <Info label="Urgencia" value={context.lead.urgency || 'Nao definida'} />
        </section>
        <section className="rounded-md border bg-white p-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-medium text-gray-900">Proxima melhor acao</h3>
            <Badge variant="secondary">P{context.nextBestAction.priority}</Badge>
          </div>
          <p className="mt-2 text-sm font-medium text-slate-950">{context.nextBestAction.label}</p>
          <p className="mt-1 text-sm text-slate-600">{context.nextBestAction.description}</p>
        </section>
        <RecordQuickActions
          actions={[
            { key: 'note', label: 'Registrar nota', icon: <StickyNote className="mr-2 h-4 w-4" /> },
            { key: 'whatsapp', label: 'Abrir WhatsApp', icon: <MessageCircle className="mr-2 h-4 w-4" /> },
            { key: 'task', label: 'Criar tarefa', icon: <CheckSquare className="mr-2 h-4 w-4" />, onClick: context.onCreateTask },
            { key: 'proposal', label: 'Proposta', icon: <FileText className="mr-2 h-4 w-4" /> },
            { key: 'won', label: 'Marcar ganho', icon: <Trophy className="mr-2 h-4 w-4" />, onClick: context.onMarkWon },
            { key: 'lost', label: 'Marcar perdido', icon: <XCircle className="mr-2 h-4 w-4" />, onClick: context.onMarkLost },
          ]}
        />
      </div>
    )
  }

  if (key === 'about') {
    return (
      <div className="space-y-4">
        <LeadDetailPanel lead={context.lead} onMarkWon={context.onMarkWon} onMarkLost={context.onMarkLost} />
        <section className="grid gap-3 md:grid-cols-2">
          <Info label="Cidade" value={context.lead.city || 'Nao informada'} />
          <Info label="Estado" value={context.lead.state || 'Nao informado'} />
          <Info label="Segmento" value={context.lead.segment || 'Nao informado'} />
          <Info label="LGPD / Opt-in" value={context.lead.consentLgpd || context.lead.whatsappOptIn || context.lead.emailOptIn ? 'Consentimento registrado' : 'Nao informado'} />
        </section>
      </div>
    )
  }

  if (key === 'activities') {
    return (
      <div className="space-y-4">
        <UnifiedActivityTimeline activities={context.unifiedActivities} />
        <LeadTaskPanel tasks={context.tasks} taskTitle={context.taskTitle} dueAt={context.dueAt} onTaskTitleChange={context.onTaskTitleChange} onDueAtChange={context.onDueAtChange} onCreateTask={context.onCreateTask} onCompleteTask={context.onCompleteTask} />
      </div>
    )
  }

  if (key === 'conversations') {
    return (
      <div className="space-y-4">
        <LeadConversationPanel conversations={context.conversations || []} slaEvents={context.slaEvents || []} />
        <LeadResponseComposer lead={context.lead} suggestions={context.responseSuggestions || []} quickReplies={context.quickReplies || []} templates={context.templates || []} onSendSuggestion={context.onSendSuggestion} />
      </div>
    )
  }

  if (key === 'proposals_revenue') {
    return (
      <section className="rounded-md border bg-white p-4">
        <h3 className="font-medium text-slate-950">Propostas & Receita</h3>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <Info label="Valor estimado" value={context.lead.value !== undefined ? context.lead.value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : 'Nao informado'} />
          <Info label="Status" value={context.lead.status || 'Aberto'} />
          <Info label="Fechamento" value={context.lead.wonAt || context.lead.lostAt ? new Date(context.lead.wonAt || context.lead.lostAt || '').toLocaleString('pt-BR') : 'Sem fechamento'} />
        </div>
        <p className="mt-3 text-sm text-slate-500">O contexto completo de propostas continua disponivel na aba Comercial do CRM.</p>
      </section>
    )
  }

  return (
    <div className="space-y-4">
      <RecordIntelligencePanel
        summary={context.latestInsight?.summary || context.lead.aiSummary}
        sentiment={context.latestInsight?.sentiment || context.lead.sentiment}
        risk={[...(context.latestInsight?.risks || []), ...(context.lead.objections || [])][0]}
        nextBestAction={context.latestInsight?.nextBestAction || context.nextBestAction.label}
        missingData={context.missingData}
        sources={buildIntelligenceSources(context)}
      />
      <LeadAiInsightPanel lead={context.lead} insights={context.aiInsights || []} fieldSuggestions={context.fieldSuggestions || []} />
    </div>
  )
}

function buildLeadRecord360Input({
  lead,
  interactions,
  tasks,
  nextActions,
  conversations,
  aiInsights,
}: Pick<Lead360PanelProps, 'lead' | 'interactions' | 'tasks' | 'nextActions' | 'conversations' | 'aiInsights'>): Record360Input {
  return {
    type: 'lead',
    recordId: lead.id,
    name: lead.name,
    email: lead.email,
    phone: lead.phone || lead.whatsappPhone,
    ownerId: lead.ownerMemberId || lead.ownerId,
    assignedTo: lead.assignedTo,
    company: lead.company,
    source: lead.source,
    nextActionAt: lead.nextFollowUpAt,
    nextActionLabel: nextActions?.[0]?.title,
    tasks: tasks.map(task => ({ id: task.id, title: task.title, dueAt: task.dueAt, status: task.status })),
    pendingTaskCount: tasks.filter(task => task.status === 'pending').length,
    conversationCount: conversations?.length || 0,
    hasConversationModule: true,
    unansweredConversationCount: conversations?.filter(conversation => conversation.status === 'suggested' || conversation.status === 'linked').length || 0,
    proposalCount: lead.value ? 1 : 0,
    revenueValue: lead.value,
    hasRevenueModule: true,
    aiSummary: aiInsights?.[0]?.summary || lead.aiSummary,
    aiInsightCount: aiInsights?.length || 0,
    hasAiModule: true,
    aiSuggestedAction: aiInsights?.[0]?.nextBestAction,
    associationCounts: {
      company: lead.company ? 1 : 0,
      contacts: lead.email || lead.phone || lead.whatsappPhone ? 1 : 0,
      opportunities: lead.value ? 1 : 0,
      campaigns: lead.attributionContext?.campaignId ? 1 : 0,
      automations: nextActions?.length || 0,
    },
    documentCount: interactions.length,
  }
}

function associationDescription(kind: string, lead: CrmLead) {
  if (kind === 'company') return lead.company || 'Sem empresa vinculada'
  if (kind === 'contacts') return lead.email || lead.phone || 'Contato principal'
  if (kind === 'campaigns') return lead.attributionContext?.campaignId ? 'Campanha atribuida' : 'Sem campanha atribuida'
  if (kind === 'opportunities') return lead.value ? 'Valor comercial estimado' : 'Sem oportunidade criada'
  return undefined
}

function buildIntelligenceSources(context: Lead360TabContext) {
  const sources = ['CRM']
  if ((context.conversations || []).length > 0) sources.push('Conversas')
  if (context.interactions.length > 0) sources.push('Atividades')
  if (context.lead.attributionContext?.campaignId) sources.push('Campanha')
  return sources
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-white p-3">
      <p className="text-xs font-medium uppercase text-gray-500">{label}</p>
      <p className="mt-1 text-sm font-medium text-gray-950">{value}</p>
    </div>
  )
}
