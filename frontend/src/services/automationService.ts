import { apiRequest } from '@/lib/apiClient'
import type {
  AutomationEvent,
  AutomationFlow,
  AutomationFlowInput,
  AutomationTrigger,
  OrganizationMaterial,
} from '@/types/automation'
import type { AutomationBuilderMode } from '@/types/intelligentAutomation'

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
  graph: input.graph || null,
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
    graph: row.graph || undefined,
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

const buildQuery = (params: Record<string, string | undefined>) => {
  const search = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value) search.set(key, value)
  })
  const query = search.toString()
  return query ? `?${query}` : ''
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
    return apiRequest<AutomationFlow[]>(`/automations/flows${buildQuery({ organizationId: filters?.organizationId })}`)
  },

  async createFlow(input: AutomationFlowInput) {
    return apiRequest<AutomationFlow>('/automations/flows', {
      method: 'POST',
      body: input,
    })
  },

  async addTrigger(flowId: string, input: Pick<AutomationTrigger, 'triggerType' | 'config'>) {
    return apiRequest(`/automations/flows/${flowId}/triggers`, {
      method: 'POST',
      body: input,
    })
  },

  async addCondition(flowId: string, input: { field: string; operator: string; value?: unknown }) {
    return apiRequest(`/automations/flows/${flowId}/conditions`, {
      method: 'POST',
      body: input,
    })
  },

  async addAction(flowId: string, input: { actionType: string; orderIndex?: number; payload?: Record<string, unknown> }) {
    return apiRequest(`/automations/flows/${flowId}/actions`, {
      method: 'POST',
      body: input,
    })
  },

  async publishFlow(flowId: string) {
    return apiRequest<AutomationFlow>(`/automations/flows/${flowId}`, {
      method: 'PATCH',
      body: { status: 'published' },
    })
  },

  async setFlowEnabled(flowId: string, isEnabled: boolean) {
    return apiRequest<AutomationFlow>(`/automations/flows/${flowId}`, {
      method: 'PATCH',
      body: { isEnabled },
    })
  },

  async updateFlow(flowId: string, input: Partial<Pick<AutomationFlowInput, 'name' | 'description' | 'sectorTemplateKey' | 'dailyRunLimit' | 'requiresHumanApproval' | 'riskLevel' | 'builderMode' | 'graph'>>) {
    return apiRequest<AutomationFlow>(`/automations/flows/${flowId}`, {
      method: 'PATCH',
      body: input,
    })
  },

  async deleteFlow(flowId: string) {
    await apiRequest(`/automations/flows/${flowId}`, { method: 'DELETE' })
  },

  async getFlowExecutionRuns(flowId: string) {
    return apiRequest<any[]>(`/automations/flows/${flowId}/executions`)
  },

  async updateTrigger(triggerId: string, input: Pick<AutomationTrigger, 'triggerType' | 'config'>) {
    return apiRequest(`/automations/triggers/${triggerId}`, {
      method: 'PATCH',
      body: input,
    })
  },

  async deleteTrigger(triggerId: string) {
    await apiRequest(`/automations/triggers/${triggerId}`, { method: 'DELETE' })
  },

  async updateCondition(conditionId: string, input: { field: string; operator: string; value?: unknown }) {
    return apiRequest(`/automations/conditions/${conditionId}`, {
      method: 'PATCH',
      body: input,
    })
  },

  async deleteCondition(conditionId: string) {
    await apiRequest(`/automations/conditions/${conditionId}`, { method: 'DELETE' })
  },

  async updateAction(actionId: string, input: { actionType?: string; orderIndex?: number; payload?: Record<string, unknown> }) {
    return apiRequest(`/automations/actions/${actionId}`, {
      method: 'PATCH',
      body: input,
    })
  },

  async deleteAction(actionId: string) {
    await apiRequest(`/automations/actions/${actionId}`, { method: 'DELETE' })
  },

  async dispatchEvent(event: AutomationEvent) {
    return apiRequest('/automations/dispatch', {
      method: 'POST',
      body: { event },
    })
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
    return apiRequest('/automations/simulations', {
      method: 'POST',
      body: input,
    })
  },

  async getFlowVersions(flowId: string) {
    return apiRequest<any[]>(`/automations/flows/${flowId}/versions`)
  },

  async createFlowVersion(input: {
    flowId: string
    versionNumber: number
    snapshot: Record<string, unknown>
    status?: 'draft' | 'published' | 'archived'
  }) {
    return apiRequest<any>(`/automations/flows/${input.flowId}/versions`, {
      method: 'POST',
      body: {
        versionNumber: input.versionNumber,
        snapshot: input.snapshot,
        status: input.status || 'draft',
      },
    })
  },

  async setActiveVersion(flowId: string, versionId: string, versionNumber: number) {
    return apiRequest<AutomationFlow>(`/automations/flows/${flowId}`, {
      method: 'PATCH',
      body: {
        activeVersionId: versionId,
        publishedVersion: versionNumber,
      },
    })
  },

  async getMaterials(organizationId: string): Promise<OrganizationMaterial[]> {
    return apiRequest<OrganizationMaterial[]>(`/automations/materials?organizationId=${encodeURIComponent(organizationId)}`)
  },

  async uploadMaterial(organizationId: string, file: File): Promise<OrganizationMaterial> {
    return apiRequest<OrganizationMaterial>('/automations/materials', {
      method: 'POST',
      body: {
        organizationId,
        name: file.name,
        fileType: file.type || 'application/octet-stream',
        byteSize: file.size,
        contentBase64: await fileToBase64(file),
      },
    })
  },

  async deleteMaterial(materialId: string): Promise<void> {
    await apiRequest(`/automations/materials/${materialId}`, { method: 'DELETE' })
  },

  async getUploadLimit(organizationId: string): Promise<number> {
    const data = await apiRequest<{ limitMb: number }>(`/automations/materials/upload-limit?organizationId=${encodeURIComponent(organizationId)}`)
    return data.limitMb
  }
}

async function fileToBase64(file: File) {
  const buffer = await file.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const chunkSize = 0x8000
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize))
  }
  return btoa(binary)
}
