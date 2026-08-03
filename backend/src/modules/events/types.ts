import { randomUUID } from 'node:crypto'

export const MAX_DOMAIN_EVENT_DEPTH = 12

export type DomainEventAggregateType = 'lead' | 'form_submission' | 'task' | 'sequence_enrollment' | 'email'

export type DomainEventActor = {
  type: 'lead' | 'user' | 'system' | 'provider'
  id?: string
}

export type DomainEventEnvelope<TPayload extends Record<string, unknown> = Record<string, unknown>> = {
  eventId: string
  eventType: string
  schemaVersion: 1
  organizationId: string
  crmInstanceId?: string
  aggregateType: DomainEventAggregateType
  aggregateId: string
  leadId?: string
  correlationId: string
  causationId?: string
  depth: number
  actor: DomainEventActor
  occurredAt: string
  automationTrace: string[]
  payload: TPayload
}

export type DomainEventParent = Pick<
  DomainEventEnvelope,
  'eventId' | 'correlationId' | 'depth' | 'automationTrace'
>

export type DomainEventInput<TPayload extends Record<string, unknown> = Record<string, unknown>> = {
  eventId?: string
  eventType: string
  organizationId: string
  crmInstanceId?: string | null
  aggregateType: DomainEventAggregateType
  aggregateId: string
  leadId?: string | null
  correlationId?: string
  causationId?: string | null
  depth?: number
  actor: DomainEventActor
  occurredAt?: string
  automationTrace?: string[]
  payload?: TPayload
  parent?: DomainEventParent
}

export type LeadCommandContext = {
  organizationId: string
  crmInstanceId: string
  leadId: string
  idempotencyKey: string
  correlationId: string
  causationId: string
  depth: number
  automationTrace: string[]
  actor: DomainEventActor
}

export type DomainEventRow = {
  id: string
  organization_id: string
  crm_instance_id: string | null
  event_type: string
  schema_version: number
  aggregate_type: DomainEventAggregateType
  aggregate_id: string
  lead_id: string | null
  correlation_id: string
  causation_id: string | null
  depth: number
  actor: DomainEventActor
  occurred_at: string | Date
  automation_trace: string[]
  payload: Record<string, unknown>
  dispatch_status: 'pending' | 'dispatching' | 'dispatched' | 'failed'
  attempt_count: number
  available_at: string | Date
  dispatched_at: string | Date | null
  last_error: string | null
  created_at: string | Date
}

export type DomainEventDeliveryRow = {
  id: string
  event_id: string
  consumer_key: string
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'dead_letter'
  attempt_count: number
  available_at: string | Date
  completed_at: string | Date | null
  result: Record<string, unknown>
  last_error: string | null
  created_at: string | Date
  updated_at: string | Date
}

export class DomainEventError extends Error {
  readonly code: string

  constructor(code: string, message = code) {
    super(message)
    this.name = 'DomainEventError'
    this.code = code
  }
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

export function createDomainEventEnvelope<TPayload extends Record<string, unknown>>(
  input: DomainEventInput<TPayload>,
): DomainEventEnvelope<TPayload> {
  const eventId = input.eventId ?? randomUUID()
  const correlationId = input.correlationId ?? input.parent?.correlationId ?? eventId
  const causationId = input.causationId ?? input.parent?.eventId
  const depth = input.depth ?? (input.parent ? input.parent.depth + 1 : 0)
  const automationTrace = [...(input.automationTrace ?? input.parent?.automationTrace ?? [])]

  if (!isUuid(eventId) || !isUuid(input.organizationId) || !isUuid(input.aggregateId)) {
    throw new DomainEventError('domain_event_uuid_required')
  }
  if (input.crmInstanceId && !isUuid(input.crmInstanceId)) {
    throw new DomainEventError('domain_event_crm_instance_uuid_required')
  }
  if (input.leadId && !isUuid(input.leadId)) {
    throw new DomainEventError('domain_event_lead_uuid_required')
  }
  if (!isUuid(correlationId) || (causationId && !isUuid(causationId))) {
    throw new DomainEventError('domain_event_correlation_uuid_required')
  }
  if (!input.eventType.trim()) {
    throw new DomainEventError('domain_event_type_required')
  }
  if (depth < 0 || depth > MAX_DOMAIN_EVENT_DEPTH) {
    throw new DomainEventError('domain_event_max_depth_reached')
  }
  if (automationTrace.some((flowId) => !isUuid(flowId))) {
    throw new DomainEventError('domain_event_trace_uuid_required')
  }

  return {
    eventId,
    eventType: input.eventType.trim(),
    schemaVersion: 1,
    organizationId: input.organizationId,
    crmInstanceId: input.crmInstanceId ?? undefined,
    aggregateType: input.aggregateType,
    aggregateId: input.aggregateId,
    leadId: input.leadId ?? undefined,
    correlationId,
    causationId: causationId ?? undefined,
    depth,
    actor: { ...input.actor },
    occurredAt: input.occurredAt ?? new Date().toISOString(),
    automationTrace,
    payload: sanitizeEventPayload(input.payload ?? {}) as TPayload,
  }
}

export function sanitizeEventPayload(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeEventPayload)
  if (!value || typeof value !== 'object') return value

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => {
      const normalizedKey = key.toLowerCase()
      const protectedKey = ['token', 'secret', 'password', 'authorization', 'api_key', 'apikey'].some((part) => normalizedKey.includes(part))
      return [key, protectedKey ? '[redacted]' : sanitizeEventPayload(entry)]
    }),
  )
}
