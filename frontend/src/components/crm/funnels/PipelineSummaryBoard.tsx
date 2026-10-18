import { AlertCircle, ArrowRight, ChevronDown, Users } from 'lucide-react'
import { useMemo, useState } from 'react'
import { StatusChip } from '@/components/portal-ui'
import { cn } from '@/lib/utils'
import { formatPortalCurrency, formatPortalDateTime } from '@/lib/client-portal/portalDisplay'
import type { CrmLead, CrmPipeline, CrmPipelineMetrics, CrmPipelineStageMetrics } from '@/types/crm'

export interface PipelineSummaryBoardProps {
  pipeline: CrmPipeline
  leads: CrmLead[]
  allPipelines: CrmPipeline[]
  canMoveLeads: boolean
  movingLeadId?: string | null
  now?: Date
  onMoveLead: (leadId: string, stageId: string) => Promise<void>
}

const staleThresholdMs = 7 * 24 * 60 * 60 * 1000

function isStaleLead(lead: CrmLead, now: Date) {
  const activityAt = lead.lastActivityAt || lead.updatedAt || lead.createdAt
  return now.getTime() - new Date(activityAt).getTime() > staleThresholdMs
}

function isWonLead(lead: CrmLead, stage: NonNullable<CrmPipeline['stages']>[number] | undefined) {
  return lead.status === 'won' || Boolean(stage?.isWon)
}

function isLostLead(lead: CrmLead, stage: NonNullable<CrmPipeline['stages']>[number] | undefined) {
  return lead.status === 'lost' || Boolean(stage?.isLost)
}

function conversionRate(wonCount: number, lostCount: number) {
  const base = wonCount + lostCount
  return base > 0 ? wonCount / base : null
}

export function calculatePipelineMetrics(
  pipeline: CrmPipeline,
  leads: CrmLead[],
  now = new Date(),
): CrmPipelineMetrics {
  const stages = new Map((pipeline.stages || []).map(stage => [stage.id, stage]))
  const wonCount = leads.filter(lead => isWonLead(lead, stages.get(lead.stageId))).length
  const lostCount = leads.filter(lead => isLostLead(lead, stages.get(lead.stageId))).length

  return {
    leadCount: leads.length,
    openValue: leads
      .filter(lead => (lead.status || 'open') === 'open')
      .reduce((sum, lead) => sum + (lead.value || 0), 0),
    staleCount: leads.filter(lead => isStaleLead(lead, now)).length,
    wonCount,
    lostCount,
    conversionRate: conversionRate(wonCount, lostCount),
  }
}

export function calculateStageMetrics(
  pipeline: CrmPipeline,
  stageId: string,
  leads: CrmLead[],
  now = new Date(),
): CrmPipelineStageMetrics {
  const stage = (pipeline.stages || []).find(item => item.id === stageId)
  const stageLeads = leads.filter(lead => lead.stageId === stageId)
  const wonCount = stageLeads.filter(lead => isWonLead(lead, stage)).length
  const lostCount = stageLeads.filter(lead => isLostLead(lead, stage)).length

  return {
    stageId,
    leadCount: stageLeads.length,
    openValue: stageLeads
      .filter(lead => (lead.status || 'open') === 'open')
      .reduce((sum, lead) => sum + (lead.value || 0), 0),
    staleCount: stageLeads.filter(lead => isStaleLead(lead, now)).length,
    wonCount,
    lostCount,
    conversionRate: conversionRate(wonCount, lostCount),
  }
}

function formatConversionRate(rate: number | null) {
  return rate === null ? 'Sem base' : `${Math.round(rate * 100)}%`
}

const leadsLabel = (count: number) => `${count} ${count === 1 ? 'lead' : 'leads'}`

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <p className="font-mono text-[11px] font-medium uppercase tracking-[0.07em] text-yx-fg-3">{label}</p>
      <p className="mt-1 font-display text-lg font-semibold text-yx-fg">{value}</p>
    </div>
  )
}

