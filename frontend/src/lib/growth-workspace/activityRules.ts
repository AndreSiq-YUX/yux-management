import type { CrmInteraction, CrmTask } from '@/types/crm'
import type {
  BuildUnifiedActivitiesInput,
  UnifiedActivity,
  UnifiedActivityGroup,
  UnifiedActivityKind,
  UnifiedActivityStatus,
} from '@/types/growthWorkspace'

const interactionKindByType: Record<CrmInteraction['type'], UnifiedActivityKind> = {
  call: 'call',
  email: 'email',
  meeting: 'meeting',
  note: 'note',
}

export function buildUnifiedActivities(input: BuildUnifiedActivitiesInput): UnifiedActivity[] {
  const now = normalizeDate(input.currentDate) || new Date()
  const activities: UnifiedActivity[] = [
    ...(input.tasks || []).map(task => mapTask(task, now)),
    ...(input.interactions || []).map(mapInteraction),
    ...(input.conversations || []).map(mapConversation),
    ...(input.aiInsights || []).map(mapAiInsight),
    ...(input.nextActions || [])
      .filter(action => !action.taskId)
      .map(action => mapNextAction(action, now)),
  ]

  return activities.sort(sortUnifiedActivity)
}

export function summarizeActivityGroups(activities: UnifiedActivity[]) {
  return activities.reduce(
    (summary, activity) => {
      summary[activity.group] += 1
      return summary
    },
    { overdue: 0, future: 0, recent: 0 } satisfies Record<UnifiedActivityGroup, number>
  )
}

function mapTask(task: CrmTask, now: Date): UnifiedActivity {
  const dueDate = normalizeDate(task.dueAt)
  const isPending = task.status === 'pending'
  const group: UnifiedActivityGroup = isPending && dueDate && dueDate.getTime() < now.getTime()
    ? 'overdue'
    : isPending
      ? 'future'
      : 'recent'

  return {
    id: `task:${task.id}`,
    kind: 'task',
    title: task.title,
    description: task.description,
    dueAt: task.dueAt,
    occurredAt: task.completedAt || task.dueAt,
    status: task.status,
    sourceId: task.id,
    sourceLabel: 'Tarefa',
    priority: task.priority,
    group,
  }
}

function mapInteraction(interaction: CrmInteraction): UnifiedActivity {
  return {
    id: `interaction:${interaction.id}`,
    kind: interactionKindByType[interaction.type],
    title: interaction.title,
    description: interaction.description,
    occurredAt: interaction.date,
    status: 'completed',
    sourceId: interaction.id,
    sourceLabel: 'CRM',
    group: 'recent',
  }
}

function mapConversation(conversation: NonNullable<BuildUnifiedActivitiesInput['conversations']>[number]): UnifiedActivity {
  const status = conversation.status === 'closed' || conversation.status === 'resolved' ? 'completed' : 'open'
  const channel = conversation.channel || 'whatsapp'
  const sourceLabel = channel === 'whatsapp' ? 'WhatsApp' : channel

  return {
    id: `conversation:${conversation.id}`,
    kind: channel === 'whatsapp' ? 'whatsapp' : 'whatsapp',
    title: status === 'open' ? 'Conversa em andamento' : 'Conversa registrada',
    description: conversation.summary || 'Sem resumo registrado.',
    occurredAt: conversation.lastMessageAt,
    status,
    sourceId: conversation.id,
    sourceLabel,
    group: 'recent',
  }
}

function mapAiInsight(insight: NonNullable<BuildUnifiedActivitiesInput['aiInsights']>[number]): UnifiedActivity {
  return {
    id: `ai:${insight.id}`,
    kind: 'ai_insight',
    title: insight.nextBestAction || 'Insight de IA registrado',
    description: insight.summary,
    occurredAt: insight.createdAt,
    status: 'completed',
    sourceId: insight.id,
    sourceLabel: 'IA',
    group: 'recent',
  }
}

function mapNextAction(action: NonNullable<BuildUnifiedActivitiesInput['nextActions']>[number], now: Date): UnifiedActivity {
  const dueDate = normalizeDate(action.dueAt)
  const isCompleted = Boolean(action.completedAt)
  const status: UnifiedActivityStatus = isCompleted ? 'completed' : 'pending'
  const group: UnifiedActivityGroup = !isCompleted && dueDate && dueDate.getTime() < now.getTime()
    ? 'overdue'
    : !isCompleted && dueDate
      ? 'future'
      : 'recent'

  return {
    id: `next-action:${action.id}`,
    kind: 'task',
    title: action.title,
    dueAt: action.dueAt,
    occurredAt: action.completedAt,
    status,
    sourceId: action.id,
    sourceLabel: 'Proxima acao',
    priority: action.priority,
    group,
  }
}

function sortUnifiedActivity(a: UnifiedActivity, b: UnifiedActivity) {
  const groupWeight: Record<UnifiedActivityGroup, number> = { overdue: 0, future: 1, recent: 2 }
  const groupDiff = groupWeight[a.group] - groupWeight[b.group]
  if (groupDiff !== 0) return groupDiff

  if (a.group === 'recent') {
    return getTime(b.occurredAt || b.dueAt) - getTime(a.occurredAt || a.dueAt)
  }

  return getTime(a.dueAt || a.occurredAt) - getTime(b.dueAt || b.occurredAt)
}

function getTime(value?: string) {
  const date = normalizeDate(value)
  return date ? date.getTime() : Number.MAX_SAFE_INTEGER
}

function normalizeDate(value?: string | Date) {
  if (!value) return undefined
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? undefined : value

  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? undefined : date
}
