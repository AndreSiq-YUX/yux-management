import { AlertTriangle, CheckCircle2, Clock3 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { isSlaBreached } from '@/lib/crm/conversationRules'
import type { LeadSlaEvent } from '@/types/crmAi'

interface ConversationSlaBadgeProps {
  event?: Pick<LeadSlaEvent, 'status' | 'dueAt' | 'resolvedAt' | 'type'>
  now?: Date
}

const typeLabel: Record<string, string> = {
  first_response: 'Primeira resposta',
  follow_up: 'Follow-up',
  human_handoff: 'Handoff',
  stale_conversation: 'Conversa parada',
}

export function ConversationSlaBadge({ event, now = new Date() }: ConversationSlaBadgeProps) {
  if (!event) {
    return (
      <Badge variant="secondary" className="gap-1">
        <Clock3 className="h-3 w-3" />
        Sem SLA
      </Badge>
    )
  }

  if (event.resolvedAt || event.status === 'resolved') {
    return (
      <Badge variant="secondary" className="gap-1 bg-emerald-50 text-emerald-700 hover:bg-emerald-50">
        <CheckCircle2 className="h-3 w-3" />
        Resolvido
      </Badge>
    )
  }

  const breached = isSlaBreached(event, now)
  const label = `${typeLabel[event.type] || 'SLA'} ${new Date(event.dueAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`

  return (
    <Badge variant={breached ? 'destructive' : 'secondary'} className="gap-1">
      {breached ? <AlertTriangle className="h-3 w-3" /> : <Clock3 className="h-3 w-3" />}
      {breached ? 'SLA vencido' : label}
    </Badge>
  )
}
