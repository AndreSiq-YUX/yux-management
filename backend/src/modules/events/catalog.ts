export const DOMAIN_EVENT_TYPES = [
  'lead.created',
  'form.submitted',
  'lead.pipeline_changed',
  'lead.stage_changed',
  'lead.owner_changed',
  'lead.task_created',
  'lead.task_completed',
  'lead.task_cancelled',
  'lead.task_reopened',
  'lead.interaction_recorded',
  'lead.sequence_enrolled',
  'lead.sequence_paused',
  'lead.sequence_completed',
  'email.queued',
  'email.sent',
  'email.failed',
  'email.delivered',
  'email.opened',
  'email.clicked',
  'email.bounced',
  'email.complained',
  'email.unsubscribed',
  'lead.score_changed',
  'lead.score_threshold_reached',
  'lead.score_manual_adjustment',
  'mission.created',
  'mission.updated',
  'mission.status_changed',
  'mission.plan_proposed',
  'mission.plan_approved',
  'mission.started',
  'mission.paused',
  'mission.cancelled',
  'mission.evaluated',
  'mission.replan_requested',
  'action.started',
  'action.waiting',
  'action.succeeded',
  'action.failed',
  'mission.automation_subprocess_started',
  'mission.automation_subprocess_completed',
  'mission.ownership_conflict',
  'approval.approved',
  'approval.rejected',
] as const

export type DomainEventType = (typeof DOMAIN_EVENT_TYPES)[number]

const domainEventTypeSet = new Set<string>(DOMAIN_EVENT_TYPES)

export function isDomainEventType(value: string): value is DomainEventType {
  return domainEventTypeSet.has(value)
}
export function assertDomainEventType(value: string): asserts value is DomainEventType {
  if (!isDomainEventType(value)) {
    throw new Error(`domain_event_type_not_supported:${value}`)
  }
}
