import { useCallback, useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { MissionDetail } from './MissionDetail'
import { MissionClarificationPanel } from './MissionClarificationPanel'
import { MissionSimulationShareDialog } from './MissionSimulationShareDialog'
import { HumanTaskResolutionDialog } from './HumanTaskResolutionDialog'
import { actionEngineService } from '@/services/actionEngineService'
import { ApiClientError } from '@/lib/apiClient'
import type { ActionMission, MissionActionRun, MissionApproval, MissionArtifact, MissionContextPreview, MissionEconomics, MissionMetrics, MissionOperationalControls, MissionPlan } from '@/types/actionEngine'

export function MissionDetailWorkspace({ missionId, organizationId, backHref, canWrite, showTechnicalProof = false }: { missionId: string; organizationId: string; backHref: string; canWrite: boolean; showTechnicalProof?: boolean }) {
  const [mission, setMission] = useState<ActionMission | null>(null)
  const [plan, setPlan] = useState<MissionPlan | null>(null)
  const [actions, setActions] = useState<MissionActionRun[]>([])
  const [approvals, setApprovals] = useState<MissionApproval[]>([])
  const [metrics, setMetrics] = useState<MissionMetrics>({})
  const [economics, setEconomics] = useState<MissionEconomics | null>(null)
  const [context, setContext] = useState<MissionContextPreview | null>(null)
  const [operationalControls, setOperationalControls] = useState<MissionOperationalControls | null>(null)
  const [artifacts, setArtifacts] = useState<MissionArtifact[]>([])
  const [humanTask, setHumanTask] = useState<MissionActionRun | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string>()
  const [error, setError] = useState<string | null>(null)
  const [shareOpen, setShareOpen] = useState(false)

  const load = useCallback(async () => {
    const [missionData, plans, actionData, approvalData, metricData, economicsData, contextData, controlsData, artifactData] = await Promise.all([
      actionEngineService.getMission(missionId, organizationId), actionEngineService.listPlans(missionId, organizationId),
      actionEngineService.listActions(missionId, organizationId), actionEngineService.listApprovals(missionId, organizationId),
      actionEngineService.getMetrics(missionId, organizationId), actionEngineService.getEconomics(missionId, organizationId),
      actionEngineService.previewMissionContext(missionId, organizationId),
      actionEngineService.getOperationalControls(missionId, organizationId).catch(() => null),
      actionEngineService.listArtifacts(missionId, organizationId).catch(() => []),
    ])
    const selected = plans[0] ? await actionEngineService.getPlan(plans[0].id, organizationId) : null
    setMission(missionData); setPlan(selected); setActions(actionData); setApprovals(approvalData); setMetrics(metricData); setEconomics(economicsData); setContext(contextData); setOperationalControls(controlsData); setArtifacts(artifactData)
  }, [missionId, organizationId])

  useEffect(() => { let active = true; setLoading(true); load().catch(cause => { if (active) setError(cause instanceof Error ? cause.message : 'Não foi possível abrir a missão.') }).finally(() => { if (active) setLoading(false) }); return () => { active = false } }, [load])

  async function run(key: string, work: () => Promise<unknown>, refresh = true) { setBusy(key); setError(null); try { await work(); if (refresh) await load() } catch (cause) { if (cause instanceof ApiClientError && cause.status === 409) { await load(); setError('A missão mudou. A versão mais recente foi carregada para uma nova revisão.') } else setError(cause instanceof Error ? cause.message : 'A operação não pôde ser concluída.') } finally { setBusy(undefined) } }
  if (loading) return <div className="grid min-h-72 place-items-center"><Loader2 className="h-6 w-6 animate-spin text-[#2563EB]" /></div>
  if (!mission) return <div className="border border-red-200 bg-red-50 p-5 text-sm text-red-700">{error ?? 'Missão não encontrada.'}</div>

  const command = (key: 'qualify' | 'plan' | 'start' | 'pause' | 'resume' | 'evaluate' | 'cancel') => {
    if (key === 'plan') return void run(key, () => actionEngineService.planMission(mission))
    if (key === 'start') return void run(key, () => actionEngineService.startMission(mission))
    if (key === 'evaluate') return void run(key, () => actionEngineService.evaluateMission(mission))
    return void run(key, () => actionEngineService.command(mission, key, `Comando ${key} solicitado pela operação`))
  }
  const clarification = mission.packSelection.clarification
  return <>{error && <div className="mb-4 border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}{clarification?.questions.length ? <div className="mb-6"><MissionClarificationPanel key={`${mission.version}:${clarification.contextSnapshotId ?? ''}`} questions={clarification.questions} context={context} canWrite={canWrite} busy={busy === 'clarification'} onSubmit={answers => void run('clarification', () => actionEngineService.answerMissionClarification(mission.id, { organizationId, expectedVersion: mission.version, answers }))} /></div> : null}<MissionDetail mission={mission} plan={plan} actions={actions} approvals={approvals} artifacts={artifacts} metrics={metrics} economics={economics} operationalControls={operationalControls} backHref={backHref} canWrite={canWrite} showTechnicalProof={showTechnicalProof} busy={busy} onCommand={command} onApprovePlan={approval => plan && void run('approve-plan', () => actionEngineService.approvePlan(mission, plan, approval))} onShareSimulation={() => setShareOpen(true)} onApprovalDecision={(approval, decision, reasonKey, comment) => void run(`approval:${approval.id}`, () => actionEngineService.decideApproval(organizationId, approval, decision, reasonKey, comment))} onRetryAction={action => void run(`action:${action.id}`, () => actionEngineService.retryAction(organizationId, action.id))} onResolveHuman={setHumanTask} onRefreshArtifacts={() => void run('artifacts', () => load(), false)} onRequestAutonomyGrant={() => void run('grant:request', () => actionEngineService.requestAutonomyGrant(mission))} onApproveAutonomyGrant={grant => void run(`grant:${grant.id}:approve`, () => actionEngineService.approveAutonomyGrant(mission, grant))} onRevokeAutonomyGrant={(grant, reason) => void run(`grant:${grant.id}:revoke`, () => actionEngineService.revokeAutonomyGrant(mission, grant, reason))} onCapabilityControl={(capability, disabled, reason) => void run(`capability:${capability.capabilityKey}@${capability.capabilityVersion}`, () => actionEngineService.setCapabilityControl(mission.id, { organizationId, capabilityKey: capability.capabilityKey, capabilityVersion: capability.capabilityVersion, disabled, reason }))} />{plan ? <MissionSimulationShareDialog open={shareOpen} mission={mission} plan={plan} onOpenChange={setShareOpen} /> : null}<HumanTaskResolutionDialog action={humanTask} busy={Boolean(humanTask && busy === `action:${humanTask.id}`)} onCancel={() => setHumanTask(null)} onConfirm={actualMinutes => humanTask && void run(`action:${humanTask.id}`, () => actionEngineService.resolveHumanTask(organizationId, humanTask.id, actualMinutes)).then(() => setHumanTask(null))} /></>
}
