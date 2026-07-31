import { apiRequest } from '@/lib/apiClient'
import type { BillingCycle } from '@/types/platform'
import type {
  AiGenerationRun,
  CommercialDiagnostic,
  ProposalConversionRun,
  ProposalDecision,
  ProposalDecisionValue,
  ProposalDraft,
  ProposalItem,
  ProposalPriceRule,
  ProposalStatus,
  ProposalVersion,
  ProposalVersionStatus,
} from '@/types/proposal'

const numberValue = (value: number | string | null | undefined) => Number(value || 0)

export function mapProposalItem(row: any): ProposalItem {
  return {
    id: row.id,
    proposalId: row.proposal_id,
    itemKey: row.item_key,
    label: row.label,
    description: row.description || undefined,
    quantity: numberValue(row.quantity),
    unitValue: numberValue(row.unit_value),
    totalValue: numberValue(row.total_value),
    orderIndex: row.order_index,
  }
}

export function mapProposal(row: any): ProposalDraft {
  return {
    id: row.id,
    organizationId: row.organization_id,
    leadId: row.lead_id,
    crmInstanceId: row.crm_instance_id || undefined,
    clientId: row.client_id || undefined,
    packageId: row.package_id,
    recommendedPackageId: row.recommended_package_id || undefined,
    blueprintId: row.blueprint_id || undefined,
    assignedTo: row.assigned_to || undefined,
    status: row.status as ProposalStatus,
    title: row.title,
    scope: row.scope || '',
    whatsappMessage: row.whatsapp_message || undefined,
    emailSubject: row.email_subject || undefined,
    emailBody: row.email_body || undefined,
    billingCycle: row.billing_cycle as BillingCycle,
    selectedModuleKeys: row.selected_module_keys || [],
    finalValue: numberValue(row.final_value),
    overrideReason: row.override_reason || undefined,
    currentVersionId: row.current_version_id || undefined,
    convertedClientId: row.converted_client_id || undefined,
    contractId: row.contract_id || undefined,
    projectId: row.project_id || undefined,
    items: (row.proposal_items || []).map(mapProposalItem),
  }
}

export function mapProposalSnapshot(snapshot: any) {
  if (snapshot.organizationId) return structuredClone(snapshot)
  return {
    id: snapshot.id,
    organizationId: snapshot.organization_id,
    leadId: snapshot.lead_id,
    clientId: snapshot.client_id || undefined,
    packageId: snapshot.package_id,
    blueprintId: snapshot.blueprint_id || undefined,
    assignedTo: snapshot.assigned_to || undefined,
    status: snapshot.status,
    title: snapshot.title,
    scope: snapshot.scope || '',
    whatsappMessage: snapshot.whatsapp_message || undefined,
    emailSubject: snapshot.email_subject || undefined,
    emailBody: snapshot.email_body || undefined,
    billingCycle: snapshot.billing_cycle,
    selectedModuleKeys: snapshot.selected_module_keys || [],
    finalValue: numberValue(snapshot.final_value),
    overrideReason: snapshot.override_reason || undefined,
    items: (snapshot.items || []).map(mapProposalItem),
  }
}

export function mapProposalVersion(row: any): ProposalVersion {
  return {
    id: row.id,
    proposalId: row.proposal_id,
    versionNumber: row.version_number,
    snapshot: mapProposalSnapshot(row.snapshot),
    status: row.status as ProposalVersionStatus,
    sentAt: row.sent_at,
    decidedAt: row.decided_at || undefined,
  }
}

const buildQuery = (params: Record<string, string | undefined>) => {
  const search = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value) search.set(key, value)
  })
  const query = search.toString()
  return query ? `?${query}` : ''
}

