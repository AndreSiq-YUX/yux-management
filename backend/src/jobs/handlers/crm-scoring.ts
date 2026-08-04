import type { DomainEventEnvelope } from '../../modules/events/types.js'
import { applyLeadScoringEvent } from '../../modules/crm/scoring-engine.js'

type ScoringPool = { connect: () => Promise<any> }

export async function handleCrmScoringEvent(
  event: DomainEventEnvelope,
  pool?: ScoringPool,
): Promise<Record<string, unknown>> {
  // Keep the one-argument form available to callers that only validate the
  // envelope; worker deliveries always provide the database pool.
  if (!pool) return { ignored: 'scoring_pool_not_provided', eventType: event.eventType }
  return applyLeadScoringEvent(pool, event)
}
