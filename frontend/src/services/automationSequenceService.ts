import { apiRequest } from '@/lib/apiClient'
import type { AutomationSequence, AutomationSequenceChannel, AutomationSequenceStatus, AutomationSequenceStepKind } from '@/types/automationSequence'

export const buildSequencePayload = (input: {
  organizationId: string
  name: string
  description?: string
  channel?: AutomationSequenceChannel
  sectorTemplateKey?: string
  conversionGoal?: string
  isActive?: boolean
}) => ({
  organization_id: input.organizationId,
  name: input.name.trim(),
  description: input.description || null,
  channel: input.channel || 'whatsapp',
  sector_template_key: input.sectorTemplateKey || null,
  conversion_goal: input.conversionGoal || null,
  is_active: input.isActive ?? true,
})

export function mapAutomationSequence(row: any): AutomationSequence {
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    description: row.description || undefined,
    channel: row.channel || 'whatsapp',
    status: mapSequenceStatus(row),
    sectorTemplateKey: row.sector_template_key || undefined,
    conversionGoal: row.conversion_goal || undefined,
    activeEnrollmentCount: Number(row.active_enrollment_count || 0),
    convertedEnrollmentCount: Number(row.converted_enrollment_count || 0),
    steps: (row.crm_sequence_steps || []).map((step: any) => ({
      id: step.id,
      sequenceId: step.sequence_id,
      orderIndex: Number(step.order_index || 0),
      stepKind: step.step_kind || 'message',
      channel: step.channel || undefined,
      subject: step.subject || undefined,
      body: step.body || undefined,
      delayMinutes: Number(step.delay_minutes || 0),
      templateId: step.template_id || undefined,
      requiresHumanApproval: Boolean(step.requires_human_approval),
      isActive: Boolean(step.is_active),
    })),
  }
}

function mapSequenceStatus(row: any): AutomationSequenceStatus {
  if (row.status) return row.status
  return row.is_active ? 'active' : 'paused'
}

export const automationSequenceService = {
  async getSequences(organizationId: string) {
    return apiRequest<AutomationSequence[]>(`/automations/sequences?organizationId=${encodeURIComponent(organizationId)}`)
  },

  async createSequence(input: Parameters<typeof buildSequencePayload>[0]) {
    return apiRequest<AutomationSequence>('/automations/sequences', {
      method: 'POST',
      body: input,
    })
  },

  async updateSequence(sequenceId: string, input: Partial<Parameters<typeof buildSequencePayload>[0]>) {
    return apiRequest<AutomationSequence>(`/automations/sequences/${sequenceId}`, {
      method: 'PATCH',
      body: input,
    })
  },

  async deleteSequence(sequenceId: string) {
    await apiRequest(`/automations/sequences/${sequenceId}`, { method: 'DELETE' })
  },

  async setSequenceStatus(sequenceId: string, status: AutomationSequenceStatus) {
    return apiRequest<AutomationSequence>(`/automations/sequences/${sequenceId}`, {
      method: 'PATCH',
      body: { status, isActive: status === 'active' },
    })
  },

  async addStep(sequenceId: string, input: {
    stepKind: AutomationSequenceStepKind
    channel?: 'email' | 'whatsapp'
    delayMinutes?: number
    subject?: string
    body?: string
    templateId?: string
    requiresHumanApproval?: boolean
  }) {
    return apiRequest(`/automations/sequences/${sequenceId}/steps`, {
      method: 'POST',
      body: input,
    })
  },

  async updateStep(stepId: string, input: Partial<{
    stepKind: AutomationSequenceStepKind
    channel?: 'email' | 'whatsapp'
    delayMinutes: number
    subject?: string
    body?: string
    requiresHumanApproval: boolean
    isActive: boolean
  }>) {
    return apiRequest(`/automations/sequence-steps/${stepId}`, {
      method: 'PATCH',
      body: input,
    })
  },

  async deleteStep(stepId: string) {
    await apiRequest(`/automations/sequence-steps/${stepId}`, { method: 'DELETE' })
  },
}
