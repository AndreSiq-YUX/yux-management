import { BrainCircuit, Check, Lightbulb, ShieldAlert } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import type { CrmLead } from '@/types/crm'
import type { LeadAiFieldSuggestion, LeadAiInsight } from '@/types/crmAi'

interface LeadAiInsightPanelProps {
  lead: CrmLead
  insights: LeadAiInsight[]
  fieldSuggestions?: LeadAiFieldSuggestion[]
}

const sentimentLabel: Record<string, string> = {
  positive: 'Positivo',
  neutral: 'Neutro',
  negative: 'Negativo',
  unknown: 'Indefinido',
}

const urgencyLabel: Record<string, string> = {
  high: 'Alta',
  medium: 'Media',
  low: 'Baixa',
  none: 'Sem urgencia',
}

export function LeadAiInsightPanel({ lead, insights, fieldSuggestions = [] }: LeadAiInsightPanelProps) {
  const latest = insights[0]
  const pending = fieldSuggestions.filter(item => item.status === 'pending')
  const objections = latest?.objections?.length ? latest.objections : lead.objections || []

  return (
    <section className="rounded-md border bg-white">
      <div className="flex items-center justify-between gap-3 border-b px-3 py-3">
        <div className="flex items-center gap-2">
          <BrainCircuit className="h-4 w-4 text-slate-500" />
          <h3 className="font-medium text-slate-950">Inteligencia do lead</h3>
        </div>
        <Badge variant={latest?.urgency === 'high' || lead.urgency === 'high' ? 'destructive' : 'secondary'}>
          {urgencyLabel[latest?.urgency || lead.urgency || 'none']}
        </Badge>
      </div>
      <div className="space-y-3 p-3">
        <div>
          <p className="text-xs font-medium uppercase text-slate-500">Resumo</p>
          <p className="mt-1 text-sm text-slate-800">{latest?.summary || lead.aiSummary || 'A IA ainda nao gerou resumo para este lead.'}</p>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <Info label="Intencao" value={latest?.intent || lead.intent || lead.interest || 'Nao detectada'} />
          <Info label="Sentimento" value={sentimentLabel[latest?.sentiment || lead.sentiment || 'unknown']} />
          <Info label="Confianca" value={latest ? `${Math.round(latest.confidence * 100)}%` : 'Sem leitura'} />
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-md border bg-slate-50 p-3">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-900">
              <ShieldAlert className="h-4 w-4 text-amber-600" />
              Objecoes e riscos
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {[...objections, ...(latest?.risks || [])].map(item => <Badge key={item} variant="outline">{item}</Badge>)}
              {objections.length === 0 && !latest?.risks?.length && <span className="text-sm text-slate-500">Nenhum risco registrado.</span>}
            </div>
          </div>
          <div className="rounded-md border bg-slate-50 p-3">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-900">
              <Lightbulb className="h-4 w-4 text-cyan-700" />
              Proxima melhor acao
            </div>
            <p className="mt-2 text-sm text-slate-700">{latest?.nextBestAction || 'Sem recomendacao no momento.'}</p>
          </div>
        </div>
        {pending.length > 0 && (
          <div className="rounded-md border border-cyan-200 bg-cyan-50 p-3">
            <div className="flex items-center gap-2 text-sm font-medium text-cyan-950">
              <Check className="h-4 w-4" />
              Sugestoes pendentes de confirmacao
            </div>
            <div className="mt-2 grid gap-2 md:grid-cols-2">
              {pending.map(item => (
                <div key={item.id} className="rounded-md bg-white p-2 text-sm text-slate-700">
                  <span className="font-medium">{item.fieldKey}:</span> {String(item.suggestedValue)}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-slate-50 p-3">
      <p className="text-xs font-medium uppercase text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-medium text-slate-950">{value}</p>
    </div>
  )
}
