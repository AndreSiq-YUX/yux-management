import { ArrowLeft, Loader2, PauseCircle, Play, PlayCircle, RefreshCw, Share2, ShieldCheck, Sparkles, XCircle } from 'lucide-react'
import { Link } from 'react-router-dom'
import { MissionApprovalsPanel } from './MissionApprovalsPanel'
import { MissionEconomicsPanel } from './MissionEconomicsPanel'
import { MissionDecisionSummary, readDecisionSummary } from './MissionDecisionSummary'
import { MissionExecutionTimeline } from './MissionExecutionTimeline'
import { MissionMetricsPanel } from './MissionMetricsPanel'
import { MissionGuardrailsPanel } from './MissionGuardrailsPanel'
import { AutonomyControlCenter } from './AutonomyControlCenter'
import { MissionPlanPanel } from './MissionPlanPanel'
import { MissionTechnicalProof } from './MissionTechnicalProof'
import { MissionStatusBadge } from './MissionStatusBadge'
import { MissionArtifactsPanel } from './MissionArtifactsPanel'
import { isCompositeMissionPlan } from './CompositeMissionPlan'
import { MissionSpecialistTrace } from './MissionSpecialistTrace'
import { MissionNowCard } from './MissionNowCard'
import { MissionActivityFeed } from './MissionActivityFeed'
import { availableMissionCommands, formatBrl, formatMissionDate, formatMissionOutcome, formatMissionPack, missionModeLabel, missionStatusMeta } from '@/lib/action-engine/missionRules'
import type { ActionMission, DecisionReasonKey, MissionActionRun, MissionActivityItem, MissionApproval, MissionArtifact, MissionAutonomyGrant, MissionCapabilityControl, MissionEconomics, MissionMetrics, MissionOperationalControls as OperationalControls, MissionPlan, MissionStatus } from '@/types/actionEngine'

type MissionDetailProps = {
  mission: ActionMission; plan: MissionPlan | null; actions: MissionActionRun[]; approvals: MissionApproval[];
  metrics: MissionMetrics; economics: MissionEconomics | null; backHref: string; canWrite: boolean; showTechnicalProof: boolean; busy?: string;
  operationalControls: OperationalControls | null;
  artifacts: MissionArtifact[];
  activity?: MissionActivityItem[];
  conversationHref?: string;
  artifactHref?: (artifact: { kind: string; entityId?: string }) => string | undefined;
  onCommand: (command: 'qualify' | 'plan' | 'start' | 'pause' | 'resume' | 'evaluate' | 'cancel') => void;
  onApprovePlan: (approval: MissionApproval) => void;
  onShareSimulation: () => void;
  onApprovalDecision: (approval: MissionApproval, decision: 'approved' | 'rejected' | 'changes_requested', reasonKey?: DecisionReasonKey, comment?: string) => void;
  onRetryAction: (action: MissionActionRun) => void; onResolveHuman: (action: MissionActionRun) => void;
  onCapabilityControl: (capability: MissionCapabilityControl, disabled: boolean, reason: string) => void;
  onRequestAutonomyGrant: () => void;
  onApproveAutonomyGrant: (grant: MissionAutonomyGrant) => void;
  onRevokeAutonomyGrant: (grant: MissionAutonomyGrant, reason: string) => void;
  onRefreshArtifacts: () => void;
}

