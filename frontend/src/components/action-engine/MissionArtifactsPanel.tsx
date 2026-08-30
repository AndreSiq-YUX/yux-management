import { Bot, GitBranch, Mail, RefreshCw, Route, ShieldAlert } from 'lucide-react'
import { ArtifactDiff } from './ArtifactDiff'
import { CampaignMissionArtifacts } from './CampaignMissionArtifacts'
import type { MissionArtifact } from '@/types/actionEngine'

export function MissionArtifactsPanel({ artifacts, canWrite, showTechnicalProof, onRefresh, refreshing = false }: {
  artifacts: MissionArtifact[]; canWrite: boolean; showTechnicalProof: boolean; onRefresh: () => void; refreshing?: boolean
}) {
  if (!artifacts.length) return null
  const campaignArtifacts = artifacts.filter(artifact => artifact.kind.startsWith('campaign_'))
  const standardArtifacts = artifacts.filter(artifact => !artifact.kind.startsWith('campaign_'))
  if (campaignArtifacts.length && !standardArtifacts.length) return <CampaignMissionArtifacts artifacts={campaignArtifacts} canWrite={canWrite} showTechnicalProof={showTechnicalProof} />
  const stale = standardArtifacts.some(artifact => artifact.staleApproval)
  return (
    <div className="space-y-6">
      {campaignArtifacts.length ? <CampaignMissionArtifacts artifacts={campaignArtifacts} canWrite={canWrite} showTechnicalProof={showTechnicalProof} /> : null}
    <section className="border border-slate-200 bg-white">
      <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div><h2 className="font-semibold text-slate-950">Entregáveis da missão</h2><p className="mt-1 text-xs text-slate-500">Revise exatamente o que será criado antes da publicação.</p></div>
        {stale ? <button type="button" onClick={onRefresh} disabled={refreshing} className="inline-flex h-8 items-center gap-2 self-start border border-amber-300 bg-amber-50 px-3 text-xs font-semibold text-amber-800 disabled:opacity-50"><RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} /> Atualizar revisão</button> : null}
      </div>
      {!canWrite ? <p className="border-b border-blue-100 bg-blue-50 px-5 py-3 text-xs text-blue-800">Visualização somente leitura. A operação YUX é responsável por publicar ou alterar estes itens.</p> : null}
      <div className="grid gap-px bg-slate-200 lg:grid-cols-2">{standardArtifacts.map(artifact => <ArtifactCard key={`${artifact.kind}:${artifact.key}`} artifact={artifact} showTechnicalProof={showTechnicalProof} />)}</div>
    </section>
    </div>
  )
}

function ArtifactCard({ artifact, showTechnicalProof }: { artifact: MissionArtifact; showTechnicalProof: boolean }) {
  const Icon = artifact.kind === 'funnel' ? GitBranch : artifact.kind === 'email' ? Mail : artifact.kind === 'sequence' ? Route : Bot
  return (
    <article className="bg-white p-5">
      <div className="flex items-start justify-between gap-3"><div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center bg-blue-50 text-blue-700"><Icon className="h-4 w-4" /></span><div><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">{kindLabel[artifact.kind]} · {statusLabel[artifact.status]}</p><h3 className="mt-1 text-sm font-semibold text-slate-900">{artifact.title}</h3></div></div></div>
      <ArtifactBody artifact={artifact} />
      {artifact.complianceWarnings.length ? <div className="mt-4 border border-amber-200 bg-amber-50 px-3 py-2"><p className="flex items-center gap-1.5 text-xs font-semibold text-amber-900"><ShieldAlert className="h-3.5 w-3.5" /> Cuidados de marca e conformidade</p><ul className="mt-1 space-y-1 text-xs text-amber-800">{artifact.complianceWarnings.map(item => <li key={item}>• {item}</li>)}</ul></div> : null}
      {artifact.citations.length ? <div className="mt-4"><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Fundamentado em</p><ul className="mt-1 space-y-1 text-xs text-slate-600">{artifact.citations.map(source => <li key={source.id}>{source.label}{showTechnicalProof ? <span className="ml-1 font-mono text-[10px] text-slate-400">({source.id})</span> : null}</li>)}</ul></div> : null}
      <ArtifactDiff proposed={artifact.proposedVersion} current={artifact.currentVersion} stale={artifact.staleApproval} />
    </article>
  )
}

