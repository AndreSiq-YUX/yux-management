import { apiRequest } from '@/lib/apiClient'
import type {
  QualificationField,
  QualificationRule,
  QualificationSummary,
} from '@/types/crmQualification'
export const crmQualificationService = {
  fields: (id: string) =>
    apiRequest<QualificationField[]>(
      `/crm/scoring/fields?crmInstanceId=${encodeURIComponent(id)}`,
    ),
  rules: (id: string) =>
    apiRequest<QualificationRule[]>(
      `/crm/scoring/qualification-rules?crmInstanceId=${encodeURIComponent(id)}`,
    ),
  create: (crmInstanceId: string, input: QualificationRule) => {
    const { id, ...rule } = input
    return apiRequest<QualificationRule>('/crm/scoring/qualification-rules', {
      method: 'POST',
      body: { id, crmInstanceId, rule },
    })
  },
  remove: (id: string) =>
    apiRequest(`/crm/scoring/qualification-rules/${id}`, { method: 'DELETE' }),
  summary: (leadId: string) =>
    apiRequest<QualificationSummary | null>(
      `/crm/leads/${leadId}/qualification`,
    ),
  temperature: (
    crmInstanceId: string,
    warmThreshold: number,
    hotThreshold: number,
  ) =>
    apiRequest('/crm/scoring/temperature', {
      method: 'PATCH',
      body: { crmInstanceId, warmThreshold, hotThreshold },
    }),
  recalculate: (crmInstanceId: string, preview = true, afterId?: string) =>
    apiRequest<{
      preview: boolean
      results: Array<QualificationSummary | null>
      nextCursor: string | null
    }>('/crm/scoring/recalculate', {
      method: 'POST',
      body: { crmInstanceId, preview, afterId },
    }),
}
