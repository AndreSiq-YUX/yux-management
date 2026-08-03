import type { DomainEventEnvelope } from '../../modules/events/types.js'

const SCORING_EVENT_TYPES = new Set([
  'form.submitted',
  'lead.interaction_recorded',
  'email.delivered',
  'email.opened',
  'email.clicked',
  'email.bounced',
  'email.complained',
  'email.unsubscribed',
  'lead.task_completed',
  'lead.stage_changed',
])

/**
 * The outbox is already fanned out to scoring in Phase 0. The real scoring
 * engine is introduced by the scoring plan; until then this consumer records
 * a successful no-op so the delivery ledger never blocks other consumers.
 */
export async function handleCrmScoringEvent(event: DomainEventEnvelope): Promise<Record<string, unknown>> {
  if (!SCORING_EVENT_TYPES.has(event.eventType)) {
    return { ignored: 'scoring_event_not_catalogued', eventType: event.eventType }
  }

  return { ignored: 'scoring_not_enabled', eventType: event.eventType }
}
