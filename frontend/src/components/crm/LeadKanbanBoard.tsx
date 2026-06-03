import { AlertCircle, Clock, Trophy } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { getLeadAttentionState } from '@/lib/crm/pipelineRules'
import type { CrmLead, CrmPipelineStage } from '@/types/crm'

interface LeadKanbanBoardProps {
  stages: CrmPipelineStage[]
  leads: CrmLead[]
  onSelectLead: (lead: CrmLead) => void
  onMoveLead: (lead: CrmLead, stageId: string) => void
}

const formatCurrency = (value?: number) => value !== undefined
  ? value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  : 'Sem valor'

const attentionLabel = (lead: CrmLead) => {
  const state = getLeadAttentionState(lead)
  if (state === 'stale') return { label: 'Sem atividade', icon: AlertCircle, className: 'text-amber-700' }
  if (state === 'overdue') return { label: 'Atrasado', icon: AlertCircle, className: 'text-red-700' }
  if (state === 'due_today') return { label: 'Hoje', icon: Clock, className: 'text-blue-700' }
  if (state === 'won') return { label: 'Ganho', icon: Trophy, className: 'text-emerald-700' }
  return { label: 'Em dia', icon: Clock, className: 'text-slate-500' }
}

export function LeadKanbanBoard({ stages, leads, onSelectLead, onMoveLead }: LeadKanbanBoardProps) {
  return (
    <div
      className="grid gap-3 overflow-x-auto pb-3"
      style={{ gridTemplateColumns: `repeat(${Math.max(stages.length, 1)}, minmax(250px, 1fr))` }}
    >
      {stages.map(stage => {
        const stageLeads = leads.filter(lead => lead.stageId === stage.id)
        return (
          <section key={stage.id} className="min-h-[440px] rounded-md border bg-slate-50">
            <header className="flex items-center justify-between border-b bg-white p-3">
              <span className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: stage.color }} />
                {stage.name}
              </span>
              <Badge variant="secondary">{stageLeads.length}</Badge>
            </header>
            <div className="space-y-2 p-2">
              {stageLeads.map(lead => {
                const attention = attentionLabel(lead)
                const AttentionIcon = attention.icon
                return (
                  <Card key={lead.id} className="border-slate-200 bg-white hover:border-yux-300">
                    <CardContent className="space-y-3 p-3">
                      <div>
                        <button
                          type="button"
                          className="text-left text-sm font-semibold text-slate-950 hover:text-yux-700"
                          onClick={() => onSelectLead(lead)}
                        >
                          {lead.name}
                        </button>
                        <p className="text-xs text-slate-500">{lead.company || lead.email}</p>
                      </div>
                      <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                        <span>Score {lead.score}</span>
                        <span>{formatCurrency(lead.value)}</span>
                      </div>
                      <div className={`flex items-center gap-1 text-xs ${attention.className}`}>
                        <AttentionIcon className="h-3.5 w-3.5" />
                        <span>{attention.label}</span>
                      </div>
                      <Select value={lead.stageId} onValueChange={value => onMoveLead(lead, value)}>
                        <SelectTrigger onClick={event => event.stopPropagation()} className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {stages.map(item => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          </section>
        )
      })}
    </div>
  )
}
