import { createHash, randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { AuthUser } from '../../auth/routes.js'
import type { DomainEventEnvelope } from '../events/types.js'
import { getInstanceAccess, getLeadAccess, profileError, type ProfileDb } from './record-profile.js'
import type { PrioritySignal } from './priority-model.js'

const day = 86_400_000
export const manualPriorityKinds = [
  'buyer_reply',
  'quote_requested',
  'meeting_booked',
  'meeting_completed',
  'purchase_window',
  'not_interested',
] as const
export const prioritySignalInput = z
  .object({
    requestId: z.uuid(),
    kind: z.enum(manualPriorityKinds),
    channel: z.enum(['whatsapp', 'email', 'call', 'meeting', 'crm']),
    occurredAt: z.iso.datetime({ offset: true }),
    sameAsSignalId: z.uuid().optional(),
    targetDate: z.iso.date().optional(),
  })
  .strict()
  .refine((input) => (input.kind === 'purchase_window') === Boolean(input.targetDate), {
    message: 'Informe a data prevista para um sinal de previsão de compra.',
  })
export const revokePrioritySignalInput = z
  .object({
    requestId: z.uuid(),
    reason: z.string().trim().min(1).max(500),
  })
  .strict()
type SignalRow = {
  id: string
  lead_id: string
  source_key: string
  canonical_key: string
  kind: string
  channel: PrioritySignal['channel']
  actor: PrioritySignal['actor']
  occurred_at: Date
  target_date: string | null
  revoked_at: Date | null
  revoke_reason: string | null
}
type Scope = { organizationId: string; instanceId: string }
type HistoricalEvent = {
  id: string
  lead_id: string
  event_type: string
  aggregate_id: string
  actor_type: string
  occurred_at: Date
  channel: string | null
  message_id: string | null
  task_id: string | null
}
const kindsByEvent = {
  'lead.response_received': 'buyer_reply',
  'lead.task_completed': 'task_completed',
  'lead.stage_changed': 'stage_changed',
} as const
export const isPrioritySignalEvent = (type: string) => Object.hasOwn(kindsByEvent, type)
const columnList =
  'id,lead_id,source_key,canonical_key,kind,channel,actor,occurred_at,target_date::text,revoked_at,revoke_reason'

function projectEvent(event: HistoricalEvent): SignalRow | null {
  const kind = kindsByEvent[event.event_type as keyof typeof kindsByEvent]
  if (
    !kind ||
    (kind === 'buyer_reply' && (event.actor_type !== 'lead' || event.channel !== 'whatsapp'))
  )
    return null
  const identity =
    kind === 'buyer_reply'
      ? event.message_id || event.aggregate_id
      : kind === 'task_completed'
        ? event.task_id || event.aggregate_id
        : event.id
  const key = `${kind}:${identity}`
  return {
    id: event.id,
    lead_id: event.lead_id,
    source_key: key,
    canonical_key: key,
    kind,
    channel: kind === 'buyer_reply' ? 'whatsapp' : 'crm',
    actor: kind === 'buyer_reply' ? 'buyer' : 'operator',
    occurred_at: event.occurred_at,
    target_date: null,
    revoked_at: null,
    revoke_reason: null,
  }
}

async function readSignals(
  db: ProfileDb,
  scope: Scope,
  leadIds: string[],
  since: Date,
  until: Date,
) {
  if (!leadIds.length) return []
  const args = [scope.organizationId, scope.instanceId, leadIds, since, until]
  const stored = await db.query<SignalRow>(
    `SELECT ${columnList} FROM public.crm_priority_signals
    WHERE organization_id=$1 AND crm_instance_id=$2 AND lead_id=ANY($3::uuid[]) AND occurred_at>$4 AND occurred_at<=$5`,
    args,
  )
  const historical = await db.query<HistoricalEvent>(
    `SELECT id,lead_id,event_type,aggregate_id,
      actor->>'type' AS actor_type, occurred_at, payload->>'channel' AS channel,
      payload->>'messageId' AS message_id,payload->>'taskId' AS task_id
    FROM public.domain_events WHERE organization_id=$1 AND crm_instance_id=$2
      AND lead_id=ANY($3::uuid[]) AND occurred_at>$4 AND occurred_at<=$5
      AND event_type=ANY($6::text[]) ORDER BY occurred_at,id`,
    [...args, Object.keys(kindsByEvent)],
  )
  const bySource = new Map(stored.rows.map((row) => [`${row.lead_id}:${row.source_key}`, row]))
  for (const event of historical.rows) {
    const row = projectEvent(event)
    if (row) {
      const key = `${row.lead_id}:${row.source_key}`
      if (!bySource.has(key)) bySource.set(key, row)
    }
  }
  return [...bySource.values()].sort(
    (a, b) => b.occurred_at.getTime() - a.occurred_at.getTime() || a.id.localeCompare(b.id),
  )
}

export async function loadPrioritySignalsForLeads(
  db: ProfileDb,
  scope: Scope,
  leadIds: string[],
  since: Date,
  until: Date,
) {
  const result = new Map<string, PrioritySignal[]>()
  for (const row of await readSignals(db, scope, leadIds, since, until)) {
    if (row.revoked_at) continue
    const signal: PrioritySignal = {
      id: row.id,
      canonicalKey: row.canonical_key,
      kind: row.kind,
      channel: row.channel,
      actor: row.actor,
      occurredAt: row.occurred_at.toISOString(),
      ...(row.target_date ? { targetDate: row.target_date } : {}),
    }
    const leadSignals = result.get(row.lead_id) ?? []
    leadSignals.push(signal)
    result.set(row.lead_id, leadSignals)
  }
  return result
}

async function persistSignal(db: ProfileDb, scope: Scope, row: SignalRow, author: string | null) {
  return (
    await db.query<SignalRow>(
      `INSERT INTO public.crm_priority_signals
    (id,organization_id,crm_instance_id,lead_id,source_key,canonical_key,kind,channel,actor,occurred_at,target_date,created_by)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
    ON CONFLICT (lead_id,source_key) DO NOTHING RETURNING ${columnList}`,
      [
        row.id,
        scope.organizationId,
        scope.instanceId,
        row.lead_id,
        row.source_key,
        row.canonical_key,
        row.kind,
        row.channel,
        row.actor,
        row.occurred_at,
        row.target_date,
        author,
      ],
    )
  ).rows[0]
}

export async function ingestPrioritySignal(
  db: ProfileDb,
  event: DomainEventEnvelope,
): Promise<boolean> {
  if (!event.leadId || !event.crmInstanceId) return false
  const scalar = (value: unknown) => (typeof value === 'string' ? value : null)
  const row = projectEvent({
    id: event.eventId,
    lead_id: event.leadId,
    event_type: event.eventType,
    aggregate_id: event.aggregateId,
    actor_type: event.actor.type,
    occurred_at: new Date(event.occurredAt),
    channel: scalar(event.payload.channel),
    message_id: scalar(event.payload.messageId),
    task_id: scalar(event.payload.taskId),
  })
  if (!row || !Number.isFinite(row.occurred_at.getTime())) return false
  const lead = await db.query(
    `SELECT l.id FROM public.leads l JOIN public.crm_pipelines p ON p.id=l.pipeline_id AND p.organization_id=l.organization_id
    WHERE l.id=$1 AND l.organization_id=$2 AND COALESCE(l.crm_instance_id,p.crm_instance_id)=$3
      AND (l.crm_instance_id IS NULL OR p.crm_instance_id IS NULL OR l.crm_instance_id=p.crm_instance_id)
      AND l.deleted_at IS NULL FOR UPDATE OF l`,
    [event.leadId, event.organizationId, event.crmInstanceId],
  )
  if (!lead.rows[0]) return false
  return Boolean(
    await persistSignal(
      db,
      { organizationId: event.organizationId, instanceId: event.crmInstanceId },
      row,
      null,
    ),
  )
}

async function scopeForLead(db: ProfileDb, user: AuthUser, id: string, write = false) {
  const lead = await getLeadAccess(db, user, id, write)
  await getInstanceAccess(db, user, lead.crm_instance_id!)
  return { organizationId: lead.organization_id, instanceId: lead.crm_instance_id! }
}
const toDto = (row: SignalRow) => ({
  id: row.id,
  kind: row.kind,
  channel: row.channel,
  occurredAt: row.occurred_at.toISOString(),
  targetDate: row.target_date,
  revokedAt: row.revoked_at?.toISOString() ?? null,
  revokeReason: row.revoke_reason,
})
const historyBounds = () => {
  const now = new Date()
  return [new Date(now.getTime() - 730 * day), now] as const
}

export async function listPrioritySignals(db: ProfileDb, user: AuthUser, id: string) {
  const scope = await scopeForLead(db, user, id)
  const rows = await readSignals(db, scope, [id], ...historyBounds())
  return { items: rows.slice(0, 50).map(toDto) }
}

async function signalCommand(
  db: ProfileDb,
  user: AuthUser,
  leadId: string,
  requestId: string,
  input: unknown,
  write: (scope: Scope) => Promise<SignalRow>,
) {
  const scope = await scopeForLead(db, user, leadId, true)
  const hash = createHash('sha256').update(JSON.stringify(input)).digest('hex')
  const prior = (
    await db.query<{ payload_hash: string; result: ReturnType<typeof toDto> }>(
      'SELECT payload_hash,result FROM public.crm_priority_signal_requests WHERE lead_id=$1 AND organization_id=$2 AND request_id=$3',
      [leadId, scope.organizationId, requestId],
    )
  ).rows[0]
  if (prior) {
    if (prior.payload_hash !== hash)
      throw profileError(409, 'Esta solicitação já foi usada para outro registro.')
    return prior.result
  }
  const result = toDto(await write(scope))
  await db.query(
    `INSERT INTO public.crm_priority_signal_requests
    (lead_id,organization_id,request_id,payload_hash,result) VALUES ($1,$2,$3,$4,$5)`,
    [leadId, scope.organizationId, requestId, hash, JSON.stringify(result)],
  )
  return result
}

export function addPrioritySignal(
  db: ProfileDb,
  user: AuthUser,
  leadId: string,
  input: z.infer<typeof prioritySignalInput>,
) {
  return signalCommand(db, user, leadId, input.requestId, input, async (scope) => {
    const date = new Date(input.occurredAt)
    if (date.getTime() > Date.now())
      throw profileError(422, 'A data do sinal deve estar no passado ou no presente.')
    const id = randomUUID()
    const linked = input.sameAsSignalId
      ? (await readSignals(db, scope, [leadId], ...historyBounds())).find(
          (row) => row.id === input.sameAsSignalId && !row.revoked_at,
        )
      : null
    if (input.sameAsSignalId && !linked)
      throw profileError(404, 'Sinal vinculado não encontrado neste lead.')
    const actor = ['buyer_reply', 'quote_requested', 'purchase_window', 'not_interested'].includes(
      input.kind,
    )
      ? 'buyer'
      : 'operator'
    const source = `manual:${id}`
    return (await persistSignal(
      db,
      scope,
      {
        id,
        lead_id: leadId,
        source_key: source,
        canonical_key: linked?.canonical_key ?? source,
        kind: input.kind,
        channel: input.channel,
        actor,
        occurred_at: linked?.occurred_at ?? date,
        target_date: input.targetDate ?? null,
        revoked_at: null,
        revoke_reason: null,
      },
      user.id,
    ))!
  })
}

export function revokePrioritySignal(
  db: ProfileDb,
  user: AuthUser,
  leadId: string,
  signalId: string,
  input: z.infer<typeof revokePrioritySignalInput>,
) {
  return signalCommand(db, user, leadId, input.requestId, { ...input, signalId }, async (scope) => {
    const signal = (await readSignals(db, scope, [leadId], ...historyBounds())).find(
      (row) => row.id === signalId,
    )
    if (!signal) throw profileError(404, 'Sinal não encontrado neste lead.')
    if (signal.revoked_at) throw profileError(409, 'Este sinal já foi revogado.')
    await persistSignal(db, scope, signal, null)
    return (
      await db.query<SignalRow>(
        `UPDATE public.crm_priority_signals SET revoked_at=now(),revoked_by=$4,revoke_reason=$5
      WHERE id=$1 AND lead_id=$2 AND organization_id=$3 RETURNING ${columnList}`,
        [signalId, leadId, scope.organizationId, user.id, input.reason],
      )
    ).rows[0]
  })
}
