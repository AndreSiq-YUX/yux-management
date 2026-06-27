import { ArrowRight } from 'lucide-react'

interface AgentHandoffPanelProps {
  handoffs: Array<Record<string, any>>
}

export function AgentHandoffPanel({ handoffs }: AgentHandoffPanelProps) {
  if (handoffs.length === 0) {
    return <div className="rounded-lg border border-dashed bg-white p-4 text-sm text-gray-500">Nenhum handoff estrategico pendente.</div>
  }

  return (
    <div className="space-y-2">
      {handoffs.map(handoff => (
        <article key={handoff.id} className="rounded-lg border bg-white p-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
            <span>{handoff.source_profile_key}</span>
            <ArrowRight className="h-4 w-4 text-gray-400" />
            <span>{handoff.target_profile_key}</span>
          </div>
          <p className="mt-1 text-sm text-gray-600">{handoff.reason}</p>
          <div className="mt-2 flex flex-wrap gap-2 text-xs text-gray-500">
            <span>Status: {handoff.status}</span>
            <span>Urgencia: {handoff.urgency}</span>
            {handoff.related_module && <span>Modulo: {handoff.related_module}</span>}
          </div>
        </article>
      ))}
    </div>
  )
}
