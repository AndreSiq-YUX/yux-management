import { crmClosingDataClient } from '@/lib/crmClosingDataClient'
import { buildConversionPlan, buildProposalFromLeadDraft, canCreateProposalFromLead, recommendPackageForLead, requiresClosingApproval } from '@/lib/crm/closingRules'
import { proposalService } from '@/services/proposalService'
import type { CrmInstanceMember, CrmLead, CrmTeamMember } from '@/types/crm'
import type {
  ClientOnboardingChecklist,
  ClientOnboardingTask,
  CrmProposalConversionRun,
  LeadProposalRecommendation,
  ProposalClosingChecklist,
  ProposalFollowUpTask,
  ProposalFromLeadDraft,
  ProposalObjection,
  ProposalViewEvent,
  ProposalViewEventType,
} from '@/types/crmClosing'
import type { PackageDefinition } from '@/types/platform'
import type { ProposalDraft } from '@/types/proposal'

type Nullable<T> = T | null | undefined
type JsonRecord = Record<string, unknown>

const optional = <T>(value: Nullable<T>) => value === null || value === undefined || value === '' ? undefined : value

const requireData = async <T>(request: PromiseLike<{ data: T | null; error: any }>) => {
  const { data, error } = await request
  if (error) throw error
  return data as T
}

export interface CreateProposalFromLeadInput {
  lead: CrmLead
  packages: PackageDefinition[]
  packageId?: string
  currentMember?: CrmInstanceMember
  teamMemberships?: CrmTeamMember[]
  approvalConfirmed?: boolean
}

export interface ProposalEventInput {
  organizationId: string
  crmInstanceId?: string
  leadId: string
  proposalId: string
  eventType: ProposalViewEventType
  actorType?: 'internal' | 'client' | 'system'
  actorId?: string
  metadata?: JsonRecord
}

export interface ProposalFollowUpInput {
  organizationId: string
  crmInstanceId?: string
  leadId: string
  proposalId: string
  title: string
  dueAt: string
  assignedToMemberId?: string
}

export interface ProposalObjectionInput {
  organizationId: string
  crmInstanceId?: string
  leadId: string
  proposalId: string
  category: string
  description: string
}

export const defaultClosingChecklistSteps = [
  { key: 'contract', label: 'Contrato criado', completed: false },
  { key: 'modules', label: 'Modulos habilitados', completed: false },
  { key: 'project', label: 'Projeto criado', completed: false },
  { key: 'finance', label: 'Financeiro preparado', completed: false },
  { key: 'onboarding', label: 'Onboarding iniciado', completed: false },
] as const

export const buildRecommendationPayload = (lead: CrmLead, recommendation: ReturnType<typeof recommendPackageForLead>) => {
  if (!recommendation) return null
  return {
    organization_id: lead.organizationId,
    crm_instance_id: lead.crmInstanceId || null,
    lead_id: lead.id,
    package_id: recommendation.package.id,
    module_keys: recommendation.moduleKeys,
    score: recommendation.score,
    reasons: recommendation.reasons,
    status: 'suggested',
  }
}

export const buildProposalViewEventPayload = (input: ProposalEventInput) => ({
  organization_id: input.organizationId,
  crm_instance_id: input.crmInstanceId || null,
  lead_id: input.leadId,
  proposal_id: input.proposalId,
  event_type: input.eventType,
  actor_type: input.actorType || 'system',
  actor_id: input.actorId || null,
  metadata: input.metadata || {},
})

export const buildProposalFollowUpPayload = (input: ProposalFollowUpInput) => ({
  organization_id: input.organizationId,
  crm_instance_id: input.crmInstanceId || null,
  lead_id: input.leadId,
  proposal_id: input.proposalId,
  title: input.title.trim(),
  status: 'pending',
  due_at: input.dueAt,
  assigned_to_member_id: input.assignedToMemberId || null,
})

