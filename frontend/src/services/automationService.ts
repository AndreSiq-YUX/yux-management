import { supabase } from '@/lib/supabase'
import type {
  AutomationEvent,
  AutomationFlow,
  AutomationFlowInput,
  AutomationTrigger,
} from '@/types/automation'

export const buildFlowPayload = (input: AutomationFlowInput) => ({
  organization_id: input.organizationId,
  name: input.name.trim(),
  description: input.description || null,
  sector_template_key: input.sectorTemplateKey || null,
  status: input.status || 'draft',
  is_enabled: input.isEnabled ?? true,
  automation_kind: input.automationKind || 'flow',
  builder_mode: input.builderMode || 'guided',
  daily_run_limit: input.dailyRunLimit ?? 500,
  requires_human_approval: input.requiresHumanApproval ?? false,
  risk_level: input.riskLevel || 'low',
})

export const buildTriggerPayload = (flowId: string, input: Pick<AutomationTrigger, 'triggerType' | 'config'>) => ({
  flow_id: flowId,
  trigger_type: input.triggerType,
  config: input.config || {},
})

export const buildFlowVersionPayload = (input: {
  flowId: string
  versionNumber: number
  snapshot: Record<string, unknown>
  status?: 'draft' | 'published' | 'archived'
}) => ({
  flow_id: input.flowId,
  version_number: input.versionNumber,
  snapshot: input.snapshot,
  status: input.status || 'draft',
  published_at: input.status === 'published' ? new Date().toISOString() : null,
})

