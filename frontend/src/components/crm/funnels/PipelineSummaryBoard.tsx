import { AlertCircle, ArrowRight, Users } from 'lucide-react'
import { useMemo } from 'react'
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

  return (
    <section className="space-y-5" aria-labelledby={`pipeline-board-${pipeline.id}`}>
      <div className="flex flex-col gap-5 border-b border-slate-200 pb-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 id={`pipeline-board-${pipeline.id}`} className="text-lg font-semibold text-gray-900">{pipeline.name}</h2>
            {pipeline.isDefault && <span className="rounded-full bg-yux-50 px-2 py-1 text-xs font-medium text-yux-700">Padrão</span>}
            {!pipeline.isActive && <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600">Inativo</span>}
          </div>
          {pipeline.description && <p className="mt-1 max-w-2xl text-sm leading-5 text-slate-600">{pipeline.description}</p>}
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Leads</p>
            <p className="mt-1 font-semibold text-slate-950">{metrics.leadCount}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Valor aberto</p>
            <p className="mt-1 font-semibold text-slate-950">{formatPortalCurrency(metrics.openValue)}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Parados</p>
            <p className="mt-1 font-semibold text-slate-950">{metrics.staleCount}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Conversão</p>
            <p className="mt-1 font-semibold text-slate-950">{formatConversionRate(metrics.conversionRate)}</p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        {stages.map(stage => {
          const stageLeads = leads.filter(lead => lead.stageId === stage.id)
          const metricsForStage = stageMetrics.get(stage.id) as CrmPipelineStageMetrics

          return (
            <article key={stage.id} className="min-w-0 rounded-xl border border-slate-200 bg-slate-50/80 p-3">
              <div className="flex items-start justify-between gap-2 border-b border-slate-200 pb-3">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: stage.color }} aria-hidden="true" />
                  <h3 className="truncate text-sm font-semibold text-slate-950">{stage.name}</h3>
                </div>
                <span className="shrink-0 text-xs font-medium text-slate-600">
                  {metricsForStage.leadCount} leads · {formatPortalCurrency(metricsForStage.openValue)}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
                <span>{metricsForStage.wonCount} ganhos</span>
                <span>{metricsForStage.lostCount} perdidos</span>
                <span>{formatConversionRate(metricsForStage.conversionRate)}</span>
                {metricsForStage.staleCount > 0 && (
                  <span className="font-medium text-amber-700">{metricsForStage.staleCount} parados</span>
                )}
              </div>

              <div className="mt-3 space-y-2">
                {stageLeads.map(lead => {
                  const stale = isStaleLead(lead, now)
                  return (
                    <div key={lead.id} className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm transition hover:border-yux-300 hover:shadow-md">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-950">{lead.name}</p>
                          <p className="truncate text-xs text-slate-500">{lead.company || lead.email}</p>
                        </div>
                        <span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">Score {lead.score}</span>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                        <span>{lead.value ? formatPortalCurrency(lead.value) : 'Sem valor informado'}</span>
                        {stale ? (
                          <span className="inline-flex items-center gap-1 font-medium text-amber-700">
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
                        className="mt-3 flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
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
                    <div className="rounded-lg border border-dashed border-slate-300 bg-white px-3 py-8 text-center text-xs text-slate-500">
                    Nenhum lead nesta etapa.
                  </div>
                )}
              </div>
            </article>
          )
        })}
        {!stages.length && (
          <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-600 xl:col-span-3">
            <Users className="mx-auto h-5 w-5 text-gray-400" aria-hidden="true" />
            <p className="mt-2">Este funil ainda não possui etapas.</p>
          </div>
        )}
      </div>

      {canMoveLeads && stages.length > 0 && (
        <p className="inline-flex items-center gap-1 text-xs text-slate-500">
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          Use o seletor de cada lead para registrar a próxima etapa.
        </p>
      )}
    </section>
  )
}