function ArtifactBody({ artifact }: { artifact: MissionArtifact }) {
  const data = artifact.data
  if (artifact.kind === 'funnel') return <ol className="mt-4 flex flex-wrap gap-2">{records(data.stages).map((stage, index) => <li key={String(stage.key ?? index)} className="border border-slate-200 px-2.5 py-2 text-xs text-slate-700"><span className="mr-1 text-slate-400">{index + 1}.</span>{String(stage.name ?? stage.key ?? 'Etapa')}{stage.isWon ? ' · ganho' : stage.isLost ? ' · perdido' : ''}</li>)}</ol>
  if (artifact.kind === 'email') return <div className="mt-4 space-y-2 text-xs"><p><span className="font-semibold text-slate-500">Assunto:</span> {String(data.subject ?? '')}</p><p><span className="font-semibold text-slate-500">Prévia:</span> {String(data.previewText ?? '')}</p><div className="max-h-40 overflow-auto whitespace-pre-wrap border-l-2 border-blue-200 pl-3 leading-5 text-slate-600">{String(data.bodyText ?? '').replace('{{unsubscribe_url}}', '[link para descadastro]')}</div></div>
  if (artifact.kind === 'sequence') return <ol className="mt-4 space-y-2">{records(data.steps).map((step, index) => <li key={`${String(step.emailKey)}:${index}`} className="flex items-center gap-3 text-xs text-slate-700"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-slate-100 font-semibold">{index + 1}</span><span>{String(step.emailKey ?? 'E-mail')} · {delay(Number(step.delayMinutes ?? 0))}</span></li>)}</ol>
  const trigger = record(data.trigger)
  return <dl className="mt-4 grid gap-2 text-xs text-slate-700"><Row label="Gatilho" value={String(trigger.type ?? 'não definido')} /><Row label="Condições" value={`${records(data.eligibilityConditions).length} regra(s)`} /><Row label="Saídas" value={strings(data.exitConditions).join(', ') || 'não definidas'} /><Row label="Consentimento" value={String(data.consentPolicy ?? '')} /><Row label="Limite diário" value={String(data.dailyRunLimit ?? '')} /></dl>
}

function Row({ label, value }: { label: string; value: string }) { return <div className="grid grid-cols-[110px_1fr] gap-2"><dt className="font-semibold text-slate-500">{label}</dt><dd>{value}</dd></div> }
function record(value: unknown): Record<string, unknown> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {} }
function records(value: unknown): Array<Record<string, unknown>> { return Array.isArray(value) ? value.map(record) : [] }
function strings(value: unknown): string[] { return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [] }
function delay(minutes: number) { if (minutes === 0) return 'imediatamente'; if (minutes % 1440 === 0) return `após ${minutes / 1440} dia(s)`; if (minutes % 60 === 0) return `após ${minutes / 60} hora(s)`; return `após ${minutes} minuto(s)` }
const kindLabel: Record<MissionArtifact['kind'], string> = {
  funnel: 'Funil', email: 'E-mail', sequence: 'Sequência', automation: 'Automação',
  campaign_brief: 'Brief de campanha', campaign_audience: 'Público', campaign_creative: 'Criativo',
  campaign_landing_page: 'Landing page', campaign_lead_form: 'Formulário', campaign_tracking: 'Tracking', campaign_provider: 'Provedor',
}
const statusLabel = { proposed: 'Proposto', draft: 'Rascunho', published: 'Publicado' }
