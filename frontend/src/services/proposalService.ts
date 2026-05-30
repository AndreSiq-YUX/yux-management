import { supabase } from '@/lib/supabase'
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
    clientId: row.client_id || undefined,
    packageId: row.package_id,
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

export function mapProposalVersion(row: any): ProposalVersion {
  return {
    id: row.id,
    proposalId: row.proposal_id,
    versionNumber: row.version_number,
    snapshot: structuredClone(row.snapshot),
    status: row.status as ProposalVersionStatus,
    sentAt: row.sent_at,
    decidedAt: row.decided_at || undefined,
  }
}

function mapDiagnostic(row: any): CommercialDiagnostic {
  return {
    id: row.id,
    organizationId: row.organization_id,
    leadId: row.lead_id,
    summary: row.summary || '',
    painPoints: row.pain_points || [],
    goals: row.goals || [],
    budgetRange: row.budget_range || undefined,
    timeline: row.timeline || undefined,
    decisionProcess: row.decision_process || undefined,
    notes: row.notes || undefined,
    createdBy: row.created_by || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapDecision(row: any): ProposalDecision {
  return {
    id: row.id,
    proposalVersionId: row.proposal_version_id,
    decision: row.decision,
    source: row.source,
    comment: row.comment || undefined,
    decidedBy: row.decided_by || undefined,
    createdAt: row.created_at,
  }
}

function mapPriceRule(row: any): ProposalPriceRule {
  return {
    id: row.id,
    organizationId: row.organization_id,
    packageId: row.package_id,
    itemKey: row.item_key,
    label: row.label,
    minimumValue: numberValue(row.minimum_value),
    recommendedValue: numberValue(row.recommended_value),
    maximumValue: numberValue(row.maximum_value),
  }
}

function mapGenerationRun(row: any): AiGenerationRun {
  return {
    id: row.id,
    proposalId: row.proposal_id,
    status: row.status,
    inputSummary: row.input_summary || {},
    resultMetadata: row.result_metadata || {},
    error: row.error || undefined,
    createdAt: row.created_at,
    completedAt: row.completed_at || undefined,
  }
}

function mapConversionRun(row: any): ProposalConversionRun {
  return {
    id: row.id,
    proposalId: row.proposal_id,
    attemptNumber: row.attempt_number,
    status: row.status,
    clientId: row.client_id || undefined,
    contractId: row.contract_id || undefined,
    projectId: row.project_id || undefined,
    error: row.error || undefined,
    createdAt: row.created_at,
    completedAt: row.completed_at || undefined,
  }
}

const proposalSelect = '*, proposal_items(*)'

export const proposalService = {
  async getQueue(organizationId: string, filters: Partial<{ status: ProposalStatus; leadId: string; packageId: string; assignedTo: string }> = {}) {
    let query = supabase.from('proposals').select(proposalSelect).eq('organization_id', organizationId)
    if (filters.status) query = query.eq('status', filters.status)
    if (filters.leadId) query = query.eq('lead_id', filters.leadId)
    if (filters.packageId) query = query.eq('package_id', filters.packageId)
    if (filters.assignedTo) query = query.eq('assigned_to', filters.assignedTo)
    const { data, error } = await query.order('updated_at', { ascending: false })
    if (error) throw error
    return (data || []).map(mapProposal)
  },

  async getById(proposalId: string) {
    const { data, error } = await supabase.from('proposals').select(proposalSelect).eq('id', proposalId).single()
    if (error) throw error
    return mapProposal(data)
  },

  async getByLead(leadId: string) {
    const { data, error } = await supabase.from('proposals').select(proposalSelect).eq('lead_id', leadId).order('updated_at', { ascending: false })
    if (error) throw error
    return (data || []).map(mapProposal)
  },

  async getPortalProposals() {
    const { data, error } = await supabase.from('proposals').select(proposalSelect).order('updated_at', { ascending: false })
    if (error) throw error
    return (data || []).map(mapProposal)
  },

  async getVersions(proposalId: string) {
    const { data, error } = await supabase.from('proposal_versions').select('*').eq('proposal_id', proposalId).order('version_number', { ascending: false })
    if (error) throw error
    return (data || []).map(mapProposalVersion)
  },

  async getDecisions(versionIds: string[]) {
    if (!versionIds.length) return []
    const { data, error } = await supabase.from('proposal_decisions').select('*').in('proposal_version_id', versionIds).order('created_at', { ascending: false })
    if (error) throw error
    return (data || []).map(mapDecision)
  },

  async getDiagnostic(leadId: string) {
    const { data, error } = await supabase.from('commercial_diagnostics').select('*').eq('lead_id', leadId).maybeSingle()
    if (error) throw error
    return data ? mapDiagnostic(data) : null
  },

  async saveDiagnostic(input: Omit<CommercialDiagnostic, 'id' | 'createdAt' | 'updatedAt'>) {
    const { data, error } = await supabase.from('commercial_diagnostics').upsert({
      organization_id: input.organizationId,
      lead_id: input.leadId,
      summary: input.summary,
      pain_points: input.painPoints,
      goals: input.goals,
      budget_range: input.budgetRange || null,
      timeline: input.timeline || null,
      decision_process: input.decisionProcess || null,
      notes: input.notes || null,
      created_by: input.createdBy || null,
    }, { onConflict: 'lead_id' }).select().single()
    if (error) throw error
    return mapDiagnostic(data)
  },

  async getPriceRules(organizationId: string, packageId: string) {
    const { data, error } = await supabase.from('proposal_price_rules').select('*').eq('organization_id', organizationId).eq('package_id', packageId).order('item_key')
    if (error) throw error
    return (data || []).map(mapPriceRule)
  },

  async createDraft(input: { organizationId: string; leadId: string; packageId: string; blueprintId?: string; title: string; billingCycle?: BillingCycle; selectedModuleKeys?: string[] }) {
    const { data, error } = await supabase.from('proposals').insert({
      organization_id: input.organizationId,
      lead_id: input.leadId,
      package_id: input.packageId,
      blueprint_id: input.blueprintId || null,
      title: input.title,
      billing_cycle: input.billingCycle || 'monthly',
      selected_module_keys: input.selectedModuleKeys || [],
    }).select(proposalSelect).single()
    if (error) throw error
    return mapProposal(data)
  },

  async updateDraft(proposalId: string, input: Partial<Pick<ProposalDraft, 'title' | 'scope' | 'whatsappMessage' | 'emailSubject' | 'emailBody' | 'packageId' | 'blueprintId' | 'billingCycle' | 'selectedModuleKeys' | 'finalValue' | 'overrideReason'>>) {
    const payload: Record<string, unknown> = {}
    if (input.title !== undefined) payload.title = input.title
    if (input.scope !== undefined) payload.scope = input.scope
    if (input.whatsappMessage !== undefined) payload.whatsapp_message = input.whatsappMessage
    if (input.emailSubject !== undefined) payload.email_subject = input.emailSubject
    if (input.emailBody !== undefined) payload.email_body = input.emailBody
    if (input.packageId !== undefined) payload.package_id = input.packageId
    if (input.blueprintId !== undefined) payload.blueprint_id = input.blueprintId || null
    if (input.billingCycle !== undefined) payload.billing_cycle = input.billingCycle
    if (input.selectedModuleKeys !== undefined) payload.selected_module_keys = input.selectedModuleKeys
    if (input.finalValue !== undefined) payload.final_value = input.finalValue
    if (input.overrideReason !== undefined) payload.override_reason = input.overrideReason || null
    const { data, error } = await supabase.from('proposals').update(payload).eq('id', proposalId).select(proposalSelect).single()
    if (error) throw error
    return mapProposal(data)
  },

  async replaceItems(proposalId: string, items: Omit<ProposalItem, 'id' | 'proposalId' | 'totalValue'>[]) {
    const { error: deleteError } = await supabase.from('proposal_items').delete().eq('proposal_id', proposalId)
    if (deleteError) throw deleteError
    if (!items.length) return []
    const { data, error } = await supabase.from('proposal_items').insert(items.map(item => ({
      proposal_id: proposalId,
      item_key: item.itemKey,
      label: item.label,
      description: item.description || null,
      quantity: item.quantity,
      unit_value: item.unitValue,
      order_index: item.orderIndex,
    }))).select()
    if (error) throw error
    return (data || []).map(mapProposalItem)
  },

  async submitPortalDecision(proposalVersionId: string, decision: ProposalDecisionValue, comment?: string, decidedBy?: string) {
    const { data, error } = await supabase.from('proposal_decisions').insert({
      proposal_version_id: proposalVersionId,
      decision,
      source: 'portal',
      comment: comment?.trim() || null,
      decided_by: decidedBy || null,
    }).select().single()
    if (error) throw error
    return mapDecision(data)
  },

  async getGenerationRuns(proposalId: string) {
    const { data, error } = await supabase.from('ai_generation_runs').select('*').eq('proposal_id', proposalId).order('created_at', { ascending: false })
    if (error) throw error
    return (data || []).map(mapGenerationRun)
  },

  async getConversionRuns(proposalId: string) {
    const { data, error } = await supabase.from('proposal_conversion_runs').select('*').eq('proposal_id', proposalId).order('created_at', { ascending: false })
    if (error) throw error
    return (data || []).map(mapConversionRun)
  },

  async generateDraft(proposalId: string) {
    const { data, error } = await supabase.functions.invoke('generate-proposal-draft', { body: { proposalId } })
    if (error) throw error
    return data
  },

  async send(proposalId: string) {
    const { data, error } = await supabase.functions.invoke('send-proposal', { body: { proposalId } })
    if (error) throw error
    return data
  },

  async retryConversion(proposalId: string) {
    const { data, error } = await supabase.functions.invoke('convert-approved-proposal', { body: { proposalId } })
    if (error) throw error
    return data
  },
}
