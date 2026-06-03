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
})

export const buildTriggerPayload = (flowId: string, input: Pick<AutomationTrigger, 'triggerType' | 'config'>) => ({
  flow_id: flowId,
  trigger_type: input.triggerType,
  config: input.config || {},
})

export function mapAutomationFlow(row: any): AutomationFlow {
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    description: row.description || undefined,
    status: row.status,
    isEnabled: Boolean(row.is_enabled),
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

  async dispatchEvent(event: AutomationEvent) {
    const { data, error } = await supabase.functions.invoke('dispatch-crm-automation', { body: { event } })
    if (error) throw error
    return data
  },
}
