import { createHash } from 'node:crypto'
import { enrollLeadInSequence } from '../crm/scheduler.js'
import { recordDomainEvent } from '../events/repository.js'
import type { CapabilityContext } from './capability-registry.js'
import type { Connectable, Queryable } from './repository.js'

type CommandInput = Record<string, unknown>

export function createActionEngineCommands(pool: Connectable, missionId: string): NonNullable<CapabilityContext['commands']> {
  return {
    createTask: (input) => createLeadTask(pool, missionId, input),
    assignLeadOwner: (input) => assignLeadOwner(pool, missionId, input),
    enrollSequence: (input) => enrollSequence(pool, missionId, input),
  }
}

async function createLeadTask(pool: Connectable, missionId: string, input: CommandInput) {
  const organizationId = requiredString(input, 'organizationId')
  const leadId = requiredString(input, 'leadId')
  const idempotencyKey = requiredString(input, 'idempotencyKey')
  const taskId = deterministicUuid(`action-engine-task:${organizationId}:${idempotencyKey}`)
  return transaction(pool, async (client) => {
    const result = await client.query<{ id: string }>(
      `INSERT INTO public.lead_tasks (
         id, organization_id, lead_id, title, description, due_at, assigned_to, priority, metadata
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (id) DO NOTHING
       RETURNING id`,
      [taskId, organizationId, leadId, requiredString(input, 'title'), optionalString(input, 'description'),
        requiredString(input, 'dueAt'), optionalString(input, 'assignedTo'), optionalString(input, 'priority') ?? 'medium',
        { source: 'action_engine', missionId, idempotencyKey }],
    )
    if (result.rows[0]) {
      await recordDomainEvent(client, {
        eventType: 'lead.task_created', organizationId, aggregateType: 'task', aggregateId: taskId, leadId,
        actor: { type: 'system' }, payload: { missionId, taskId, title: requiredString(input, 'title') },
      })
    } else {
      const existing = await client.query<{ id: string }>(
        `SELECT id FROM public.lead_tasks WHERE id = $1 AND organization_id = $2 AND lead_id = $3`,
        [taskId, organizationId, leadId],
      )
      if (!existing.rows[0]) throw new Error('action_engine_task_idempotency_conflict')
    }
    return { id: taskId }
  })
}

async function assignLeadOwner(pool: Connectable, missionId: string, input: CommandInput) {
  const organizationId = requiredString(input, 'organizationId')
  const leadId = requiredString(input, 'leadId')
  const ownerId = requiredString(input, 'ownerId')
  return transaction(pool, async (client) => {
    const result = await client.query<{ id: string }>(
      `UPDATE public.leads SET owner_id = $3, assigned_to = $3, updated_at = NOW()
       WHERE id = $1 AND organization_id = $2 AND owner_id IS DISTINCT FROM $3 RETURNING id`,
      [leadId, organizationId, ownerId],
    )
    if (result.rows[0]) {
      await recordDomainEvent(client, {
        eventType: 'lead.owner_changed', organizationId, aggregateType: 'lead', aggregateId: leadId, leadId,
        actor: { type: 'system' }, payload: { missionId, ownerId },
      })
    } else {
      const existing = await client.query<{ id: string }>(
        `SELECT id FROM public.leads WHERE id = $1 AND organization_id = $2 AND owner_id = $3`,
        [leadId, organizationId, ownerId],
      )
      if (!existing.rows[0]) throw new Error('action_engine_lead_not_found')
    }
    return { leadId, ownerId }
  })
}

async function enrollSequence(pool: Connectable, missionId: string, input: CommandInput) {
  return enrollLeadInSequence(pool as never, {
    organizationId: requiredString(input, 'organizationId'), leadId: requiredString(input, 'leadId'),
    sequenceId: requiredString(input, 'sequenceId'), existingEnrollment: sequenceMode(input.existingEnrollment),
    correlationId: missionId,
  })
}

function requiredString(input: CommandInput, key: string): string {
  const value = input[key]
  if (typeof value !== 'string' || !value.trim()) throw new Error(`action_engine_command_${key}_required`)
  return value
}

function optionalString(input: CommandInput, key: string): string | null {
  const value = input[key]
  return typeof value === 'string' && value.trim() ? value : null
}

function sequenceMode(value: unknown): 'skip' | 'resume' | 'restart' {
  return value === 'resume' || value === 'restart' ? value : 'skip'
}

function deterministicUuid(seed: string): string {
  const hex = createHash('sha256').update(seed).digest('hex').slice(0, 32).split('')
  hex[12] = '4'
  hex[16] = ['8', '9', 'a', 'b'][Number.parseInt(hex[16], 16) % 4]
  const value = hex.join('')
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`
}

async function transaction<T>(pool: Connectable, work: (client: Queryable) => Promise<T>): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await work(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    await client.release()
  }
}
