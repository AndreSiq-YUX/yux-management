import { MessageCircle, MessagesSquare } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { ConversationSlaBadge } from '@/components/crm/ConversationSlaBadge'
import type { LeadConversationLink, LeadSlaEvent } from '@/types/crmAi'

export interface LeadConversationView extends LeadConversationLink {
  conversation?: {
    id: string
    status?: string
    subject?: string
    summary?: string
    last_message_at?: string
    lastMessageAt?: string
  }
}

interface LeadConversationPanelProps {
  conversations: LeadConversationView[]
  slaEvents?: LeadSlaEvent[]
}

const channelLabel: Record<string, string> = {
  whatsapp: 'WhatsApp',
  instagram: 'Instagram',
  email: 'Email',
  webchat: 'Webchat',
}

export function LeadConversationPanel({ conversations, slaEvents = [] }: LeadConversationPanelProps) {
  const active = conversations.filter(item => item.status !== 'archived')

  return (
    <section className="rounded-md border bg-white">
      <div className="flex items-center justify-between gap-3 border-b px-3 py-3">
        <div className="flex items-center gap-2">
          <MessagesSquare className="h-4 w-4 text-slate-500" />
          <h3 className="font-medium text-slate-950">Conversas vinculadas</h3>
        </div>
        <Badge variant="secondary">{active.length}</Badge>
      </div>
      <div className="divide-y">
        {active.map(link => {
          const conversation = link.conversation
          const sla = slaEvents.find(event => event.conversationId === link.conversationId && event.status !== 'resolved')
          const lastMessageAt = conversation?.last_message_at || conversation?.lastMessageAt || link.linkedAt || link.updatedAt

          return (
            <div key={link.id} className="grid gap-2 px-3 py-3 text-sm md:grid-cols-[1fr_auto]">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <MessageCircle className="h-4 w-4 text-emerald-600" />
                  <span className="font-medium text-slate-950">{channelLabel[link.channel] || link.channel}</span>
                  <Badge variant="outline">{conversation?.status || link.status}</Badge>
                </div>
                <p className="mt-1 truncate text-slate-600">{conversation?.summary || conversation?.subject || 'Sem resumo registrado.'}</p>
                <p className="mt-1 text-xs text-slate-500">
                  Ultima atividade: {lastMessageAt ? new Date(lastMessageAt).toLocaleString('pt-BR') : 'sem data'}
                </p>
              </div>
              <div className="flex items-start justify-end">
                <ConversationSlaBadge event={sla} />
              </div>
            </div>
          )
        })}
        {active.length === 0 && <p className="px-3 py-5 text-sm text-slate-500">Nenhuma conversa vinculada a este lead.</p>}
      </div>
    </section>
  )
}
