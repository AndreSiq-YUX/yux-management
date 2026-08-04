import type { AppEnv } from '../../config/env.js'
import {
  claimDelivery,
  completeDelivery,
  getDomainEvent,
  failDelivery,
} from '../../modules/events/repository.js'
import type { DomainEventQueue } from '../../modules/events/dispatcher.js'
import type { AutomationJobQueue } from '../../modules/automation/types.js'
import { handleCrmScoringEvent } from './crm-scoring.js'
import { handleAutomationDispatch } from './automation.js'

type DomainEventJobData = {
  eventId?: unknown
  deliveryId?: unknown
  consumerKey?: unknown
  limit?: unknown
}

export async function handleDomainEventDispatch(
  pool: { connect: () => Promise<any> },
  queue: DomainEventQueue,
  data: DomainEventJobData,
) {
  const { dispatchPendingDomainEvents } = await import('../../modules/events/dispatcher.js')
  const limit = typeof data.limit === 'number' ? data.limit : 100
  return dispatchPendingDomainEvents(pool, queue, limit)
}

export async function handleDomainEventDelivery(
  pool: { connect: () => Promise<any>; query: (...args: any[]) => Promise<any> },
  env: AppEnv,
  data: DomainEventJobData,
  queue?: DomainEventQueue & AutomationJobQueue,
): Promise<{ ok: true; duplicate?: boolean; result?: Record<string, unknown> }> {
  const deliveryId = stringValue(data.deliveryId)
  const eventId = stringValue(data.eventId)
  const consumerKey = stringValue(data.consumerKey)
  if (!deliveryId || !eventId || !['automation', 'scoring'].includes(consumerKey)) {
    throw new Error('domain_event_delivery_context_required')
  }

  const claimClient = await pool.connect()
  let claimed: Awaited<ReturnType<typeof claimDelivery>>
  let event
  try {
    await claimClient.query('BEGIN')
    claimed = await claimDelivery(claimClient, deliveryId)
    if (!claimed) {
      await claimClient.query('ROLLBACK')
      return { ok: true, duplicate: true }
    }
    event = await getDomainEvent(claimClient, eventId)
    await claimClient.query('COMMIT')
  } catch (error) {
    await claimClient.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    claimClient.release()
  }

  try {
    const result = consumerKey === 'scoring'
      ? await handleCrmScoringEvent(event, pool)
      : await handleAutomationDispatch(pool, env, {
        event: {
          ...event,
          type: event.eventType,
          eventId: event.eventId,
        },
      }, queue)
    await completeDelivery(pool, deliveryId, result)
    return { ok: true, result }
  } catch (error) {
    await failDelivery(pool, deliveryId, error)
    throw error
  }
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}
