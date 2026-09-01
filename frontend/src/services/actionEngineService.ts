import { apiRequest } from '@/lib/apiClient'
import type {
  ActionMission, ActionPack, ClarificationAnswerInput, CreateMissionInput, CreateMissionIntentInput, DecisionReasonKey,
  MissionActionRun, MissionApproval, MissionContextPreview, MissionEconomics, MissionMetrics,
  MissionArtifact, MissionOperationalControls, MissionPlan, MissionReadiness, MissionStatus,
  MissionAutonomyGrant,
  MissionConversation,
  MissionRecipe, PublicSimulationReport, SandboxSeedManifest, SimulationReportShare,
  LearningExperiment, MissionLearningWorkspace,
} from '@/types/actionEngine'

function query(params: Record<string, string | number | undefined>) {
  const value = new URLSearchParams()
  for (const [key, item] of Object.entries(params)) if (item !== undefined) value.set(key, String(item))
  return value.toString()
}

const root = '/action-engine'

export const actionEngineService = {
  createMissionConversation: (input: {
    organizationId: string; contractId?: string; title?: string; message: string;
    clientMessageId?: string; idempotencyKey?: string;
  }) => {
    const clientMessageId = input.clientMessageId ?? crypto.randomUUID()
    const idempotencyKey = input.idempotencyKey ?? crypto.randomUUID()
    return apiRequest<{ conversation: MissionConversation; jobId: string | null }>(`${root}/mission-conversations`, {
      method: 'POST', headers: { 'Idempotency-Key': idempotencyKey }, body: { ...input, clientMessageId, idempotencyKey: undefined },
    })
  },
  listMissionConversations: (organizationId: string) =>
    apiRequest<MissionConversation[]>(`${root}/mission-conversations?${query({ organizationId })}`),
  getMissionConversation: (conversationId: string, organizationId: string) =>
    apiRequest<MissionConversation>(`${root}/mission-conversations/${conversationId}?${query({ organizationId })}`),
  appendMissionConversationMessage: (conversationId: string, input: {
    organizationId: string; expectedVersion: number; message: string; clientMessageId?: string;
  }) => apiRequest<{ conversation: MissionConversation; jobId: string | null }>(`${root}/mission-conversations/${conversationId}/messages`, {
    method: 'POST', body: { ...input, clientMessageId: input.clientMessageId ?? crypto.randomUUID() },
  }),
  confirmMissionConversationBrief: (conversationId: string, input: {
    organizationId: string; expectedVersion: number; briefHash: string;
  }) => apiRequest<{ conversation: MissionConversation; missionId: string; jobId: string | null }>(`${root}/mission-conversations/${conversationId}/confirm`, {
    method: 'POST', body: input,
  }),
  cancelMissionConversation: (conversationId: string, input: { organizationId: string; expectedVersion: number }) =>
    apiRequest<MissionConversation>(`${root}/mission-conversations/${conversationId}/cancel`, { method: 'POST', body: input }),
  listPacks: () => apiRequest<ActionPack[]>(`${root}/action-packs`),
  listRecipes: (organizationId: string) => apiRequest<MissionRecipe[]>(`${root}/mission-recipes?${query({ organizationId })}`),
  seedRecipeSandbox: (organizationId: string, recipe: Pick<MissionRecipe, 'key' | 'version'>) =>
    apiRequest<SandboxSeedManifest>(`${root}/mission-recipes/${encodeURIComponent(recipe.key)}/versions/${recipe.version}/seed-sandbox`, { method: 'POST', body: { organizationId } }),
  cleanupSandbox: (organizationId: string, manifestId: string) =>
    apiRequest<{ manifestId: string; status: string; deleted: string[]; modified: string[] }>(`${root}/sandbox-seeds/${manifestId}`, { method: 'DELETE', body: { organizationId } }),
  readiness: (input: {
    organizationId: string; contractId?: string; targetRevenueBrl: string; deadlineAt: string;
    maxTotalCostBrl: string; maxHumanHours: string; humanHourlyRateBrl: string; packKey?: 'revenue_recovery' | 'funnel_nurture' | 'campaign_launch';
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
  listArtifacts: (missionId: string, organizationId: string) => apiRequest<MissionArtifact[]>(`${root}/missions/${missionId}/artifacts?${query({ organizationId })}`),
  listApprovals: (missionId: string, organizationId: string) => apiRequest<MissionApproval[]>(`${root}/missions/${missionId}/approvals?${query({ organizationId })}`),
  decideApproval: (organizationId: string, approval: MissionApproval, decision: 'approved' | 'rejected' | 'changes_requested', reasonKey?: DecisionReasonKey, comment?: string) =>
    apiRequest(`${root}/approvals/${approval.id}/decide`, { method: 'POST', body: { organizationId, subjectHash: approval.subjectHash, decision, reasonKey, comment } }),
  retryAction: (organizationId: string, actionId: string) => apiRequest(`${root}/actions/${actionId}/retry`, { method: 'POST', body: { organizationId, reason: 'Nova tentativa solicitada pela operação' } }),
  resolveHumanTask: (organizationId: string, actionId: string, actualMinutes: number) => apiRequest(`${root}/actions/${actionId}/resolve-human-task`, {
    method: 'POST', body: { organizationId, actualMinutes, result: { resolvedFrom: 'missions_ui' } },
  }),
  getMetrics: (missionId: string, organizationId: string) => apiRequest<MissionMetrics>(`${root}/missions/${missionId}/metrics?${query({ organizationId })}`),
  getEconomics: (missionId: string, organizationId: string) => apiRequest<MissionEconomics>(`${root}/missions/${missionId}/economics?${query({ organizationId })}`),
  getOperationalControls: (missionId: string, organizationId: string) => apiRequest<MissionOperationalControls>(`${root}/missions/${missionId}/operational-controls?${query({ organizationId })}`),
  requestAutonomyGrant: (mission: ActionMission) => apiRequest<MissionAutonomyGrant>(`${root}/missions/${mission.id}/autonomy-grants`, {
    method: 'POST', body: { organizationId: mission.organizationId, expectedMissionVersion: mission.version, envelope: mission.autonomyEnvelope },
  }),
  approveAutonomyGrant: (mission: ActionMission, grant: MissionAutonomyGrant) => apiRequest<MissionAutonomyGrant>(`${root}/missions/${mission.id}/autonomy-grants/${grant.id}/approve`, {
    method: 'POST', body: { organizationId: mission.organizationId, expectedMissionVersion: grant.missionVersion, subjectHash: grant.envelopeHash },
  }),
  revokeAutonomyGrant: (mission: ActionMission, grant: MissionAutonomyGrant, reason: string) => apiRequest<MissionAutonomyGrant>(`${root}/missions/${mission.id}/autonomy-grants/${grant.id}/revoke`, {
    method: 'POST', body: { organizationId: mission.organizationId, reason },
  }),
  setCapabilityControl: (missionId: string, input: { organizationId: string; capabilityKey: string; capabilityVersion: number; disabled: boolean; reason: string }) =>
    apiRequest(`${root}/missions/${missionId}/capability-controls`, { method: 'POST', body: input }),
  createSimulationReport: (mission: ActionMission, planId: string, expiresInDays: number) => apiRequest<SimulationReportShare>(`${root}/missions/${mission.id}/simulation-reports`, {
    method: 'POST', body: { organizationId: mission.organizationId, planId, expiresInDays },
  }),
  revokeSimulationReport: (organizationId: string, reportId: string) => apiRequest<{ id: string; revoked: true }>(`${root}/simulation-reports/${reportId}/revoke`, {
    method: 'POST', body: { organizationId },
  }),
  getPublicSimulationReport: (token: string) => apiRequest<PublicSimulationReport>(`${root}/public/simulation-reports/${encodeURIComponent(token)}`),
  submitSimulationFeedback: (token: string, input: { reviewerName: string; decision: 'support' | 'request_changes' | 'reject'; reasonKey?: DecisionReasonKey; comment?: string }) =>
    apiRequest<{ id: string; decision: string; createdAt: string; executionApproved: false }>(`${root}/public/simulation-reports/${encodeURIComponent(token)}/feedback`, { method: 'POST', body: input }),
  simulationPdfHref: (token: string) => `/api${root}/public/simulation-reports/${encodeURIComponent(token)}/pdf`,
  listLearning: (organizationId: string) => apiRequest<Pick<MissionLearningWorkspace,'memories'|'recommendations'>>(`${root}/learning?${query({organizationId})}`),
  reviewLearningMemory: (organizationId:string,memoryId:string,decision:'approved'|'rejected') =>
    apiRequest(`${root}/learning/memories/${memoryId}/review`,{method:'POST',body:{organizationId,decision}}),
  listLearningExperiments: (organizationId:string) => apiRequest<Pick<MissionLearningWorkspace,'experiments'|'promotions'>>(`${root}/learning/experiments?${query({organizationId})}`),
  createLearningExperiment: (organizationId:string,recommendationId:string,candidateConfig:Record<string,unknown>) =>
    apiRequest<LearningExperiment>(`${root}/learning/recommendations/${recommendationId}/experiments`,{method:'POST',body:{organizationId,candidateConfig}}),
  completeLearningExperiment: (organizationId:string,experimentId:string,input:{candidateMetrics:Record<string,string>;goldenCorpusHash:string;goldenGatePassed:boolean}) =>
    apiRequest<LearningExperiment>(`${root}/learning/experiments/${experimentId}/complete`,{method:'POST',body:{organizationId,...input}}),
  decideLearningExperiment: (organizationId:string,experimentId:string,decision:'approved'|'rejected') =>
    apiRequest(`${root}/learning/experiments/${experimentId}/decision`,{method:'POST',body:{organizationId,decision}}),
}