export const proposalService = {
  async getQueue(organizationId: string, filters: Partial<{ status: ProposalStatus; leadId: string; packageId: string; assignedTo: string }> = {}) {
    return apiRequest<ProposalDraft[]>(`/proposals${buildQuery({
      organizationId,
      status: filters.status,
      leadId: filters.leadId,
      packageId: filters.packageId,
      assignedTo: filters.assignedTo,
    })}`)
  },

  async getById(proposalId: string) {
    return apiRequest<ProposalDraft>(`/proposals/${proposalId}`)
  },

  async getByLead(leadId: string) {
    return apiRequest<ProposalDraft[]>(`/proposals/by-lead/${leadId}`)
  },

  async getPortalProposals() {
    return apiRequest<ProposalDraft[]>('/proposals/portal')
  },

  async getVersions(proposalId: string) {
    return apiRequest<ProposalVersion[]>(`/proposals/${proposalId}/versions`)
  },

  async getDecisions(versionIds: string[]) {
    if (!versionIds.length) return []
    return apiRequest<ProposalDecision[]>(`/proposals/decisions?versionIds=${encodeURIComponent(versionIds.join(','))}`)
  },

  async getDiagnostic(leadId: string) {
    return apiRequest<CommercialDiagnostic | null>(`/proposals/diagnostics/${leadId}`)
  },

  async saveDiagnostic(input: Omit<CommercialDiagnostic, 'id' | 'createdAt' | 'updatedAt'>) {
    return apiRequest<CommercialDiagnostic>('/proposals/diagnostics', {
      method: 'PUT',
      body: input,
    })
  },

  async getPriceRules(organizationId: string, packageId: string) {
    return apiRequest<ProposalPriceRule[]>(`/proposals/price-rules${buildQuery({ organizationId, packageId })}`)
  },

  async createDraft(input: { organizationId: string; leadId: string; packageId: string; crmInstanceId?: string; recommendedPackageId?: string; blueprintId?: string; title: string; billingCycle?: BillingCycle; selectedModuleKeys?: string[] }) {
    return apiRequest<ProposalDraft>('/proposals', {
      method: 'POST',
      body: input,
    })
  },

  async updateDraft(proposalId: string, input: Partial<Pick<ProposalDraft, 'title' | 'scope' | 'whatsappMessage' | 'emailSubject' | 'emailBody' | 'packageId' | 'blueprintId' | 'billingCycle' | 'selectedModuleKeys' | 'finalValue' | 'overrideReason'>>) {
    return apiRequest<ProposalDraft>(`/proposals/${proposalId}`, {
      method: 'PATCH',
      body: input,
    })
  },

  async replaceItems(proposalId: string, items: Omit<ProposalItem, 'id' | 'proposalId' | 'totalValue'>[]) {
    return apiRequest<ProposalItem[]>(`/proposals/${proposalId}/items`, {
      method: 'PUT',
      body: items,
    })
  },

  async submitPortalDecision(proposalVersionId: string, decision: ProposalDecisionValue, comment?: string, decidedBy?: string) {
    return apiRequest<ProposalDecision>('/proposals/decisions', {
      method: 'POST',
      body: { proposalVersionId, decision, comment, decidedBy },
    })
  },

  async getGenerationRuns(proposalId: string) {
    return apiRequest<AiGenerationRun[]>(`/proposals/${proposalId}/generation-runs`)
  },

  async getConversionRuns(proposalId: string) {
    return apiRequest<ProposalConversionRun[]>(`/proposals/${proposalId}/conversion-runs`)
  },

  async generateDraft(proposalId: string) {
    return apiRequest(`/proposals/${proposalId}/generate-draft`, { method: 'POST' })
  },

  async send(proposalId: string) {
    return apiRequest<{ success: boolean; versionId: string; versionNumber: number; expiresAt: string; publicUrl: string }>(`/proposals/${proposalId}/send`, { method: 'POST' })
  },

  async retryConversion(proposalId: string) {
    return apiRequest(`/proposals/${proposalId}/retry-conversion`, { method: 'POST' })
  },

  async getPublicReview(token: string) {
    const data = await apiRequest<any>(`/public/proposals/${encodeURIComponent(token)}/decision`)
    return { ...data, snapshot: mapProposalSnapshot(data.snapshot) }
  },

  async submitPublicDecision(token: string, decision: ProposalDecisionValue, comment?: string) {
    return apiRequest(`/public/proposals/${encodeURIComponent(token)}/decision`, {
      method: 'POST',
      body: { decision, comment },
    })
  },
}
