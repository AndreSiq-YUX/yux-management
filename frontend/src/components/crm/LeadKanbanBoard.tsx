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
  /** `portal` usa o vocabulário do cliente ("Pontuação") e os tokens do portal. */
  profile?: 'internal' | 'portal'
}

const formatCurrency = (value?: number) => value !== undefined
  ? value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  : 'Sem valor'

const attentionLabel = (lead: CrmLead) => {
  const state = getLeadAttentionState(lead)
  if (state === 'stale') return { label: 'Sem atividade', icon: AlertCircle, className: 'text-yx-warn' }
  if (state === 'overdue') return { label: 'Atrasado', icon: AlertCircle, className: 'text-yx-crit' }
  if (state === 'due_today') return { label: 'Hoje', icon: Clock, className: 'text-yx-blue' }
  if (state === 'won') return { label: 'Ganho', icon: Trophy, className: 'text-yx-ok' }
  return { label: 'Em dia', icon: Clock, className: 'text-yx-fg-3' }
}

/**
 * Quadro por etapa. Rola na horizontal com encaixe por coluna (uma coluna quase cheia no celular).
 */
export function LeadKanbanBoard({ stages, leads, onSelectLead, onMoveLead, profile = 'internal' }: LeadKanbanBoardProps) {
  const scoreLabel = profile === 'portal' ? 'Pontuação' : 'Score'
  return (
    <div
      data-testid="lead-kanban"
      className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-3 [scrollbar-width:thin]"
    >
      {stages.map(stage => {
        const stageLeads = leads.filter(lead => lead.stageId === stage.id)
        return (
          <section
            key={stage.id}
            className="min-h-[440px] w-[85%] max-w-[340px] shrink-0 snap-start rounded-lg border border-yx-line bg-yx-surface-2 sm:w-[270px] sm:max-w-none"
          >
            <header className="flex items-center justify-between rounded-t-lg border-b border-yx-line bg-yx-surface p-3">
              <span className="flex items-center gap-2 text-sm font-semibold text-yx-fg">
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
                  <Card key={lead.id} className="border-yx-line bg-yx-surface hover:border-yx-blue">
                    <CardContent className="space-y-3 p-3">
                      <div>
                        <button
                          type="button"
                          className="text-left text-sm font-semibold text-yx-fg hover:text-yx-blue"
                          onClick={() => onSelectLead(lead)}
                        >
                          {lead.name}
                        </button>
                        <p className="text-xs text-yx-fg-3">{lead.company || lead.email}</p>
                      </div>
                      <div className="flex items-center justify-between gap-2 text-xs text-yx-fg-3">
                        <span>{scoreLabel} {lead.score}</span>
                        <span>{formatCurrency(lead.value)}</span>
                      </div>
                      <div className={`flex items-center gap-1 text-xs ${attention.className}`}>
                        <AttentionIcon className="h-3.5 w-3.5" />
                        <span>{attention.label}</span>
                      </div>
                      <Select value={lead.stageId} onValueChange={value => onMoveLead(lead, value)}>
                        <SelectTrigger
                          onClick={event => event.stopPropagation()}
                          aria-label={`Mover ${lead.name} para outra etapa`}
                          className="h-10 text-xs sm:h-8"
                        >
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
              {stageLeads.length === 0 && <p className="px-2 py-6 text-center text-xs text-yx-fg-3">Nenhum lead nesta etapa.</p>}
            </div>
          </section>
        )
      })}
    </div>
  )
}