export function MissionDetail(props: MissionDetailProps) {
  const { mission, plan, actions, approvals, metrics, economics, backHref, canWrite, busy } = props
  const meta = missionStatusMeta[mission.status]
  const commands = availableMissionCommands(mission)
  const planApproval = approvals.find(item => item.status === 'pending' && (item.approvalType === 'plan' || item.approvalType === 'replan'))
  const decisionSummary = readDecisionSummary(planApproval)
  const selectedPack = mission.packSelection.packs?.[0]
  const isCampaignLaunch = selectedPack?.key === 'campaign_launch'
  const sourceLabel = selectedPack ? `${formatMissionPack(selectedPack.key)} · ${selectedPack.version}` : 'Plano orientado pelo agente'
  return (
    <div className="space-y-6">
      <header className="border-b border-slate-200 pb-5">
        <Link to={backHref} className="mb-4 inline-flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-[#2563EB]"><ArrowLeft className="h-4 w-4" /> Voltar para missões</Link>
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between"><div><div className="flex flex-wrap items-center gap-2"><span className="text-xs font-bold uppercase tracking-[0.14em] text-[#2563EB]">{sourceLabel}</span><MissionStatusBadge {...meta} /></div><h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">{mission.title}</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{mission.goal.statement || mission.objective}</p></div>{canWrite && <div className="flex flex-wrap gap-2">{mission.mode === 'shadow' && plan ? <Command label="Compartilhar simulação" icon={Share2} busy={false} variant="outline" onClick={props.onShareSimulation} /> : null}{commands.qualify && <Command label="Continuar pedido" icon={ShieldCheck} busy={busy === 'qualify'} onClick={() => props.onCommand('qualify')} />}{commands.plan && <Command label={mission.status === 'blocked' ? 'Tentar novamente' : 'Gerar plano'} icon={RefreshCw} busy={busy === 'plan'} onClick={() => props.onCommand('plan')} />}{commands.start && <Command label="Iniciar" icon={Play} busy={busy === 'start'} onClick={() => props.onCommand('start')} />}{commands.pause && <Command label="Pausar" icon={PauseCircle} busy={busy === 'pause'} variant="outline" onClick={() => props.onCommand('pause')} />}{commands.resume && <Command label="Retomar" icon={PlayCircle} busy={busy === 'resume'} onClick={() => props.onCommand('resume')} />}{commands.evaluate && <Command label="Avaliar agora" icon={RefreshCw} busy={busy === 'evaluate'} variant="outline" onClick={() => props.onCommand('evaluate')} />}{commands.cancel && <Command label="Cancelar" icon={XCircle} busy={busy === 'cancel'} variant="ghost" onClick={() => props.onCommand('cancel')} />}</div>}</div>
        <div className="mt-5 grid border border-slate-200 bg-white sm:grid-cols-2 lg:grid-cols-4"><Summary label="Resultado esperado" value={formatMissionOutcome(mission.goal.requestedOutcome)} /><Summary label="Prazo" value={formatMissionDate(mission.deadlineAt)} /><Summary label="Custo máximo" value={formatBrl(mission.autonomyEnvelope.maxTotalCostBrl)} /><Summary label="Modo" value={missionModeLabel[mission.mode] ?? mission.mode} /></div>
      </header>
      <MissionNowCard mission={mission} activity={props.activity ?? []} approvals={approvals} conversationHref={props.conversationHref} />
      {!plan ? <><MissionPrePlanState status={mission.status} /><MissionActivityFeed activity={props.activity ?? []} artifactHref={props.artifactHref} /></> : <>
        {decisionSummary && planApproval ? <MissionDecisionSummary summary={decisionSummary} approvalSubjectHash={planApproval.subjectHash} canApprove={canWrite} busy={busy === 'approve-plan'} onApprove={() => props.onApprovePlan(planApproval)} /> : null}
        {props.showTechnicalProof ? <details className="rounded-xl border border-slate-200 bg-white"><summary className="cursor-pointer px-5 py-4 text-sm font-semibold text-slate-700">Detalhes técnicos, DAG e provas de integridade</summary><div className="space-y-6 border-t border-slate-200 p-5">{decisionSummary ? <MissionTechnicalProof summary={decisionSummary} plan={plan} /> : null}<MissionPlanPanel plan={plan} technical />{isCompositeMissionPlan(plan) ? <MissionSpecialistTrace plan={plan} /> : null}</div></details> : !decisionSummary ? <MissionPlanPanel plan={plan} /> : null}
        <MissionArtifactsPanel artifacts={props.artifacts} canWrite={canWrite} showTechnicalProof={props.showTechnicalProof} onRefresh={props.onRefreshArtifacts} refreshing={busy === 'artifacts'} destinationHref={props.artifactHref} />
        <MissionActivityFeed activity={props.activity ?? []} artifactHref={props.artifactHref} />
        <MissionMetricsPanel metrics={metrics} metricSpec={mission.metricSpec} showTechnicalProof={props.showTechnicalProof} />
        {isCampaignLaunch ? <MissionGuardrailsPanel metrics={metrics} metricSpec={mission.metricSpec} status={mission.status} /> : null}
        {props.operationalControls ? <AutonomyControlCenter mission={mission} controls={props.operationalControls} canWrite={canWrite} busy={busy} onPause={() => props.onCommand('pause')} onRequestGrant={props.onRequestAutonomyGrant} onApproveGrant={props.onApproveAutonomyGrant} onRevokeGrant={props.onRevokeAutonomyGrant} onCapabilityControl={props.onCapabilityControl} /> : null}
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(320px,0.8fr)]"><MissionExecutionTimeline actions={actions} canWrite={canWrite} busyActionId={busy?.replace('action:', '')} onRetry={props.onRetryAction} onResolveHuman={props.onResolveHuman} /><MissionApprovalsPanel approvals={approvals} canWrite={canWrite} busyApprovalId={busy?.replace('approval:', '')} onDecision={props.onApprovalDecision} /></div>
        <MissionEconomicsPanel economics={economics} />
      </>}
    </div>
  )
}