export function mapAutomationFlow(row: any): AutomationFlow {
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    description: row.description || undefined,
    status: row.status,
    isEnabled: Boolean(row.is_enabled),
    automationKind: row.automation_kind || 'flow',
    builderMode: row.builder_mode || 'guided',
    publishedVersion: Number(row.published_version || 0),
    activeVersionId: row.active_version_id || undefined,
    dailyRunLimit: Number(row.daily_run_limit ?? 500),
    requiresHumanApproval: Boolean(row.requires_human_approval),
    riskLevel: row.risk_level || 'low',
    sectorTemplateKey: row.sector_template_key || undefined,
    lastError: row.last_error || undefined,
    triggers: (row.automation_triggers || []).map((trigger: any) => ({
      id: trigger.id,
      triggerType: trigger.trigger_type,
      config: trigger.config || {},
    })),
    conditions: (row.automation_conditions || []).map((condition: any) => ({
      id: condition.id,
      field: condition.field,
      operator: condition.operator,
      value: condition.value,
    })),
    actions: (row.automation_actions || []).map((action: any) => ({
      id: action.id,
      actionType: action.action_type,
      orderIndex: action.order_index,
      payload: action.payload || {},
    })),
    executionRuns: (row.automation_execution_runs || []).map((run: any) => ({
      id: run.id,
      status: run.status,
      eventType: run.event_type || undefined,
      leadId: run.lead_id || undefined,
      lastError: run.last_error || undefined,
      startedAt: run.started_at || undefined,
      completedAt: run.completed_at || undefined,
    })),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

const flowSelect = `
  *,
  automation_triggers(*),
  automation_conditions(*),
  automation_actions(*),
  automation_execution_runs(*)
`

const requireData = async <T>(request: PromiseLike<{ data: T | null; error: any }>) => {
  const { data, error } = await request
  if (error) throw error
  return data as T
}

export function isAutomationBackendUnavailableError(error: unknown) {
  if (!error || typeof error !== 'object') return false
  const candidate = error as { code?: string; status?: number; message?: string; details?: string; hint?: string }
  const text = `${candidate.message || ''} ${candidate.details || ''} ${candidate.hint || ''}`.toLowerCase()
  return candidate.status === 404
    || candidate.code === 'PGRST205'
    || candidate.code === 'PGRST202'
    || text.includes('schema cache')
    || text.includes('could not find the table')
    || text.includes('relation "public.automation_flows" does not exist')
}

export const automationService = {
  async getFlows(filters?: { organizationId?: string }) {
    let query = supabase.from('automation_flows').select(flowSelect).order('updated_at', { ascending: false })
    if (filters?.organizationId) query = query.eq('organization_id', filters.organizationId)
    const data = await requireData<any[]>(query)
    return (data || []).map(mapAutomationFlow)
  },

  async createFlow(input: AutomationFlowInput) {
    const data = await requireData<any>(
      supabase.from('automation_flows').insert(buildFlowPayload(input)).select(flowSelect).single(),
    )
    return mapAutomationFlow(data)
  },

  async addTrigger(flowId: string, input: Pick<AutomationTrigger, 'triggerType' | 'config'>) {
    return requireData<any>(supabase.from('automation_triggers').insert(buildTriggerPayload(flowId, input)).select().single())
  },

  async addCondition(flowId: string, input: { field: string; operator: string; value?: unknown }) {
    return requireData<any>(supabase.from('automation_conditions').insert({
      flow_id: flowId,
      field: input.field,
      operator: input.operator,
      value: input.value ?? null,
    }).select().single())
  },

  async addAction(flowId: string, input: { actionType: string; orderIndex?: number; payload?: Record<string, unknown> }) {
    return requireData<any>(supabase.from('automation_actions').insert({
      flow_id: flowId,
      action_type: input.actionType,
      order_index: input.orderIndex ?? 1,
      payload: input.payload || {},
    }).select().single())
  },

  async publishFlow(flowId: string) {
    const data = await requireData<any>(
      supabase.from('automation_flows').update({ status: 'published' }).eq('id', flowId).select(flowSelect).single(),
    )
    return mapAutomationFlow(data)
  },

  async setFlowEnabled(flowId: string, isEnabled: boolean) {
    const data = await requireData<any>(
      supabase.from('automation_flows').update({ is_enabled: isEnabled }).eq('id', flowId).select(flowSelect).single(),
    )
    return mapAutomationFlow(data)
  },

  async updateFlow(flowId: string, input: Partial<Pick<AutomationFlowInput, 'name' | 'description' | 'sectorTemplateKey' | 'dailyRunLimit' | 'requiresHumanApproval' | 'riskLevel'>>) {
    const patch: Record<string, unknown> = {}
    if (input.name !== undefined) patch.name = input.name.trim()
    if (input.description !== undefined) patch.description = input.description || null
    if (input.sectorTemplateKey !== undefined) patch.sector_template_key = input.sectorTemplateKey || null
    if (input.dailyRunLimit !== undefined) patch.daily_run_limit = input.dailyRunLimit
    if (input.requiresHumanApproval !== undefined) patch.requires_human_approval = input.requiresHumanApproval
    if (input.riskLevel !== undefined) patch.risk_level = input.riskLevel
    const data = await requireData<any>(
      supabase.from('automation_flows').update(patch).eq('id', flowId).select(flowSelect).single(),
    )
    return mapAutomationFlow(data)
  },

  async deleteFlow(flowId: string) {
    const { error } = await supabase.from('automation_flows').delete().eq('id', flowId)
    if (error) throw error
  },

  async updateTrigger(triggerId: string, input: Pick<AutomationTrigger, 'triggerType' | 'config'>) {
    const data = await requireData<any>(
      supabase.from('automation_triggers').update({
        trigger_type: input.triggerType,
        config: input.config || {},
      }).eq('id', triggerId).select().single(),
    )
    return data
  },

  async deleteTrigger(triggerId: string) {
    const { error } = await supabase.from('automation_triggers').delete().eq('id', triggerId)
    if (error) throw error
  },

  async updateCondition(conditionId: string, input: { field: string; operator: string; value?: unknown }) {
    const data = await requireData<any>(
      supabase.from('automation_conditions').update({
        field: input.field,
        operator: input.operator,
        value: input.value ?? null,
      }).eq('id', conditionId).select().single(),
    )
    return data
  },

  async deleteCondition(conditionId: string) {
    const { error } = await supabase.from('automation_conditions').delete().eq('id', conditionId)
    if (error) throw error
  },

  async updateAction(actionId: string, input: { actionType?: string; orderIndex?: number; payload?: Record<string, unknown> }) {
    const patch: Record<string, unknown> = {}
    if (input.actionType !== undefined) patch.action_type = input.actionType
    if (input.orderIndex !== undefined) patch.order_index = input.orderIndex
    if (input.payload !== undefined) patch.payload = input.payload
    const data = await requireData<any>(
      supabase.from('automation_actions').update(patch).eq('id', actionId).select().single(),
    )
    return data
  },

  async deleteAction(actionId: string) {
    const { error } = await supabase.from('automation_actions').delete().eq('id', actionId)
    if (error) throw error
  },

  async dispatchEvent(event: AutomationEvent) {
    const { data, error } = await supabase.functions.invoke('dispatch-crm-automation', { body: { event } })
    if (error) throw error
    return data
  },

  async saveSimulationRun(input: {
    organizationId: string
    flowId: string
    eventType: string
    samplePayload: Record<string, unknown>
    matched: boolean
    conditionResults: unknown[]
    plannedActions: unknown[]
    blockedReasons: string[]
  }) {
    const data = await requireData<any>(
      supabase.from('automation_simulation_runs').insert({
        organization_id: input.organizationId,
        flow_id: input.flowId,
        event_type: input.eventType,
        sample_payload: input.samplePayload,
        matched: input.matched,
        condition_results: input.conditionResults,
        planned_actions: input.plannedActions,
        blocked_reasons: input.blockedReasons,
      }).select().single(),
    )
    return data
  },

  async getFlowVersions(flowId: string) {
    const data = await requireData<any[]>(
      supabase
        .from('automation_flow_versions')
        .select('*')
        .eq('flow_id', flowId)
        .order('version_number', { ascending: false }),
    )
    return data || []
  },

  async createFlowVersion(input: {
    flowId: string
    versionNumber: number
    snapshot: Record<string, unknown>
    status?: 'draft' | 'published' | 'archived'
  }) {
    const data = await requireData<any>(
      supabase
        .from('automation_flow_versions')
        .insert(buildFlowVersionPayload(input))
        .select()
        .single(),
    )
    return data
  },

  async setActiveVersion(flowId: string, versionId: string, versionNumber: number) {
    const data = await requireData<any>(
      supabase
        .from('automation_flows')
        .update({
          active_version_id: versionId,
          published_version: versionNumber,
        })
        .eq('id', flowId)
        .select(flowSelect)
        .single(),
    )
    return mapAutomationFlow(data)
  },
}
