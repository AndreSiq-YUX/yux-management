import { AlertTriangle, Flame, MessageCircle, Timer } from 'lucide-react'
import { isLeadStalled, rankTodayLead } from '@/lib/crm/cockpitRules'
import { isSlaBreached } from '@/lib/crm/conversationRules'
import type { CrmCockpitLead } from '@/types/crmCockpit'
import type { LeadSlaEvent } from '@/types/crmAi'

interface TodayWorkQueueProps {
  leads: CrmCockpitLead[]
  slaEvents?: LeadSlaEvent[]
  onSelectLead: (lead: CrmCockpitLead) => void
  now?: Date
}

export function TodayWorkQueue({ leads, slaEvents = [], onSelectLead, now = new Date() }: TodayWorkQueueProps) {
  const breachedLeadIds = new Set(slaEvents.filter(event => isSlaBreached(event, now)).map(event => event.leadId))
  const ranked = [...leads]
    .filter(lead => (lead.status || 'open') === 'open')
    .sort((a, b) => (
      rankTodayLead(b, now) + (breachedLeadIds.has(b.id) ? 150 : 0)
    ) - (
      rankTodayLead(a, now) + (breachedLeadIds.has(a.id) ? 150 : 0)
    ))
    .slice(0, 12)

  return (
    <section className="rounded-lg border bg-white">
      <div className="border-b px-4 py-3">
        <h2 className="font-semibold text-gray-900">Minhas oportunidades de hoje</h2>
        <p className="text-sm text-gray-500">Leads priorizados por follow-up, temperatura, urgencia e tempo parado.</p>
      </div>
      <div className="divide-y">
        {ranked.map(lead => (
          <button
            key={lead.id}
            type="button"
            className="grid w-full gap-3 px-4 py-3 text-left hover:bg-slate-50 md:grid-cols-[1.4fr_1fr_1fr_120px]"
            onClick={() => onSelectLead(lead)}
          >
            <span>
              <span className="block font-medium text-gray-950">{lead.name}</span>
              <span className="text-xs text-gray-500">{lead.company || lead.email}</span>
            </span>
            <Status icon={Flame} label={lead.temperature === 'hot' ? 'Lead quente' : lead.temperature || 'Sem temperatura'} />
            <Status icon={Timer} label={breachedLeadIds.has(lead.id) ? 'SLA vencido' : isLeadStalled(lead, 3, now) ? 'Negocio travado' : 'Em andamento'} />
            <Status icon={MessageCircle} label={lead.lastConversationAt ? 'Conversa aberta' : lead.nextFollowUpAt ? 'Follow-up' : 'Sem agenda'} />
          </button>
        ))}
        {ranked.length === 0 && (
          <div className="flex items-center gap-2 px-4 py-6 text-sm text-gray-500">
            <AlertTriangle className="h-4 w-4" />
            Nenhuma oportunidade aberta para hoje.
          </div>
        )}
      </div>
    </section>
  )
}

function Status({ icon: Icon, label }: { icon: typeof Flame; label: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm text-gray-600">
      <Icon className="h-4 w-4 text-gray-400" />
      {label}
    </span>
  )
}
