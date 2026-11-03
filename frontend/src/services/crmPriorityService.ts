import { apiRequest } from '@/lib/apiClient'
import type {
  CreatePrioritySignal,
  LeadPriority,
  LeadPrioritySignal,
  PriorityConfiguration,
  PriorityDefinition,
  PriorityPreview,
  PriorityTransition,
} from '@/types/crmPriority'

type ActivationCommand = {
  crmInstanceId: string
  expectedActivationId: string | null
  requestId: string
}
type ActivationResult = { activationId: string | null; versionId: string | null }
const base = '/crm/priority'
const signals = (leadId: string) => `/crm/leads/${leadId}/priority-signals`
export const crmPriorityService = {
  model: (crmInstanceId: string) =>
    apiRequest<PriorityConfiguration>(
      `${base}/model?crmInstanceId=${encodeURIComponent(crmInstanceId)}`,
    ),
  save: (body: {
    crmInstanceId: string
    expectedRevision: number
    definition: PriorityDefinition
  }) =>
    apiRequest<{ revision: number; draft: PriorityDefinition }>(`${base}/draft`, {
      method: 'PUT',
      body,
    }),
  preview: (body: { crmInstanceId: string; revision: number; runId?: string; afterId?: string }) =>
    apiRequest<PriorityPreview>(`${base}/preview`, { method: 'POST', body }),
  publish: (body: ActivationCommand & { revision: number; runId: string }) =>
    apiRequest<ActivationResult>(`${base}/publish`, { method: 'POST', body }),
  activate: (body: ActivationCommand & { versionId: string | null }) =>
    apiRequest<ActivationResult>(`${base}/activate`, { method: 'POST', body }),
  setEffects: (body: { crmInstanceId: string; expectedActivationId: string; enabled: boolean }) =>
    apiRequest<{ effectsEnabled: boolean }>(`${base}/effects`, { method: 'PATCH', body }),
  lead: (leadId: string) => apiRequest<LeadPriority | null>(`/crm/leads/${leadId}/priority`),
  history: (leadId: string) => apiRequest<{items:PriorityTransition[]}>(`/crm/leads/${leadId}/priority/history`),
  signals: (leadId: string) => apiRequest<{ items: LeadPrioritySignal[] }>(signals(leadId)),
  addSignal: (leadId: string, body: CreatePrioritySignal) =>
    apiRequest<LeadPrioritySignal>(signals(leadId), { method: 'POST', body }),
  revokeSignal: (leadId: string, id: string, body: { requestId: string; reason: string }) =>
    apiRequest<LeadPrioritySignal>(`${signals(leadId)}/${id}/revoke`, { method: 'POST', body }),
}