export function PipelineSummaryBoard({
  pipeline,
  leads,
  allPipelines,
  canMoveLeads,
  movingLeadId = null,
  now = new Date(),
  onMoveLead,
}: PipelineSummaryBoardProps) {
  const stages = useMemo(
    () => [...(pipeline.stages || [])].sort((left, right) => left.orderIndex - right.orderIndex),
    [pipeline.stages],
  )
  const metrics = useMemo(() => calculatePipelineMetrics(pipeline, leads, now), [leads, now, pipeline])
  const stageMetrics = useMemo(
    () => new Map(stages.map(stage => [stage.id, calculateStageMetrics(pipeline, stage.id, leads, now)])),
    [leads, now, pipeline, stages],
  )
  // Celular: etapas em acordeão. Começa aberta a primeira etapa que tem leads (a partir de xl todas ficam visíveis).
  const [openStages, setOpenStages] = useState<Set<string>>(() => {
    const first = stages.find(stage => leads.some(lead => lead.stageId === stage.id)) || stages[0]
    return new Set(first ? [first.id] : [])
  })
  const toggleStage = (stageId: string) => setOpenStages(current => {
    const next = new Set(current)
    if (next.has(stageId)) next.delete(stageId)
    else next.add(stageId)
    return next
  })

  return (
    <section className="space-y-5" aria-labelledby={`pipeline-board-${pipeline.id}`}>
      <div className="flex flex-col gap-5 border-b border-yx-line pb-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 id={`pipeline-board-${pipeline.id}`} className="font-display text-lg font-semibold text-yx-fg">{pipeline.name}</h2>
            {pipeline.isDefault && <StatusChip variant="neutral">Padrão</StatusChip>}
            {!pipeline.isActive && <StatusChip variant="warn">Inativo</StatusChip>}
          </div>
          {pipeline.description && <p className="mt-1 max-w-2xl text-sm leading-5 text-yx-fg-2">{pipeline.description}</p>}
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <Stat label="Leads" value={metrics.leadCount} />
          <Stat label="Valor aberto" value={formatPortalCurrency(metrics.openValue)} />
          <Stat label="Parados" value={metrics.staleCount} />
          <Stat label="Conversão" value={formatConversionRate(metrics.conversionRate)} />
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        {stages.map(stage => {
          const stageLeads = leads.filter(lead => lead.stageId === stage.id)
          const metricsForStage = stageMetrics.get(stage.id) as CrmPipelineStageMetrics
          const expanded = openStages.has(stage.id)
          const bodyId = `stage-body-${stage.id}`

          return (
            <article key={stage.id} className="min-w-0 rounded-xl border border-yx-line bg-yx-surface-2 p-3">
              <button
                type="button"
                aria-expanded={expanded}
                aria-controls={bodyId}
                onClick={() => toggleStage(stage.id)}
                className="flex min-h-10 w-full items-start justify-between gap-2 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yx-blue xl:cursor-default"
              >
                <span className="flex min-w-0 items-start gap-2 sm:items-center">
                  <span className="mt-1 h-3 w-3 shrink-0 rounded-full sm:mt-0" style={{ backgroundColor: stage.color }} aria-hidden="true" />
                  <span className="font-display leading-snug sm:truncate text-sm font-semibold text-yx-fg">{stage.name}</span>
                </span>
                <span className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-yx-fg-2">
                  {leadsLabel(metricsForStage.leadCount)} · {formatPortalCurrency(metricsForStage.openValue)}
                  <ChevronDown aria-hidden="true" className={cn('h-4 w-4 text-yx-fg-3 transition-transform xl:hidden', expanded && 'rotate-180')} />
                </span>
              </button>
              <div id={bodyId} className={cn(!expanded && 'max-xl:hidden')}>
                <div className="mt-3 flex flex-wrap gap-2 border-t border-yx-line pt-3 text-xs text-yx-fg-3">
                  <span>{metricsForStage.wonCount} ganhos</span>
                  <span>{metricsForStage.lostCount} perdidos</span>
                  <span>Conversão: {formatConversionRate(metricsForStage.conversionRate)}</span>
                  {metricsForStage.staleCount > 0 && (
                    <span className="font-medium text-yx-warn">{metricsForStage.staleCount} parados</span>
                  )}
                </div>

                <div className="mt-3 space-y-2">
                  {stageLeads.map(lead => {
                    const stale = isStaleLead(lead, now)
                    return (
                      <div key={lead.id} className="rounded-lg border border-yx-line bg-yx-surface p-3 transition hover:border-yx-blue">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-yx-fg">{lead.name}</p>
                            <p className="truncate text-xs text-yx-fg-3">{lead.company || lead.email}</p>
                          </div>
                          <span className="shrink-0 rounded-full bg-yx-surface-2 px-2 py-1 font-mono text-[11.5px] font-medium text-yx-fg-2">Pontuação {lead.score}</span>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-yx-fg-3">
                          <span>{lead.value ? formatPortalCurrency(lead.value) : 'Sem valor informado'}</span>
                          {stale ? (
                            <span className="inline-flex items-center gap-1 font-medium text-yx-warn">
                              <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
                              Sem atividade há mais de 7 dias
                            </span>
                          ) : (
                            <span>Atividade: {formatPortalDateTime(lead.lastActivityAt || lead.updatedAt)}</span>
                          )}
                        </div>
                        <label htmlFor={`move-lead-${lead.id}`} className="sr-only">Mover {lead.name} para</label>
                        <select
                          id={`move-lead-${lead.id}`}
                          className="mt-3 flex h-10 w-full rounded-md border border-input bg-background px-3 py-1 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 sm:h-9"
                          value={lead.stageId}
                          disabled={!canMoveLeads || movingLeadId === lead.id}
                          onChange={event => {
                            if (event.target.value !== lead.stageId) void onMoveLead(lead.id, event.target.value)
                          }}
                          aria-label={`Mover ${lead.name} para outra etapa`}
                        >
                          {allPipelines.flatMap(item => (item.stages || []).map(targetStage => (
                            <option key={`${item.id}-${targetStage.id}`} value={targetStage.id}>
                              {item.id === pipeline.id ? targetStage.name : `${item.name} · ${targetStage.name}`}
                            </option>
                          )))}
                        </select>
                      </div>
                    )
                  })}
                  {!stageLeads.length && (
                    <div className="rounded-lg border border-dashed border-yx-line-strong bg-yx-surface px-3 py-8 text-center text-xs text-yx-fg-3">
                      Nenhum lead nesta etapa.
                    </div>
                  )}
                </div>
              </div>
            </article>
          )
        })}
        {!stages.length && (
          <div className="rounded-xl border border-dashed border-yx-line-strong p-8 text-center text-sm text-yx-fg-2 xl:col-span-3">
            <Users className="mx-auto h-5 w-5 text-yx-fg-3" aria-hidden="true" />
            <p className="mt-2">Este funil ainda não possui etapas.</p>
          </div>
        )}
      </div>

      {canMoveLeads && stages.length > 0 && (
        <p className="inline-flex items-center gap-1 text-xs text-yx-fg-3">
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          Use o seletor de cada lead para registrar a próxima etapa.
        </p>
      )}
    </section>
  )
}
