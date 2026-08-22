import {
  claimPendingEvents,
  completeEventDispatch,
  ensureEventDeliveries,
  failEventDispatch,
} from './repository.js'
import { createBullMqJobId } from '../../jobs/queue.js'
import type { DomainEventEnvelope } from './types.js'

export const DOMAIN_EVENT_CONSUMERS = ['automation', 'scoring', 'mission_observer'] as const
export type DomainEventConsumerKey = (typeof DOMAIN_EVENT_CONSUMERS)[number]

export type DomainEventQueue = {
  add(
    name: 'events.consume.automation' | 'events.consume.scoring' | 'events.consume.missionObserver',
    data: { eventId: string; deliveryId: string; consumerKey: DomainEventConsumerKey },
    options?: { jobId?: string },
  ): Promise<unknown>
}

export type DomainEventDispatchResult = {
  claimed: number
  dispatched: number
  failed: number
}

export async function dispatchPendingDomainEvents(
  pool: { connect: () => Promise<any> },
  queue: DomainEventQueue,
  limit = 100,
): Promise<DomainEventDispatchResult> {
  const events = await claimPendingEvents(pool, limit)
  let dispatched = 0
  let failed = 0

  for (const event of events) {
    try {
      await fanOutDomainEvent(pool, queue, event)
      dispatched += 1
    } catch (error) {
      failed += 1
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        await failEventDispatch(client, event.eventId, error)
        await client.query('COMMIT')
      } catch (failure) {
        await client.query('ROLLBACK').catch(() => undefined)
        throw failure
      } finally {
        client.release()
      }
    }
  }

  return { claimed: events.length, dispatched, failed }
}

export async function fanOutDomainEvent(
  pool: { connect: () => Promise<any> },
  queue: DomainEventQueue,
  event: DomainEventEnvelope,
  consumers: readonly DomainEventConsumerKey[] = DOMAIN_EVENT_CONSUMERS,
): Promise<void> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const deliveries = await ensureEventDeliveries(client, event.eventId, consumers)
    for (const delivery of deliveries) {
      if (delivery.status === 'completed') continue
      const consumerKey = delivery.consumer_key as DomainEventConsumerKey
      if (!consumers.includes(consumerKey)) continue
      await queue.add(
        consumerKey === 'automation' ? 'events.consume.automation'
          : consumerKey === 'scoring' ? 'events.consume.scoring'
            : 'events.consume.missionObserver',
        { eventId: event.eventId, deliveryId: delivery.id, consumerKey },
        { jobId: createBullMqJobId(consumerKey, event.eventId) },
      )
    }
    await completeEventDispatch(client, event.eventId)
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    client.release()
  }
}
