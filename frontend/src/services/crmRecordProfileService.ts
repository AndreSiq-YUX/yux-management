import { apiRequest } from '@/lib/apiClient'
import type { CrmCustomField, CrmProfileConfiguration, CrmRecordType, LeadProfile, LeadProfileInput } from '@/types/crmRecordProfile'

export const crmRecordProfileService = {
  getConfiguration(crmInstanceId: string) {
    return apiRequest<CrmProfileConfiguration>(`/crm/record-profile/configuration?crmInstanceId=${encodeURIComponent(crmInstanceId)}`)
  },
  createRecordType(crmInstanceId: string, name: string) {
    return apiRequest<CrmRecordType>('/crm/record-types', { method: 'POST', body: { crmInstanceId, name } })
  },
  patchRecordType(id: string, patch: { name?: string; isActive?: boolean }) {
    return apiRequest<CrmRecordType>(`/crm/record-types/${id}`, { method: 'PATCH', body: patch })
  },
  createField(input: Pick<CrmCustomField, 'crmInstanceId' | 'recordTypeId' | 'label' | 'fieldType' | 'options' | 'required' | 'orderIndex'>) {
    return apiRequest<CrmCustomField>('/crm/custom-fields', { method: 'POST', body: input })
  },
  patchField(id: string, patch: { label?: string; required?: boolean; isActive?: boolean; orderIndex?: number }) {
    return apiRequest<CrmCustomField>(`/crm/custom-fields/${id}`, { method: 'PATCH', body: patch })
  },
  getProfile(leadId: string) {
    return apiRequest<LeadProfile>(`/crm/leads/${leadId}/profile`)
  },
  saveProfile(leadId: string, input: LeadProfileInput) {
    return apiRequest<LeadProfileInput>(`/crm/leads/${leadId}/profile`, { method: 'PUT', body: input })
  },
}
