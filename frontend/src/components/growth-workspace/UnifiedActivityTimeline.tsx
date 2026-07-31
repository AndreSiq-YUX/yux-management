import {
  Bot,
  CalendarDays,
  CheckSquare,
  Clock,
  FileText,
  Mail,
  Megaphone,
  MessageCircle,
  Phone,
  Receipt,
  Repeat2,
  StickyNote,
  Ticket,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { summarizeActivityGroups } from '@/lib/growth-workspace/activityRules'
import type { UnifiedActivity, UnifiedActivityGroup, UnifiedActivityKind } from '@/types/growthWorkspace'

interface UnifiedActivityTimelineProps {
  activities: UnifiedActivity[]
}

const groupLabel: Record<UnifiedActivityGroup, string> = {
  overdue: 'Atrasadas',
  future: 'Futuras',
  recent: 'Recentes',
}

const iconByKind: Record<UnifiedActivityKind, typeof StickyNote> = {
  note: StickyNote,
  task: CheckSquare,
  call: Phone,
  meeting: CalendarDays,
  email: Mail,
  whatsapp: MessageCircle,
  stage_change: Repeat2,
  proposal: FileText,
  campaign: Megaphone,
  automation: Repeat2,
  invoice: Receipt,
  support_ticket: Ticket,
  ai_insight: Bot,
}

const badgeLabel: Record<UnifiedActivity['status'], string> = {
  open: 'Aberta',
  pending: 'Pendente',
  completed: 'Concluida',
  cancelled: 'Cancelada',
}

export function UnifiedActivityTimeline({ activities }: UnifiedActivityTimelineProps) {
  const summary = summarizeActivityGroups(activities)

  return (
    <section className="rounded-md border bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b p-3">
        <div>
          <h3 className="font-medium text-slate-950">Atividades unificadas</h3>
          <p className="text-xs text-slate-500">Tarefas, conversas, interacoes e inteligencia em uma linha do tempo.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant={summary.overdue > 0 ? 'destructive' : 'outline'}>{summary.overdue} atrasadas</Badge>
          <Badge variant="secondary">{summary.future} futuras</Badge>
          <Badge variant="outline">{summary.recent} recentes</Badge>
        </div>
      </div>

      {activities.length === 0 ? (
        <div className="flex items-center gap-3 p-4 text-sm text-slate-500">
          <Clock className="h-4 w-4" />
          Nenhuma atividade unificada registrada.
        </div>
      ) : (
        <div className="divide-y">
          {(['overdue', 'future', 'recent'] as UnifiedActivityGroup[]).map(group => {
            const groupedActivities = activities.filter(activity => activity.group === group)
            if (groupedActivities.length === 0) return null

            return (
              <div key={group} className="p-3">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h4 className="text-sm font-semibold text-slate-950">{groupLabel[group]}</h4>
                  <Badge variant="outline">{groupedActivities.length}</Badge>
                </div>
                <div className="space-y-3">
                  {groupedActivities.map(activity => (
                    <ActivityItem key={activity.id} activity={activity} />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

function ActivityItem({ activity }: { activity: UnifiedActivity }) {
  const Icon = iconByKind[activity.kind]
  const dateLabel = formatActivityDate(activity)

  return (
    <article className="grid grid-cols-[32px_1fr] gap-3">
      <span className="flex h-8 w-8 items-center justify-center rounded-md bg-slate-100 text-slate-600">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 border-b pb-3 last:border-b-0">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-slate-950">{activity.title}</p>
            {activity.description && <p className="mt-1 line-clamp-2 text-sm text-slate-600">{activity.description}</p>}
          </div>
          <Badge variant={activity.status === 'completed' ? 'secondary' : activity.status === 'cancelled' ? 'outline' : 'default'}>
            {badgeLabel[activity.status]}
          </Badge>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
          {activity.sourceLabel && <span>{activity.sourceLabel}</span>}
          {dateLabel && (
            <>
              <span aria-hidden="true">•</span>
              <time>{dateLabel}</time>
            </>
          )}
          {activity.priority && (
            <>
              <span aria-hidden="true">•</span>
              <span>Prioridade {activity.priority}</span>
            </>
          )}
        </div>
      </div>
    </article>
  )
}

function formatActivityDate(activity: UnifiedActivity) {
  const value = activity.group === 'recent' ? activity.occurredAt || activity.dueAt : activity.dueAt || activity.occurredAt
  if (!value) return undefined

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return undefined

  return date.toLocaleString('pt-BR')
}