export const buildProposalObjectionPayload = (input: ProposalObjectionInput) => ({
  organization_id: input.organizationId,
  crm_instance_id: input.crmInstanceId || null,
  lead_id: input.leadId,
  proposal_id: input.proposalId,
  category: input.category.trim(),
  description: input.description.trim(),
  status: 'open',
})

export const buildClosingChecklistPayload = (proposal: Pick<ProposalDraft, 'organizationId' | 'leadId' | 'id'> & { crmInstanceId?: string }) => ({
  organization_id: proposal.organizationId,
  crm_instance_id: proposal.crmInstanceId || null,
  lead_id: proposal.leadId,
  proposal_id: proposal.id,
  status: 'open',
  steps: defaultClosingChecklistSteps,
})

export const buildCrmConversionRunPatch = (
  proposal: Pick<ProposalDraft, 'organizationId' | 'leadId' | 'id'> & { crmInstanceId?: string },
  idempotencyKey: string,
  result: JsonRecord = {},
) => ({
  organization_id: proposal.organizationId,
  crm_instance_id: proposal.crmInstanceId || null,
  lead_id: proposal.leadId,
  idempotency_key: idempotencyKey,
  client_id: typeof result.clientId === 'string' ? result.clientId : undefined,
  contract_id: typeof result.contractId === 'string' ? result.contractId : undefined,
  project_id: typeof result.projectId === 'string' ? result.projectId : undefined,
  completed_at: new Date().toISOString(),
})

