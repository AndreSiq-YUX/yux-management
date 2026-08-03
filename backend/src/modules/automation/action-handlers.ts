import type { AppEnv } from '../../config/env.js'
import type { DomainEventEnvelope, LeadCommandContext, Queryable } from './types.js'

export type AutomationActionResult = Record<string, unknown>

export type AutomationLead = Record<string, unknown> & {
  id: string
  organization_id?: string
  crm_instance_id?: string | null
  email?: string | null
  name?: string | null
  owner_id?: string | null
  assigned_to?: string | null
}
export type AutomationCommandServices = {
  moveLeadToPipeline: (context: LeadCommandContext, input: { pipelineId: string; stageId?: string }) => Promise<AutomationActionResult>
  moveLeadToStage: (context: LeadCommandContext, input: { stageId: string }) => Promise<AutomationActionResult>
  assignLeadOwner: (context: LeadCommandContext, input: { ownerMemberId?: string; teamId?: string; ownerId?: string }) => Promise<AutomationActionResult>
  createLeadTask: (context: LeadCommandContext, input: { title: string; description?: string; dueAt?: string; delayMinutes?: number; assignedTo?: string; priority?: string }) => Promise<AutomationActionResult>
  registerLeadActivity: (context: LeadCommandContext, input: { type?: string; title: string; description?: string }) => Promise<AutomationActionResult>
  updateLeadField: (context: LeadCommandContext, input: { field: string; value: unknown }) => Promise<AutomationActionResult>
  enrollLeadInSequence: (context: LeadCommandContext, input: { sequenceId: string; existingEnrollment?: 'skip' | 'resume' | 'restart' }) => Promise<AutomationActionResult>
  pauseLeadSequence: (context: LeadCommandContext, input: { sequenceId?: string; enrollmentId?: string }) => Promise<AutomationActionResult>
  addLeadTag: (context: LeadCommandContext, input: { tagId?: string; tagName?: string }) => Promise<AutomationActionResult>
  sendEmail: (context: LeadCommandContext, input: Record<string, unknown>, lead?: AutomationLead | null, event?: DomainEventEnvelope) => Promise<AutomationActionResult>
  sendWhatsapp: (context: LeadCommandContext, input: Record<string, unknown>, lead?: AutomationLead | null, event?: DomainEventEnvelope) => Promise<AutomationActionResult>
  adjustScore: (context: LeadCommandContext, input: { dimension: 'fit' | 'intent' | 'combined'; delta: number; reason?: string }) => Promise<AutomationActionResult>
  dispatchExternal: (context: LeadCommandContext, actionType: string, input: Record<string, unknown>, lead?: AutomationLead | null, event?: DomainEventEnvelope) => Promise<AutomationActionResult>
}

export type ExecuteActionInput = {
  pool: Queryable
  env?: AppEnv
  services: AutomationCommandServices
  actionType: string
  payload: Record<string, unknown>
  context: LeadCommandContext
  lead?: AutomationLead | null
  event: DomainEventEnvelope
}

export async function executeAutomationAction(input: ExecuteActionInput): Promise<AutomationActionResult> {
  const { actionType, payload, context, services, lead, event } = input

  switch (actionType) {
    case 'move_to_pipeline':
      return services.moveLeadToPipeline(context, {
        pipelineId: requiredString(payload.pipelineId, 'automation_pipeline_id_required'),
        stageId: optionalString(payload.stageId),
      })
    case 'change_stage':
      return services.moveLeadToStage(context, {
        stageId: requiredString(payload.stageId, 'automation_stage_id_required'),
      })
    case 'assign_owner':
      return services.assignLeadOwner(context, {
        ownerMemberId: optionalString(payload.ownerMemberId),
        ownerId: optionalString(payload.ownerId || payload.userId || payload.assignedTo),
        teamId: optionalString(payload.teamId),
      })
    case 'create_task':
      return services.createLeadTask(context, {
        title: optionalString(payload.title) || 'Follow-up de lead',
        description: optionalString(payload.description),
        dueAt: optionalString(payload.dueAt),
        delayMinutes: optionalNumber(payload.delayMinutes),
        assignedTo: optionalString(payload.assignedTo),
        priority: optionalString(payload.priority),
      })
    case 'register_activity':
      return services.registerLeadActivity(context, {
        type: optionalString(payload.type),
        title: optionalString(payload.title) || 'Atividade de automação',
        description: optionalString(payload.description || payload.body),
      })
    case 'update_field':
      return services.updateLeadField(context, {
        field: requiredString(payload.field, 'automation_field_required'),
        value: payload.value,
      })
    case 'enroll_sequence':
      return services.enrollLeadInSequence(context, {
        sequenceId: requiredString(payload.sequenceId, 'automation_sequence_id_required'),
        existingEnrollment: normalizeEnrollmentMode(payload.existingEnrollment),
      })
    case 'pause_sequence':
      return services.pauseLeadSequence(context, {
        sequenceId: optionalString(payload.sequenceId),
        enrollmentId: optionalString(payload.enrollmentId),
      })
    case 'add_tag':
      return services.addLeadTag(context, {
        tagId: optionalString(payload.tagId),
        tagName: optionalString(payload.tagName || payload.name),
      })
    case 'adjust_score':
      return services.adjustScore(context, {
        dimension: normalizeScoreDimension(payload.dimension),
        delta: requiredNumber(payload.delta, 'automation_score_delta_required'),
        reason: optionalString(payload.reason),
      })
    case 'send_email':
      return services.sendEmail(context, payload, lead, event)
    case 'send_whatsapp':
      return services.sendWhatsapp(context, payload, lead, event)
    case 'webhook':
    case 'call_api':
    case 'convert_proposal':
    case 'create_project':
    case 'create_invoice':
    case 'ai_classify_lead':
    case 'ai_generate_message':
    case 'ai_generate_proposal':
      return services.dispatchExternal(context, actionType, payload, lead, event)
    default:
      throw new Error(`automation_action_not_supported:${actionType}`)
  }
}

export function createUnavailableAutomationCommandServices(message = 'automation_command_adapter_required'): AutomationCommandServices {
  const unavailable = async (): Promise<AutomationActionResult> => {
    throw new Error(message)
  }

  return {
    moveLeadToPipeline: unavailable,
    moveLeadToStage: unavailable,
    assignLeadOwner: unavailable,
    createLeadTask: unavailable,
    registerLeadActivity: unavailable,
    updateLeadField: unavailable,
    enrollLeadInSequence: unavailable,
    pauseLeadSequence: unavailable,
    addLeadTag: unavailable,
    sendEmail: unavailable,
    sendWhatsapp: unavailable,
    adjustScore: unavailable,
    dispatchExternal: unavailable,
  }
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function requiredString(value: unknown, errorCode: string) {
  const result = optionalString(value)
  if (!result) throw new Error(errorCode)
  return result
}

function optionalNumber(value: unknown) {
  if (value === undefined || value === null || value === '') return undefined
  const number = Number(value)
  return Number.isFinite(number) ? number : undefined
}

function requiredNumber(value: unknown, errorCode: string) {
  const number = optionalNumber(value)
  if (number === undefined) throw new Error(errorCode)
  return number
}

function normalizeEnrollmentMode(value: unknown): 'skip' | 'resume' | 'restart' {
  return value === 'resume' || value === 'restart' ? value : 'skip'
}

function normalizeScoreDimension(value: unknown): 'fit' | 'intent' | 'combined' {
  return value === 'fit' || value === 'intent' ? value : 'combined'
}
