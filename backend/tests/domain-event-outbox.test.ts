import { describe, expect, it } from 'vitest'
import { fanOutDomainEvent } from '../src/modules/events/dispatcher.js'
import { claimPendingEvents, recordDomainEvent } from '../src/modules/events/repository.js'
import { createDomainEventEnvelope, DomainEventError } from '../src/modules/events/types.js'
import { handleCrmScoringEvent } from '../src/jobs/handlers/crm-scoring.js'

const ids = {
  event: '11111111-1111-4111-8111-111111111111',
  organization: '22222222-2222-4222-8222-222222222222',
  crmInstance: '33333333-3333-4333-8333-333333333333',
  lead: '44444444-4444-4444-8444-444444444444',
  flow: '55555555-5555-4555-8555-555555555555',
}

const eventRow = {
  id: ids.event,
  organization_id: ids.organization,
  crm_instance_id: ids.crmInstance,
  event_type: 'form.submitted',
  schema_version: 1,
  aggregate_type: 'lead' as const,
  aggregate_id: ids.lead,
  lead_id: ids.lead,
  correlation_id: ids.event,
  causation_id: null,
  depth: 0,
  actor: { type: 'system' as const },
  occurred_at: '2026-08-03T12:00:00.000Z',
  automation_trace: [],
  payload: { source: 'external-form', apiKey: '[redacted]' },
  dispatch_status: 'pending' as const,
  attempt_count: 0,
  available_at: '2026-08-03T12:00:00.000Z',
  dispatched_at: null,
  last_error: null,
  created_at: '2026-08-03T12:00:00.000Z',
}

class FakeClient {
  calls: Array<{ sql: string; params?: unknown[] }> = []

  async query<T = Record<string, unknown>>(sql: string, params?: unknown[]) {
    this.calls.push({ sql, params })
    if (sql.includes('INSERT INTO public.domain_events')) return { rows: [eventRow] as T[] }
    return { rows: [] as T[] }
  }
}

describe('domain event envelope and transactional outbox', () => {
  it('inherits correlation context and redacts protected payload values', () => {
    const parent = createDomainEventEnvelope({
      eventId: ids.event,
      eventType: 'form.submitted',
      organizationId: ids.organization,
      aggregateType: 'lead',
      aggregateId: ids.lead,
      actor: { type: 'system' },
      payload: { source: 'form' },
    })

    const child = createDomainEventEnvelope({
      eventType: 'lead.stage_changed',
      organizationId: ids.organization,
      aggregateType: 'lead',
      aggregateId: ids.lead,
      actor: { type: 'system' },
      parent,
      payload: { apiKey: 'do-not-persist', nested: { password: 'also-redacted' } },
    })

    expect(child.correlationId).toBe(parent.correlationId)
    expect(child.causationId).toBe(parent.eventId)
    expect(child.depth).toBe(1)
    expect(child.payload).toEqual({ apiKey: '[redacted]', nested: { password: '[redacted]' } })
  })

  it('rejects an event beyond the automation depth limit', () => {
    expect(() => createDomainEventEnvelope({
      eventType: 'lead.created',
      organizationId: ids.organization,
      aggregateType: 'lead',
      aggregateId: ids.lead,
      actor: { type: 'system' },
      depth: 13,
    })).toThrowError(new DomainEventError('domain_event_max_depth_reached'))
  })

  it('records a normalized event in the same client transaction', async () => {
    const client = new FakeClient()
    const event = await recordDomainEvent(client, {
      eventId: ids.event,
      eventType: 'form.submitted',
      organizationId: ids.organization,
      crmInstanceId: ids.crmInstance,
      aggregateType: 'lead',
      aggregateId: ids.lead,
      leadId: ids.lead,
      actor: { type: 'system' },
      payload: { source: 'form', secret: 'redact-me' },
    })

    expect(event).toMatchObject({
      eventId: ids.event,
      eventType: 'form.submitted',
      correlationId: ids.event,
      depth: 0,
    })
    expect(client.calls[0]?.sql).toContain('ON CONFLICT (id) DO NOTHING')
    expect(client.calls[0]?.params?.at(-1)).toEqual({ source: 'form', secret: '[redacted]' })
  })

  it('claims pending events with a bounded, lock-safe query', async () => {
    const client = new FakeClient()
    client.query = async function<T = Record<string, unknown>>(sql: string, params?: unknown[]) {
      this.calls.push({ sql, params })
      if (sql.includes('WITH claimed AS')) return { rows: [eventRow] as T[] }
      return { rows: [] as T[] }
    }
    const pool = { async connect() { return { query: client.query.bind(client), release() {} } } }

    const events = await claimPendingEvents(pool, Number.POSITIVE_INFINITY)

    expect(events).toHaveLength(1)
    expect(client.calls.find((call) => call.sql.includes('WITH claimed AS'))?.params).toEqual([100])
    expect(client.calls.some((call) => call.sql.includes('FOR UPDATE SKIP LOCKED'))).toBe(true)
  })
})

describe('domain event fan-out', () => {
  it('creates one delivery and one job for each independent consumer', async () => {
    const client = new FakeClient()
    client.query = async function<T = Record<string, unknown>>(sql: string, params?: unknown[]) {
      this.calls.push({ sql, params })
      if (sql.includes('INSERT INTO public.domain_event_deliveries')) {
        const consumerKey = String(params?.[1])
        return {
          rows: [{
            id: `${consumerKey}-delivery`,
            event_id: ids.event,
            consumer_key: consumerKey,
            status: 'pending',
            attempt_count: 0,
            available_at: '2026-08-03T12:00:00.000Z',
            completed_at: null,
            result: {},
            last_error: null,
            created_at: '2026-08-03T12:00:00.000Z',
            updated_at: '2026-08-03T12:00:00.000Z',
          }] as T[],
        }
      }
      return { rows: [] as T[] }
    }
    const jobs: Array<{ name: string; data: unknown; jobId?: string }> = []
    const queue = {
      async add(name: 'events.consume.automation' | 'events.consume.scoring', data: { eventId: string; deliveryId: string; consumerKey: 'automation' | 'scoring' }, options?: { jobId?: string }) {
        jobs.push({ name, data, jobId: options?.jobId })
      },
    }
    const pool = { async connect() { return { ...client, release() {} } } }

    await fanOutDomainEvent(pool, queue, createDomainEventEnvelope({
      eventId: ids.event,
      eventType: 'form.submitted',
      organizationId: ids.organization,
      aggregateType: 'lead',
      aggregateId: ids.lead,
      actor: { type: 'system' },
    }))

    expect(jobs).toHaveLength(2)
    expect(jobs.map((job) => job.name)).toEqual([
      'events.consume.automation',
      'events.consume.scoring',
    ])
    expect(jobs.map((job) => job.jobId)).toEqual([
      `automation:${ids.event}`,
      `scoring:${ids.event}`,
    ])
    expect(client.calls.some((call) => call.sql.includes("dispatch_status = 'dispatched'"))).toBe(true)
  })
})

describe('scoring consumer compatibility', () => {
  it('keeps envelope-only calls side-effect free', async () => {
    const result = await handleCrmScoringEvent(createDomainEventEnvelope({
      eventId: ids.event,
      eventType: 'email.opened',
      organizationId: ids.organization,
      aggregateType: 'email',
      aggregateId: ids.event,
      leadId: ids.lead,
      actor: { type: 'provider', id: 'smtp2go' },
    }))

    expect(result).toEqual({ ignored: 'scoring_pool_not_provided', eventType: 'email.opened' })
  })
})
