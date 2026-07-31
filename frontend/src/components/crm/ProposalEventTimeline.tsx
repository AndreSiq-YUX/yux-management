import { CalendarClock, MessageSquare } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import type { ProposalFollowUpTask, ProposalObjection, ProposalViewEvent } from '@/types/crmClosing'

interface ProposalEventTimelineProps {
  events: ProposalViewEvent[]
  followUps?: ProposalFollowUpTask[]
  objections?: ProposalObjection[]
}

export function ProposalEventTimeline({ events, followUps = [], objections = [] }: ProposalEventTimelineProps) {
  return (
    <section className="rounded-md border bg-white">
      <div className="flex items-center gap-2 border-b px-3 py-3">
        <CalendarClock className="h-4 w-4 text-slate-500" />
        <h3 className="font-medium text-slate-950">Linha do tempo da proposta</h3>
      </div>
      <div className="divide-y">
        {events.map(event => (
          <div key={event.id} className="px-3 py-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium text-slate-950">{event.eventType}</span>
              <span className="text-xs text-slate-500">{new Date(event.createdAt).toLocaleString('pt-BR')}</span>
            </div>
            <p className="mt-1 text-xs text-slate-500">Ator: {event.actorType}</p>
          </div>
        ))}
        {followUps.map(task => (
          <div key={task.id} className="px-3 py-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium text-slate-950">{task.title}</span>
              <Badge variant={task.status === 'pending' ? 'outline' : 'secondary'}>{task.status}</Badge>
            </div>
            <p className="mt-1 text-xs text-slate-500">Prazo: {new Date(task.dueAt).toLocaleString('pt-BR')}</p>
          </div>
        ))}
        {objections.map(item => (
          <div key={item.id} className="px-3 py-3 text-sm">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-amber-600" />
              <span className="font-medium text-slate-950">{item.category}</span>
              <Badge variant="outline">{item.status}</Badge>
            </div>
            <p className="mt-1 text-slate-600">{item.description}</p>
          </div>
        ))}
        {events.length === 0 && followUps.length === 0 && objections.length === 0 && (
          <p className="px-3 py-5 text-sm text-slate-500">Nenhum evento comercial registrado.</p>
        )}
      </div>
    </section>
  )
}
