import {
  claimPendingEvents,
  completeEventDispatch,
  ensureEventDeliveries,
  failEventDispatch,
} from './repository.js'
import { createBullMqJobId } from '../../jobs/queue.js'
import type { ClaimedDomainEvent } from './types.js'
import { createLeaseOwner } from '../../jobs/leases.js'

export const DOMAIN_EVENT_CONSUMERS = ['automation', 'scoring', 'mission_observer'] as const
export type DomainEventConsumerKey = (typeof DOMAIN_EVENT_CONSUMERS)[number]

export type DomainEventQueue = {
  add(
    name: 'events.consume.automation' | 'events.consume.scoring' | 'events.consume.missionObserver',
    data: { eventId: string; deliveryId: string; consumerKey: DomainEventConsumerKey; organizationId: string },
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
  const events = await claimPendingEvents(pool, limit, createLeaseOwner('outbox-dispatch'))
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
        await failEventDispatch(client, event.eventId, event.claim.owner, event.claim.attempt, error)
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
  event: ClaimedDomainEvent,
  consumers: readonly DomainEventConsumerKey[] = DOMAIN_EVENT_CONSUMERS,
): Promise<void> {
  let deliveries: Awaited<ReturnType<typeof ensureEventDeliveries>>
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    deliveries = await ensureEventDeliveries(client, event.eventId, consumers)
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    client.release()
  }

  for (const delivery of deliveries) {
    if (delivery.status === 'completed') continue
    const consumerKey = delivery.consumer_key as DomainEventConsumerKey
    if (!consumers.includes(consumerKey)) continue
    await queue.add(
      consumerKey === 'automation' ? 'events.consume.automation'
        : consumerKey === 'scoring' ? 'events.consume.scoring'
          : 'events.consume.missionObserver',
      { eventId: event.eventId, deliveryId: delivery.id, consumerKey, organizationId: event.organizationId },
      { jobId: createBullMqJobId(consumerKey, event.eventId) },
    )
  }

  const completionClient = await pool.connect()
  try {
    await completionClient.query('BEGIN')
    const completed = await completeEventDispatch(
      completionClient,
      event.eventId,
      event.claim.owner,
      event.claim.attempt,
    )
    if (!completed) throw new Error('domain_event_dispatch_claim_lost')
    await completionClient.query('COMMIT')
  } catch (error) {
    await completionClient.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    completionClient.release()
  }
}
