import { supabase } from '@/lib/supabase'
import type { AutomationSequence, AutomationSequenceChannel, AutomationSequenceStatus } from '@/types/automationSequence'

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

const sequenceSelect = '*, crm_sequence_steps(*)'

const requireData = async <T>(request: PromiseLike<{ data: T | null; error: any }>) => {
  const { data, error } = await request
  if (error) throw error
  return data as T
}

export const automationSequenceService = {
  async getSequences(organizationId: string) {
    const data = await requireData<any[]>(
      supabase.from('crm_sequences').select(sequenceSelect).eq('organization_id', organizationId).order('updated_at', { ascending: false }),
    )
    return (data || []).map(mapAutomationSequence)
  },

  async createSequence(input: Parameters<typeof buildSequencePayload>[0]) {
    const data = await requireData<any>(
      supabase.from('crm_sequences').insert(buildSequencePayload(input)).select(sequenceSelect).single(),
    )
    return mapAutomationSequence(data)
  },
}
