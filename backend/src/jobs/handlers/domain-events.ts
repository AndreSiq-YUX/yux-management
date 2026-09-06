import type { AppEnv } from '../../config/env.js'
import type pg from 'pg'
import {
  claimDelivery,
  completeDelivery,
  getDomainEvent,
  failDelivery,
  renewDeliveryLease,
} from '../../modules/events/repository.js'
import { createLeaseOwner, startLeaseHeartbeat } from '../leases.js'
import type { DomainEventQueue } from '../../modules/events/dispatcher.js'
import type { AutomationJobQueue } from '../../modules/automation/types.js'
import { handleCrmScoringEvent } from './crm-scoring.js'
import { handleAutomationDispatch } from './automation.js'
import { observeDomainEvent } from '../../modules/action-engine/observer.js'
import { handleInboundMessage } from './omnichannel.js'
import { handleCrmSequenceDeliveryRequested } from './crm-dispatch.js'

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
  queue?: DomainEventQueue & AutomationJobQueue & {
    add(
      name: 'email.send' | 'omnichannel.dispatchOutbound',
      data: Record<string, unknown>,
      options?: { jobId?: string },
    ): Promise<unknown>
  },
): Promise<{ ok: true; duplicate?: boolean; result?: Record<string, unknown> }> {
  const deliveryId = stringValue(data.deliveryId)
  const eventId = stringValue(data.eventId)
  const consumerKey = stringValue(data.consumerKey)
  if (!deliveryId || !eventId || !['automation', 'scoring', 'mission_observer', 'omnichannel', 'crm_dispatch'].includes(consumerKey)) {
    throw new Error('domain_event_delivery_context_required')
  }

  const claimClient = await pool.connect()
  const leaseOwner = createLeaseOwner(`domain-event:${consumerKey}`)
  let claimed: Awaited<ReturnType<typeof claimDelivery>>
  let event
  try {
    await claimClient.query('BEGIN')
    claimed = await claimDelivery(claimClient, deliveryId, leaseOwner)
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

  const attempt = Number(claimed.attempt_count)
  const stopHeartbeat = startLeaseHeartbeat(
    () => renewDeliveryLease(pool, deliveryId, leaseOwner, attempt),
  )
  try {
    const result = consumerKey === 'crm_dispatch'
      ? await handleCrmSequenceDeliveryRequested(pool, event, queue)
      : consumerKey === 'omnichannel'
        ? await consumeOmnichannelInbound(pool, env, event, attempt, queue)
      : consumerKey === 'scoring'
        ? await handleCrmScoringEvent(event, pool)
        : consumerKey === 'mission_observer'
          ? await observeDomainEvent(pool, event)
          : await handleAutomationDispatch(pool, env, {
          event: {
            ...event,
            type: event.eventType,
            eventId: event.eventId,
          },
          }, queue)
    const completed = await completeDelivery(pool, deliveryId, leaseOwner, attempt, result)
    if (!completed) throw new Error('domain_event_delivery_claim_lost')
    return { ok: true, result }
  } catch (error) {
    await failDelivery(pool, deliveryId, leaseOwner, attempt, error)
    throw error
  } finally {
    await stopHeartbeat()
  }
}

async function consumeOmnichannelInbound(
  pool: Pick<pg.Pool, 'query'>,
  env: AppEnv,
  event: Awaited<ReturnType<typeof getDomainEvent>>,
  attempt: number,
  queue?: { add(name: 'omnichannel.dispatchOutbound', data: Record<string, unknown>): Promise<unknown> },
) {
  if (event.eventType !== 'omnichannel.inbound.received' || event.aggregateType !== 'channel_webhook_event') {
    throw new Error('omnichannel_domain_event_type_required')
  }
  const webhookEventId = stringValue(event.payload.webhookEventId)
  if (!webhookEventId || webhookEventId !== event.aggregateId) {
    throw new Error('omnichannel_webhook_event_reference_required')
  }
  return handleInboundMessage(pool, env, {
    eventId: webhookEventId,
    recoverProcessing: attempt > 1,
  }, queue)
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}