const prePlanCopy: Partial<Record<MissionStatus, { eyebrow: string; title: string; description: string }>> = {
  draft: {
    eyebrow: 'Pedido recebido',
    title: 'O agente ainda precisa organizar esta missão.',
    description: 'Continue o pedido para que o agente verifique o contexto da empresa, as ferramentas disponíveis e as informações que ainda faltam antes de propor qualquer criação.',
  },
  qualifying: {
    eyebrow: 'Contexto em análise',
    title: 'Estamos verificando se há informações suficientes.',
    description: 'Responda às perguntas exibidas acima. Depois disso, o agente poderá preparar um plano coerente com a empresa e com o contrato.',
  },
  planning: {
    eyebrow: 'Preparando o plano',
    title: 'O agente está transformando o pedido em ações verificáveis.',
    description: 'Nenhuma campanha, automação ou alteração externa será executada antes de o plano aparecer para sua revisão.',
  },
  blocked: {
    eyebrow: 'Planejamento precisa de atenção',
    title: 'O plano ainda não pôde ser concluído.',
    description: 'Revise as pendências informadas e tente novamente. Nada foi executado enquanto o planejamento está bloqueado.',
  },
}

function MissionPrePlanState({ status }: { status: MissionStatus }) {
  const copy = prePlanCopy[status] ?? prePlanCopy.draft!
  return <section className="border border-blue-200 bg-blue-50/60 p-6" aria-live="polite"><div className="flex items-start gap-4"><div className="grid h-10 w-10 shrink-0 place-items-center bg-white text-[#2563EB]"><Sparkles className="h-5 w-5" /></div><div><p className="text-[11px] font-bold uppercase tracking-[0.14em] text-blue-700">{copy.eyebrow}</p><h2 className="mt-2 text-lg font-semibold text-slate-950">{copy.title}</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{copy.description}</p></div></div></section>
}

function Summary({ label, value }: { label: string; value: string }) { return <div className="border-b border-slate-200 px-4 py-3 sm:border-r lg:border-b-0"><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">{label}</p><p className="mt-1 text-sm font-semibold text-slate-800">{value}</p></div> }
function Command({ label, icon: Icon, busy, onClick, variant = 'primary' }: { label: string; icon: typeof Play; busy: boolean; onClick: () => void; variant?: 'primary' | 'outline' | 'ghost' }) { const style = variant === 'primary' ? 'bg-[#2563EB] text-white hover:bg-blue-700' : variant === 'outline' ? 'border border-slate-300 bg-white text-slate-700 hover:border-blue-400' : 'text-red-700 hover:bg-red-50'; return <button disabled={busy} onClick={onClick} className={`inline-flex h-9 items-center gap-2 rounded-sm px-3 text-xs font-semibold disabled:opacity-50 ${style}`}>{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Icon className="h-3.5 w-3.5" />}{label}</button> }
