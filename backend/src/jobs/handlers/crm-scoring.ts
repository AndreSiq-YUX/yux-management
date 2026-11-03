import type { DomainEventEnvelope } from '../../modules/events/types.js'
import { applyLeadScoringEvent } from '../../modules/crm/scoring-engine.js'
import { ingestPrioritySignal, isPrioritySignalEvent } from '../../modules/crm/priority-signals.js'
import { runWithDatabaseRequestContext } from '../../db/request-context.js'
import { inProfileTransaction } from '../../modules/crm/record-profile.js'
import type pg from 'pg'

export async function handleCrmScoringEvent(
  event: DomainEventEnvelope,
  pool?: Pick<pg.Pool,'connect'>,
): Promise<Record<string, unknown>> {
  // Keep the one-argument form available to callers that only validate the
  // envelope; worker deliveries always provide the database pool.
  if (!pool) return { ignored: 'scoring_pool_not_provided', eventType: event.eventType }
  const result = await applyLeadScoringEvent(pool, event)
  if (event.leadId && event.crmInstanceId && isPrioritySignalEvent(event.eventType))
    await runWithDatabaseRequestContext({role:'yux_admin',organizationIds:[event.organizationId],serviceRole:'worker'},
      () => inProfileTransaction(pool,db => ingestPrioritySignal(db,event)))
  return result
}
