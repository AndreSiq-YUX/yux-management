import { BookText, Mail, MessageSquare, Phone } from 'lucide-react'
import type { CrmInteraction } from '@/types/crm'

interface LeadTimelineProps {
  interactions: CrmInteraction[]
}

const iconByType = {
  call: Phone,
  email: Mail,
  meeting: MessageSquare,
  note: BookText,
}

export function LeadTimeline({ interactions }: LeadTimelineProps) {
  if (interactions.length === 0) {
    return <p className="text-sm text-slate-500">Nenhuma atividade registrada.</p>
  }

  return (
    <div className="space-y-3">
      {interactions.map(item => {
        const Icon = iconByType[item.type]
        return (
          <article key={item.id} className="grid grid-cols-[28px_1fr] gap-3">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-slate-600">
              <Icon className="h-4 w-4" />
            </span>
            <div className="border-b pb-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium text-slate-950">{item.title}</p>
                <time className="text-xs text-slate-500">{new Date(item.date).toLocaleString('pt-BR')}</time>
              </div>
              <p className="mt-1 text-sm text-slate-600">{item.description}</p>
            </div>
          </article>
        )
      })}
    </div>
  )
}
