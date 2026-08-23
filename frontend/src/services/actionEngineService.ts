import { apiRequest } from '@/lib/apiClient'
import type {
  ActionMission, ActionPack, ClarificationAnswerInput, CreateMissionInput, CreateMissionIntentInput,
  MissionActionRun, MissionApproval, MissionContextPreview, MissionEconomics, MissionMetrics,
  MissionPlan, MissionReadiness, MissionStatus,
  PublicSimulationReport, SimulationReportShare,
} from '@/types/actionEngine'

function query(params: Record<string, string | number | undefined>) {
  const value = new URLSearchParams()
  for (const [key, item] of Object.entries(params)) if (item !== undefined) value.set(key, String(item))
  return value.toString()
}

const root = '/action-engine'

export const actionEngineService = {
  listPacks: () => apiRequest<ActionPack[]>(`${root}/action-packs`),
  readiness: (input: {
    organizationId: string; contractId?: string; targetRevenueBrl: string; deadlineAt: string;
    maxTotalCostBrl: string; maxHumanHours: string; humanHourlyRateBrl: string;
  }) => apiRequest<MissionReadiness>(`${root}/readiness`, { method: 'POST', body: input }),
  listMissions: (organizationId: string, status?: MissionStatus) =>
    apiRequest<ActionMission[]>(`${root}/missions?${query({ organizationId, status })}`),
  getMission: (missionId: string, organizationId: string) =>
    apiRequest<ActionMission>(`${root}/missions/${missionId}?${query({ organizationId })}`),
  createMission: (input: CreateMissionInput) => apiRequest<ActionMission>(`${root}/missions`, {
    method: 'POST', body: input, headers: { 'Idempotency-Key': crypto.randomUUID() },
  }),
  createMissionIntent: (input: CreateMissionIntentInput) => apiRequest<ActionMission>(`${root}/missions/intents`, {
    method: 'POST', body: input, headers: { 'Idempotency-Key': crypto.randomUUID() },
  }),
  answerMissionClarification: (missionId: string, input: ClarificationAnswerInput) =>
    apiRequest<ActionMission>(`${root}/missions/${missionId}/clarification`, { method: 'POST', body: input }),
  previewMissionContext: (missionId: string, organizationId: string) =>
    apiRequest<MissionContextPreview>(`${root}/missions/${missionId}/context-preview?${query({ organizationId })}`),
  command: (mission: ActionMission, command: 'qualify' | 'pause' | 'resume' | 'cancel', reason: string) =>
    apiRequest<ActionMission>(`${root}/missions/${mission.id}/${command}`, {
      method: 'POST', body: { organizationId: mission.organizationId, expectedVersion: mission.version, reason },
    }),
  planMission: (mission: ActionMission) => apiRequest<{ missionId: string; missionVersion: number; jobId: string | null }>(`${root}/missions/${mission.id}/plan`, {
    method: 'POST', body: { organizationId: mission.organizationId, expectedVersion: mission.version, reason: 'Plano solicitado pela interface de Missions' },
  }),
  startMission: (mission: ActionMission) => apiRequest<ActionMission>(`${root}/missions/${mission.id}/start`, {
    method: 'POST', body: { organizationId: mission.organizationId, expectedVersion: mission.version, reason: 'Execução autorizada pela interface de Missions' },
  }),
  evaluateMission: (mission: ActionMission) => apiRequest<{ missionId: string; checkpointKey: string; jobId: string | null }>(`${root}/missions/${mission.id}/evaluate`, {
    method: 'POST', body: { organizationId: mission.organizationId, checkpointKey: `manual-${Date.now()}` },
  }),
  listPlans: (missionId: string, organizationId: string) => apiRequest<MissionPlan[]>(`${root}/missions/${missionId}/plans?${query({ organizationId })}`),
  getPlan: (planId: string, organizationId: string) => apiRequest<MissionPlan>(`${root}/plans/${planId}?${query({ organizationId })}`),
  approvePlan: (mission: ActionMission, plan: MissionPlan, approval: MissionApproval) => apiRequest<ActionMission>(`${root}/plans/${plan.id}/submit`, {
    method: 'POST', body: {
      organizationId: mission.organizationId, missionId: mission.id, approvalId: approval.id,
      expectedMissionVersion: mission.version, subjectHash: approval.subjectHash, decision: 'approved', reason: 'Impacto e plano protegidos revisados e aprovados',
    },
  }),
  listActions: (missionId: string, organizationId: string) => apiRequest<MissionActionRun[]>(`${root}/missions/${missionId}/actions?${query({ organizationId })}`),
  listApprovals: (missionId: string, organizationId: string) => apiRequest<MissionApproval[]>(`${root}/missions/${missionId}/approvals?${query({ organizationId })}`),
  decideApproval: (organizationId: string, approval: MissionApproval, decision: 'approved' | 'rejected' | 'changes_requested', comment: string) =>
    apiRequest(`${root}/approvals/${approval.id}/decide`, { method: 'POST', body: { organizationId, subjectHash: approval.subjectHash, decision, comment } }),
  retryAction: (organizationId: string, actionId: string) => apiRequest(`${root}/actions/${actionId}/retry`, { method: 'POST', body: { organizationId, reason: 'Nova tentativa solicitada pela operação' } }),
  resolveHumanTask: (organizationId: string, actionId: string, actualMinutes: number) => apiRequest(`${root}/actions/${actionId}/resolve-human-task`, {
    method: 'POST', body: { organizationId, actualMinutes, result: { resolvedFrom: 'missions_ui' } },
  }),
  getMetrics: (missionId: string, organizationId: string) => apiRequest<MissionMetrics>(`${root}/missions/${missionId}/metrics?${query({ organizationId })}`),
  getEconomics: (missionId: string, organizationId: string) => apiRequest<MissionEconomics>(`${root}/missions/${missionId}/economics?${query({ organizationId })}`),
  createSimulationReport: (mission: ActionMission, planId: string, expiresInDays: number) => apiRequest<SimulationReportShare>(`${root}/missions/${mission.id}/simulation-reports`, {
    method: 'POST', body: { organizationId: mission.organizationId, planId, expiresInDays },
  }),
  revokeSimulationReport: (organizationId: string, reportId: string) => apiRequest<{ id: string; revoked: true }>(`${root}/simulation-reports/${reportId}/revoke`, {
    method: 'POST', body: { organizationId },
  }),
  getPublicSimulationReport: (token: string) => apiRequest<PublicSimulationReport>(`${root}/public/simulation-reports/${encodeURIComponent(token)}`),
  submitSimulationFeedback: (token: string, input: { reviewerName: string; decision: 'support' | 'request_changes' | 'reject'; reasonKey?: string; comment?: string }) =>
    apiRequest<{ id: string; decision: string; createdAt: string; executionApproved: false }>(`${root}/public/simulation-reports/${encodeURIComponent(token)}/feedback`, { method: 'POST', body: input }),
  simulationPdfHref: (token: string) => `/api${root}/public/simulation-reports/${encodeURIComponent(token)}/pdf`,
}