export const mapLeadProposalRecommendation = (row: any): LeadProposalRecommendation => ({
  id: row.id,
  organizationId: row.organization_id,
  crmInstanceId: optional(row.crm_instance_id),
  leadId: row.lead_id,
  packageId: row.package_id,
  moduleKeys: row.module_keys || [],
  score: Number(row.score || 0),
  reasons: row.reasons || [],
  status: row.status,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

export const mapProposalViewEvent = (row: any): ProposalViewEvent => ({
  id: row.id,
  organizationId: row.organization_id,
  crmInstanceId: optional(row.crm_instance_id),
  leadId: row.lead_id,
  proposalId: row.proposal_id,
  eventType: row.event_type,
  actorType: row.actor_type,
  actorId: optional(row.actor_id),
  metadata: row.metadata || {},
  createdAt: row.created_at,
})

export const mapProposalFollowUpTask = (row: any): ProposalFollowUpTask => ({
  id: row.id,
  organizationId: row.organization_id,
  crmInstanceId: optional(row.crm_instance_id),
  leadId: row.lead_id,
  proposalId: row.proposal_id,
  title: row.title,
  status: row.status,
  dueAt: row.due_at,
  assignedToMemberId: optional(row.assigned_to_member_id),
  completedAt: optional(row.completed_at),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

export const mapProposalObjection = (row: any): ProposalObjection => ({
  id: row.id,
  organizationId: row.organization_id,
  crmInstanceId: optional(row.crm_instance_id),
  leadId: row.lead_id,
  proposalId: row.proposal_id,
  category: row.category,
  description: row.description,
  status: row.status,
  handledBy: optional(row.handled_by),
  handledAt: optional(row.handled_at),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

export const mapClosingChecklist = (row: any): ProposalClosingChecklist => ({
  id: row.id,
  organizationId: row.organization_id,
  crmInstanceId: optional(row.crm_instance_id),
  leadId: row.lead_id,
  proposalId: row.proposal_id,
  status: row.status,
  steps: row.steps || [],
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

export const mapCrmProposalConversionRun = (row: any): CrmProposalConversionRun => ({
  id: row.id,
  organizationId: row.organization_id,
  crmInstanceId: optional(row.crm_instance_id),
  leadId: row.lead_id,
  proposalId: row.proposal_id,
  idempotencyKey: row.idempotency_key || `proposal:${row.proposal_id}:conversion`,
  status: row.status,
  attemptNumber: Number(row.attempt_number || 0),
  clientId: optional(row.client_id),
  contractId: optional(row.contract_id),
  projectId: optional(row.project_id),
  invoiceId: optional(row.invoice_id),
  error: optional(row.error),
  createdAt: row.created_at,
  completedAt: optional(row.completed_at),
})

export const mapOnboardingChecklist = (row: any): ClientOnboardingChecklist => ({
  id: row.id,
  organizationId: row.organization_id,
  crmInstanceId: optional(row.crm_instance_id),
  leadId: optional(row.lead_id),
  clientId: row.client_id,
  proposalId: optional(row.proposal_id),
  contractId: optional(row.contract_id),
  projectId: optional(row.project_id),
  status: row.status,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

export const mapOnboardingTask = (row: any): ClientOnboardingTask => ({
  id: row.id,
  checklistId: row.checklist_id,
  title: row.title,
  description: optional(row.description),
  status: row.status,
  dueAt: optional(row.due_at),
  completedAt: optional(row.completed_at),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

export const crmClosingService = {
  async getLeadProposalContext(leadId: string) {
    const [proposals, recommendations, events, followUps, objections, checklists, runs] = await Promise.all([
      proposalService.getByLead(leadId),
      requireData<any[]>(crmClosingDataClient.from('lead_proposal_recommendations').select('*').eq('lead_id', leadId).order('score', { ascending: false })),
      requireData<any[]>(crmClosingDataClient.from('proposal_view_events').select('*').eq('lead_id', leadId).order('created_at', { ascending: false })),
      requireData<any[]>(crmClosingDataClient.from('proposal_follow_up_tasks').select('*').eq('lead_id', leadId).order('due_at', { ascending: true })),
      requireData<any[]>(crmClosingDataClient.from('proposal_objections').select('*').eq('lead_id', leadId).order('created_at', { ascending: false })),
      requireData<any[]>(crmClosingDataClient.from('proposal_closing_checklists').select('*').eq('lead_id', leadId).order('updated_at', { ascending: false })),
      requireData<any[]>(crmClosingDataClient.from('proposal_conversion_runs').select('*').eq('lead_id', leadId).order('created_at', { ascending: false })),
    ])

    return {
      proposals,
      recommendations: recommendations.map(mapLeadProposalRecommendation),
      events: events.map(mapProposalViewEvent),
      followUps: followUps.map(mapProposalFollowUpTask),
      objections: objections.map(mapProposalObjection),
      checklists: checklists.map(mapClosingChecklist),
      conversionRuns: runs.map(mapCrmProposalConversionRun),
    }
  },

  async createProposalFromLead(input: CreateProposalFromLeadInput) {
    const access = canCreateProposalFromLead(input.currentMember, input.lead, input.teamMemberships)
    if (!access.allowed) throw new Error(`proposal_creation_${access.reason}`)
    const recommendation = input.packageId
      ? {
        package: input.packages.find(item => item.id === input.packageId) || input.packages[0],
        score: 100,
        reasons: ['manual_package_selection'],
        moduleKeys: input.packages.find(item => item.id === input.packageId)?.moduleKeys || [],
      }
      : recommendPackageForLead(input.lead, input.packages)

    if (!recommendation) throw new Error('Nenhum pacote comercial disponivel para proposta.')

    const recommendationPayload = buildRecommendationPayload(input.lead, recommendation)
    if (recommendationPayload) {
      await crmClosingDataClient.from('lead_proposal_recommendations').upsert(recommendationPayload, { onConflict: 'lead_id,package_id' })
    }

    const draft: ProposalFromLeadDraft = buildProposalFromLeadDraft(input.lead, recommendation)
    const approval = requiresClosingApproval({
      finalValue: input.lead.value || 0,
      selectedModuleKeys: draft.selectedModuleKeys,
    })
    if (approval.required && !input.approvalConfirmed) {
      throw new Error(`proposal_approval_required:${approval.reasons.join(',')}`)
    }
    const proposal = await proposalService.createDraft({
      organizationId: draft.organizationId,
      leadId: draft.leadId,
      packageId: draft.packageId,
      title: draft.title,
      billingCycle: draft.billingCycle,
      selectedModuleKeys: draft.selectedModuleKeys,
      crmInstanceId: draft.crmInstanceId,
      recommendedPackageId: draft.recommendedPackageId,
    })

    await proposalService.updateDraft(proposal.id, { scope: draft.scope })
    await this.recordProposalViewEvent({
      organizationId: input.lead.organizationId,
      crmInstanceId: input.lead.crmInstanceId,
      leadId: input.lead.id,
      proposalId: proposal.id,
      eventType: 'sent',
      actorType: 'internal',
      metadata: { createdFromLead: true },
    })

    return proposal
  },

  async recordProposalViewEvent(input: ProposalEventInput) {
    const data = await requireData<any>(
      crmClosingDataClient.from('proposal_view_events').insert(buildProposalViewEventPayload(input)).select().single(),
    )
    return mapProposalViewEvent(data)
  },

  async recordProposalObjection(input: ProposalObjectionInput) {
    const data = await requireData<any>(
      crmClosingDataClient.from('proposal_objections').insert(buildProposalObjectionPayload(input)).select().single(),
    )
    return mapProposalObjection(data)
  },

  async scheduleProposalFollowUp(input: ProposalFollowUpInput) {
    const data = await requireData<any>(
      crmClosingDataClient.from('proposal_follow_up_tasks').insert(buildProposalFollowUpPayload(input)).select().single(),
    )
    return mapProposalFollowUpTask(data)
  },

  async createClosingChecklist(proposal: ProposalDraft & { crmInstanceId?: string }) {
    const data = await requireData<any>(
      crmClosingDataClient
        .from('proposal_closing_checklists')
        .upsert(buildClosingChecklistPayload(proposal), { onConflict: 'proposal_id' })
        .select()
        .single(),
    )
    return mapClosingChecklist(data)
  },

  async runProposalConversion(proposalId: string) {
    const proposal = await proposalService.getById(proposalId) as ProposalDraft & { crmInstanceId?: string }
    const runs = await requireData<any[]>(
      crmClosingDataClient.from('proposal_conversion_runs').select('*').eq('proposal_id', proposalId).order('attempt_number', { ascending: false }),
    )
    const plan = buildConversionPlan(proposal, runs.map(mapCrmProposalConversionRun))
    if (!plan.canRun) throw new Error(plan.blockedReason || 'conversion_blocked')

    try {
      const result = await proposalService.retryConversion(proposalId) as JsonRecord
      const latestRun = await requireData<any>(
        crmClosingDataClient
          .from('proposal_conversion_runs')
          .select('*')
          .eq('proposal_id', proposalId)
          .order('created_at', { ascending: false })
          .limit(1)
          .single(),
      )
      const updated = await requireData<any>(
        crmClosingDataClient
          .from('proposal_conversion_runs')
          .update(buildCrmConversionRunPatch(proposal, plan.idempotencyKey, result))
          .eq('id', latestRun.id)
          .select()
          .single(),
      )
      return mapCrmProposalConversionRun(updated)
    } catch (error) {
      const failed = await requireData<any>(
        crmClosingDataClient.from('proposal_conversion_runs').insert({
          organization_id: proposal.organizationId,
          crm_instance_id: proposal.crmInstanceId || null,
          lead_id: proposal.leadId,
          proposal_id: proposal.id,
          idempotency_key: `${plan.idempotencyKey}:failed:${plan.nextAttemptNumber}`,
          attempt_number: plan.nextAttemptNumber,
          status: 'failed',
          error: error instanceof Error ? error.message : String(error),
        }).select().single(),
      )
      return mapCrmProposalConversionRun(failed)
    }
  },

  async retryProposalConversion(proposalId: string) {
    return this.runProposalConversion(proposalId)
  },
}
