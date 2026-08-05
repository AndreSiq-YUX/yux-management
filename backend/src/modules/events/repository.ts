import {
  createDomainEventEnvelope,
  DomainEventError,
  type DomainEventDeliveryRow,
  type DomainEventEnvelope,
  type DomainEventInput,
  type DomainEventRow,
} from './types.js'

type Queryable = {
  query: <T = any>(...args: any[]) => Promise<any>
}
type Connectable = {
  connect: () => Promise<Queryable & { release: () => void | Promise<void> }>
}

const DOMAIN_EVENT_COLUMNS = `
  id, organization_id, crm_instance_id, event_type, schema_version,
  aggregate_type, aggregate_id, lead_id, correlation_id, causation_id,
  depth, actor, occurred_at, automation_trace, payload, dispatch_status,
  attempt_count, available_at, dispatched_at, last_error, created_at
`

const QUALIFIED_DOMAIN_EVENT_COLUMNS = DOMAIN_EVENT_COLUMNS
  .split(',')
  .map(column => `event.${column.trim()}`)
  .join(', ')

export async function recordDomainEvent<TPayload extends Record<string, unknown>>(
  client: Queryable,
  input: DomainEventInput<TPayload>,
): Promise<DomainEventEnvelope<TPayload>> {
  const event = createDomainEventEnvelope(input)
  const inserted = await client.query<DomainEventRow>(
    `INSERT INTO public.domain_events (
       id, organization_id, crm_instance_id, event_type, schema_version,
       aggregate_type, aggregate_id, lead_id, correlation_id, causation_id,
       depth, actor, occurred_at, automation_trace, payload
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
     ON CONFLICT (id) DO NOTHING
     RETURNING ${DOMAIN_EVENT_COLUMNS}`,
    [
      event.eventId,
      event.organizationId,
      event.crmInstanceId ?? null,
      event.eventType,
      event.schemaVersion,
      event.aggregateType,
      event.aggregateId,
      event.leadId ?? null,
      event.correlationId,
      event.causationId ?? null,
      event.depth,
      event.actor,
      event.occurredAt,
      event.automationTrace,
      event.payload,
    ],
  )

  if (inserted.rows[0]) return mapDomainEventRow(inserted.rows[0]) as DomainEventEnvelope<TPayload>

  const existing = await client.query<DomainEventRow>(
    `SELECT ${DOMAIN_EVENT_COLUMNS}
     FROM public.domain_events
     WHERE id = $1
     LIMIT 1`,
    [event.eventId],
  )
  if (!existing.rows[0]) throw new DomainEventError('domain_event_insert_failed')
  if (
    existing.rows[0].organization_id !== event.organizationId
    || existing.rows[0].event_type !== event.eventType
  ) {
    throw new DomainEventError('domain_event_id_conflict')
  }
  return mapDomainEventRow(existing.rows[0]) as DomainEventEnvelope<TPayload>
}

export async function getDomainEvent(client: Queryable, eventId: string): Promise<DomainEventEnvelope> {
  const result = await client.query<DomainEventRow>(
    `SELECT ${DOMAIN_EVENT_COLUMNS}
     FROM public.domain_events
     WHERE id = $1
     LIMIT 1`,
    [eventId],
  )
  const row = result.rows[0]
  if (!row) throw new DomainEventError('domain_event_not_found')
  return mapDomainEventRow(row)
}

export async function claimPendingEvents(pool: Connectable, limit = 100): Promise<DomainEventEnvelope[]> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(500, Math.floor(limit))) : 100
    const result = await client.query<DomainEventRow>(
      `WITH claimed AS (
         SELECT id
         FROM public.domain_events
         WHERE dispatch_status IN ('pending', 'failed')
           AND available_at <= NOW()
         ORDER BY created_at ASC
         FOR UPDATE SKIP LOCKED
         LIMIT $1
       )
       UPDATE public.domain_events event
       SET dispatch_status = 'dispatching',
           attempt_count = event.attempt_count + 1
       FROM claimed
       WHERE event.id = claimed.id
       RETURNING ${QUALIFIED_DOMAIN_EVENT_COLUMNS}`,
      [safeLimit],
    )
    await client.query('COMMIT')
    return result.rows.map(mapDomainEventRow)
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    client.release()
  }
}

