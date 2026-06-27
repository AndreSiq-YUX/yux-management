import { supabase } from '@/lib/supabase'
import {
  buildOnboardingChecklistFromBlueprint,
} from '@/lib/growth-workspace/onboardingRules'
import type { Blueprint } from '@/types/platform'
import type {
  CampaignPlan,
  CampaignPlanStep,
  GrowthOnboardingChecklist,
  GrowthOnboardingStep,
} from '@/types/growthWorkspace'

function mapCampaignPlan(row: any): CampaignPlan {
  return {
    id: row.id,
    organizationId: row.organization_id,
    contractId: row.contract_id || undefined,
    name: row.name,
    objective: row.objective,
    status: row.status,
    ownerId: row.owner_id || undefined,
    sourceBlueprintId: row.source_blueprint_id || undefined,
    steps: Array.isArray(row.growth_campaign_plan_steps)
      ? row.growth_campaign_plan_steps.map(mapCampaignPlanStep).sort((a: CampaignPlanStep, b: CampaignPlanStep) => a.sortOrder - b.sortOrder)
      : [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapCampaignPlanStep(row: any): CampaignPlanStep {
  return {
    id: row.id,
    planId: row.plan_id,
    key: row.step_key,
    label: row.label,
    description: row.description || '',
    moduleKey: row.module_key,
    status: row.status,
    linkedEntityType: row.linked_entity_type || undefined,
    linkedEntityId: row.linked_entity_id || undefined,
    ownerId: row.owner_id || undefined,
    dueAt: row.due_at || undefined,
    completedAt: row.completed_at || undefined,
    sortOrder: row.sort_order,
    isRequired: Boolean(row.is_required),
    dependsOn: Array.isArray(row.depends_on) ? row.depends_on : [],
    blockedReason: row.blocked_reason || undefined,
    actionLabel: String(row.metadata?.actionLabel || row.metadata?.action_label || 'Abrir etapa'),
  }
}

function buildCampaignPlanPayload(plan: CampaignPlan) {
  return {
    organization_id: plan.organizationId,
    contract_id: plan.contractId || null,
    name: plan.name,
    objective: plan.objective,
    status: plan.status,
    owner_id: plan.ownerId || null,
    source_blueprint_id: plan.sourceBlueprintId || null,
  }
}

function buildCampaignPlanStepPayload(step: CampaignPlanStep, planId: string) {
  return {
    plan_id: planId,
    step_key: step.key,
    label: step.label,
    description: step.description || null,
    module_key: step.moduleKey,
    status: step.status,
    linked_entity_type: step.linkedEntityType || null,
    linked_entity_id: step.linkedEntityId || null,
    owner_id: step.ownerId || null,
    due_at: step.dueAt || null,
    sort_order: step.sortOrder,
    is_required: step.isRequired,
    depends_on: step.dependsOn,
    blocked_reason: step.blockedReason || null,
    completed_at: step.completedAt || null,
    metadata: { actionLabel: step.actionLabel },
  }
}

const CAMPAIGN_PLAN_SELECT = '*, growth_campaign_plan_steps(*)'
const ONBOARDING_SELECT = '*, growth_onboarding_steps(*)'

function onboardingStepHref(moduleKey: string, stepKey: string) {
  const byStep: Record<string, string> = {
    company_profile: '/empresa/perfil',
    users_and_permissions: '/empresa/usuarios',
    brand_voice: '/empresa/marca',
    knowledge_base: '/empresa/conhecimento',
    channels: '/atendimento/canais',
    crm_pipeline: '/comercial/funis',
    campaign_plan: '/marketing/campanhas',
    landing_page: '/marketing/landing-pages',
    automation: '/automacoes/templates',
    reports: '/relatorios',
    finance: '/financeiro',
  }

  return byStep[stepKey] || (moduleKey === 'crm' ? '/comercial/leads' : '/portal')
}

function mapOnboardingStep(row: any): GrowthOnboardingStep {
  return {
    id: row.id,
    checklistId: row.checklist_id,
    key: row.step_key,
    label: row.label,
    moduleKey: row.module_key,
    status: row.status,
    estimatedMinutes: Number(row.estimated_minutes || 0),
    assignedTo: row.assigned_to || undefined,
    completedAt: row.completed_at || undefined,
    skippedReason: row.skipped_reason || undefined,
    sortOrder: Number(row.sort_order || 0),
    href: onboardingStepHref(row.module_key, row.step_key),
  }
}

function mapOnboardingChecklist(row: any): GrowthOnboardingChecklist {
  return {
    id: row.id,
    organizationId: row.organization_id,
    contractId: row.contract_id || undefined,
    sourceBlueprintId: row.source_blueprint_id || undefined,
    status: row.status,
    steps: Array.isArray(row.growth_onboarding_steps)
      ? row.growth_onboarding_steps.map(mapOnboardingStep).sort((a: GrowthOnboardingStep, b: GrowthOnboardingStep) => a.sortOrder - b.sortOrder)
      : [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export const growthWorkspaceService = {
  async listCampaignPlans(filters?: { organizationId?: string; contractId?: string }) {
    let query = supabase
      .from('growth_campaign_plans')
      .select(CAMPAIGN_PLAN_SELECT)
      .order('updated_at', { ascending: false })

    if (filters?.organizationId) query = query.eq('organization_id', filters.organizationId)
    if (filters?.contractId) query = query.eq('contract_id', filters.contractId)

    const { data, error } = await query
    if (error) throw error
    return (data || []).map(mapCampaignPlan)
  },

  async getCampaignPlan(planId: string) {
    const { data, error } = await supabase
      .from('growth_campaign_plans')
      .select(CAMPAIGN_PLAN_SELECT)
      .eq('id', planId)
      .single()

    if (error) throw error
    return mapCampaignPlan(data)
  },

  async createCampaignPlan(plan: CampaignPlan) {
    const { data: planRow, error: planError } = await supabase
      .from('growth_campaign_plans')
      .insert(buildCampaignPlanPayload(plan))
      .select('*')
      .single()

    if (planError) throw planError

    if (plan.steps.length > 0) {
      const { error: stepsError } = await supabase
        .from('growth_campaign_plan_steps')
        .insert(plan.steps.map(step => buildCampaignPlanStepPayload(step, planRow.id)))

      if (stepsError) throw stepsError
    }

    return growthWorkspaceService.getCampaignPlan(planRow.id)
  },

  async updateCampaignPlanStep(stepId: string, patch: Partial<Pick<CampaignPlanStep, 'status' | 'ownerId' | 'dueAt' | 'completedAt' | 'blockedReason'>>) {
    const payload: Record<string, unknown> = {}
    if (patch.status !== undefined) payload.status = patch.status
    if (patch.ownerId !== undefined) payload.owner_id = patch.ownerId || null
    if (patch.dueAt !== undefined) payload.due_at = patch.dueAt || null
    if (patch.completedAt !== undefined) payload.completed_at = patch.completedAt || null
    if (patch.blockedReason !== undefined) payload.blocked_reason = patch.blockedReason || null

    const { data, error } = await supabase
      .from('growth_campaign_plan_steps')
      .update(payload)
      .eq('id', stepId)
      .select('*')
      .single()

    if (error) throw error
    return mapCampaignPlanStep(data)
  },

  async linkCampaignPlanStep(stepId: string, entityType: string, entityId: string) {
    const { data, error } = await supabase
      .from('growth_campaign_plan_steps')
      .update({
        linked_entity_type: entityType,
        linked_entity_id: entityId,
        status: 'linked',
        completed_at: new Date().toISOString(),
      })
      .eq('id', stepId)
      .select('*')
      .single()

    if (error) throw error
    return mapCampaignPlanStep(data)
  },

  async listOnboardingChecklists(filters?: { organizationId?: string; contractId?: string; sourceBlueprintId?: string }) {
    let query = supabase
      .from('growth_onboarding_checklists')
      .select(ONBOARDING_SELECT)
      .order('updated_at', { ascending: false })

    if (filters?.organizationId) query = query.eq('organization_id', filters.organizationId)
    if (filters?.contractId) query = query.eq('contract_id', filters.contractId)
    if (filters?.sourceBlueprintId) query = query.eq('source_blueprint_id', filters.sourceBlueprintId)

    const { data, error } = await query
    if (error) throw error
    return (data || []).map(mapOnboardingChecklist)
  },

  async createOnboardingChecklistFromBlueprint(input: {
    organizationId: string
    contractId?: string
    blueprint: Blueprint
  }) {
    const existing = await growthWorkspaceService.listOnboardingChecklists({
      organizationId: input.organizationId,
      contractId: input.contractId,
      sourceBlueprintId: input.blueprint.id,
    })

    if (existing[0]) return existing[0]

    const { data: checklistRow, error: checklistError } = await supabase
      .from('growth_onboarding_checklists')
      .insert({
        organization_id: input.organizationId,
        contract_id: input.contractId || null,
        source_blueprint_id: input.blueprint.id,
        status: 'active',
      })
      .select('*')
      .single()

    if (checklistError) throw checklistError

    const steps = buildOnboardingChecklistFromBlueprint(input.blueprint)
    if (steps.length > 0) {
      const { error: stepsError } = await supabase
        .from('growth_onboarding_steps')
        .insert(steps.map(step => ({
          checklist_id: checklistRow.id,
          step_key: step.key,
          label: step.label,
          module_key: step.moduleKey,
          status: 'not_started',
          estimated_minutes: step.estimatedMinutes,
          sort_order: step.sortOrder,
        })))

      if (stepsError) throw stepsError
    }

    const checklists = await growthWorkspaceService.listOnboardingChecklists({
      organizationId: input.organizationId,
      contractId: input.contractId,
      sourceBlueprintId: input.blueprint.id,
    })
    return checklists[0]
  },

  async updateOnboardingStep(stepId: string, patch: Partial<Pick<GrowthOnboardingStep, 'status' | 'assignedTo' | 'completedAt' | 'skippedReason'>>) {
    const payload: Record<string, unknown> = {}
    if (patch.status !== undefined) payload.status = patch.status
    if (patch.assignedTo !== undefined) payload.assigned_to = patch.assignedTo || null
    if (patch.completedAt !== undefined) payload.completed_at = patch.completedAt || null
    if (patch.skippedReason !== undefined) payload.skipped_reason = patch.skippedReason || null

    const { data, error } = await supabase
      .from('growth_onboarding_steps')
      .update(payload)
      .eq('id', stepId)
      .select('*')
      .single()

    if (error) throw error
    return mapOnboardingStep(data)
  },
}
