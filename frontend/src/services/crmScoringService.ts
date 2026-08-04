import { apiRequest } from '@/lib/apiClient'
import type { LeadScoreEvent, LeadScoringModel, LeadScoringRule } from '@/types/crm'

export type ScoringModelResponse = { model: LeadScoringModel | null; rules: LeadScoringRule[] }
export type ScoringRuleInput = Omit<LeadScoringRule, 'id' | 'createdAt' | 'updatedAt' | 'isActive' | 'modelId'> & { modelId: string }

export const crmScoringService = {
  async getModel(crmInstanceId: string) {
    return apiRequest<ScoringModelResponse>(`/crm/scoring/model?crmInstanceId=${encodeURIComponent(crmInstanceId)}`)
  },
  async updateModel(id: string, input: Pick<LeadScoringModel, 'name' | 'fitWeight' | 'intentWeight' | 'thresholds'>) {
    return apiRequest<LeadScoringModel>(`/crm/scoring/model/${id}`, { method: 'PATCH', body: input })
  },
  async createRule(input: ScoringRuleInput) {
    return apiRequest<LeadScoringRule>('/crm/scoring/rules', { method: 'POST', body: input })
  },
  async updateRule(id: string, input: Partial<ScoringRuleInput>) {
    return apiRequest<LeadScoringRule>(`/crm/scoring/rules/${id}`, { method: 'PATCH', body: input })
  },
  async deactivateRule(id: string) {
    return apiRequest<{ success: boolean }>(`/crm/scoring/rules/${id}`, { method: 'DELETE' })
  },
  async simulate(input: { crmInstanceId: string; leadId: string; eventType: string; payload?: Record<string, unknown> }) {
    return apiRequest<{ persisted: false; appliedRules: Array<{ id: string; name: string; dimension: string; points: number }>; currentFitScore: number; currentIntentScore: number; resultingFitScore: number; resultingIntentScore: number; resultingCombinedScore: number }>('/crm/scoring/simulate', { method: 'POST', body: input })
  },
  async getLeadScoreEvents(leadId: string) {
    return apiRequest<LeadScoreEvent[]>(`/crm/leads/${leadId}/score-events`)
  },
  async adjustLeadScore(leadId: string, input: { dimension: 'fit' | 'intent'; points: number; reason: string }) {
    return apiRequest<{ leadId: string; fitScore: number; intentScore: number; score: number; reason: string }>(`/crm/leads/${leadId}/score-adjustments`, { method: 'POST', body: input })
  },
}