export async function completeEventDispatch(client: Queryable, eventId: string): Promise<void> {
  await client.query(
    `UPDATE public.domain_events
     SET dispatch_status = 'dispatched', dispatched_at = NOW(), last_error = NULL
     WHERE id = $1 AND dispatch_status = 'dispatching'`,
    [eventId],
  )
}

export async function failEventDispatch(client: Queryable, eventId: string, error: unknown): Promise<void> {
  const message = safeError(error)
  await client.query(
    `UPDATE public.domain_events
     SET dispatch_status = 'failed',
         available_at = NOW() + LEAST(900, POWER(2, GREATEST(attempt_count - 1, 0)) * 5) * INTERVAL '1 second',
         last_error = $2
     WHERE id = $1`,
    [eventId, message],
  )
}

export async function ensureEventDeliveries(
  client: Queryable,
  eventId: string,
  consumerKeys: readonly string[],
): Promise<DomainEventDeliveryRow[]> {
  const deliveries: DomainEventDeliveryRow[] = []
  for (const consumerKey of consumerKeys) {
    const inserted = await client.query<DomainEventDeliveryRow>(
      `INSERT INTO public.domain_event_deliveries (event_id, consumer_key)
       VALUES ($1, $2)
       ON CONFLICT (event_id, consumer_key) DO NOTHING
       RETURNING id, event_id, consumer_key, status, attempt_count, available_at,
                 completed_at, result, last_error, created_at, updated_at`,
      [eventId, consumerKey],
    )
    if (inserted.rows[0]) {
      deliveries.push(inserted.rows[0])
      continue
    }

    const existing = await client.query<DomainEventDeliveryRow>(
      `SELECT id, event_id, consumer_key, status, attempt_count, available_at,
              completed_at, result, last_error, created_at, updated_at
       FROM public.domain_event_deliveries
       WHERE event_id = $1 AND consumer_key = $2
       LIMIT 1`,
      [eventId, consumerKey],
    )
    if (existing.rows[0]) deliveries.push(existing.rows[0])
  }
  return deliveries
}

export async function claimDelivery(client: Queryable, deliveryId: string): Promise<DomainEventDeliveryRow | null> {
  const result = await client.query<DomainEventDeliveryRow>(
    `UPDATE public.domain_event_deliveries
     SET status = 'processing',
         attempt_count = attempt_count + 1,
         updated_at = NOW()
     WHERE id = $1
       AND status IN ('pending', 'failed')
       AND available_at <= NOW()
     RETURNING id, event_id, consumer_key, status, attempt_count, available_at,
               completed_at, result, last_error, created_at, updated_at`,
    [deliveryId],
  )
  return result.rows[0] ?? null
}

export async function completeDelivery(
  client: Queryable,
  deliveryId: string,
  result: Record<string, unknown> = {},
): Promise<void> {
  await client.query(
    `UPDATE public.domain_event_deliveries
     SET status = 'completed', completed_at = NOW(), result = $2,
         last_error = NULL, updated_at = NOW()
     WHERE id = $1`,
    [deliveryId, result],
  )
}

export async function failDelivery(client: Queryable, deliveryId: string, error: unknown): Promise<void> {
  await client.query(
    `UPDATE public.domain_event_deliveries
     SET status = 'failed',
         available_at = NOW() + LEAST(900, POWER(2, GREATEST(attempt_count - 1, 0)) * 5) * INTERVAL '1 second',
         last_error = $2,
         updated_at = NOW()
     WHERE id = $1`,
    [deliveryId, safeError(error)],
  )
}

export function mapDomainEventRow(row: DomainEventRow): DomainEventEnvelope {
  return {
    eventId: row.id,
    eventType: row.event_type,
    schemaVersion: 1,
    organizationId: row.organization_id,
    crmInstanceId: row.crm_instance_id ?? undefined,
    aggregateType: row.aggregate_type,
    aggregateId: row.aggregate_id,
    leadId: row.lead_id ?? undefined,
    correlationId: row.correlation_id,
    causationId: row.causation_id ?? undefined,
    depth: Number(row.depth),
    actor: row.actor,
    occurredAt: toIsoString(row.occurred_at),
    automationTrace: row.automation_trace ?? [],
    payload: row.payload ?? {},
  }
}

function toIsoString(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

function safeError(error: unknown): string {
  return (error instanceof Error ? error.message : String(error))
    .slice(0, 1_000)
    .replace(/Bearer\s+[^\s]+/gi, 'Bearer [redacted]')
}
