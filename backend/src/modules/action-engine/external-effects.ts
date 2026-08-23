import type { Connectable, Queryable } from './repository.js'

export type ExternalEffectStatus =
  | 'reserved'
  | 'dispatched'
  | 'confirmed_created'
  | 'confirmed_failed'
  | 'unknown'
  | 'reconciling'
  | 'manual_review'

export type ExternalEffect = {
  id: string
  organizationId: string
  missionId: string
  planId?: string
  runId: string
  attemptId?: string
  capabilityKey: string
  capabilityVersion: number
  providerKey: string
  providerIdempotencyKey: string
  requestHash: string
  requestMetadata: Record<string, unknown>
  status: ExternalEffectStatus
  providerReference?: string
  outcomeEvidence: Record<string, unknown>
  lastErrorCode?: string
  nextReconcileAt?: string
  reconciliationDeadlineAt: string
  dispatchedAt?: string
  resolvedAt?: string
  createdAt: string
  updatedAt: string
}

type ExternalEffectRow = {
  id: string
  organization_id: string
  mission_id: string
  plan_id: string | null
  run_id: string
  attempt_id: string | null
  capability_key: string
  capability_version: number
  provider_key: string
  provider_idempotency_key: string
  request_hash: string
  request_metadata: Record<string, unknown>
  status: ExternalEffectStatus
  provider_reference: string | null
  outcome_evidence: Record<string, unknown>
  last_error_code: string | null
  next_reconcile_at: string | Date | null
  reconciliation_deadline_at: string | Date
  dispatched_at: string | Date | null
  resolved_at: string | Date | null
  created_at: string | Date
  updated_at: string | Date
  created?: boolean
}

export async function reserveExternalEffect(pool: Connectable, input: {
  organizationId: string
  missionId: string
  planId?: string
  runId: string
  attemptId?: string
  capabilityKey: string
  capabilityVersion: number
  providerKey: string
  providerIdempotencyKey: string
  requestHash: string
  requestMetadata?: Record<string, unknown>
  reconciliationDeadlineAt: string
}): Promise<{ effect: ExternalEffect; created: boolean }> {
  return transaction(pool, async (client) => {
    const result = await client.query<ExternalEffectRow>(
      `WITH inserted AS (
         INSERT INTO public.action_external_effects (
           organization_id, mission_id, plan_id, run_id, attempt_id, capability_key, capability_version,
           provider_key, provider_idempotency_key, request_hash, request_metadata, reconciliation_deadline_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         ON CONFLICT (organization_id, capability_key, capability_version, provider_idempotency_key) DO NOTHING
         RETURNING *, TRUE AS created
       )
       SELECT * FROM inserted
       UNION ALL
       SELECT effect.*, FALSE AS created FROM public.action_external_effects effect
       WHERE effect.organization_id = $1 AND effect.capability_key = $6
         AND effect.capability_version = $7 AND effect.provider_idempotency_key = $9
         AND NOT EXISTS (SELECT 1 FROM inserted)
       LIMIT 1`,
      [input.organizationId, input.missionId, input.planId ?? null, input.runId, input.attemptId ?? null,
        input.capabilityKey, input.capabilityVersion, input.providerKey, input.providerIdempotencyKey,
        input.requestHash, input.requestMetadata ?? {}, input.reconciliationDeadlineAt],
    )
    const row = result.rows[0]
    if (!row) throw new Error('external_effect_reservation_failed')
    if (row.request_hash !== input.requestHash || row.provider_key !== input.providerKey || row.mission_id !== input.missionId) {
      throw new Error('external_effect_idempotency_conflict')
    }
    if (row.created) {
      await appendEffectEvent(client, row, null, 'reserved', 'effect_reserved', { requestHash: input.requestHash })
    }
    return { effect: mapEffect(row), created: row.created === true }
  })
}

export async function markExternalEffectDispatched(pool: Connectable, input: {
  effectId: string
  organizationId: string
  attemptId?: string
  evidence?: Record<string, unknown>
}): Promise<ExternalEffect> {
  return transitionExternalEffect(pool, {
    effectId: input.effectId,
    organizationId: input.organizationId,
    fromStatuses: ['reserved'],
    toStatus: 'dispatched',
    eventType: 'provider_dispatch_started',
    evidence: input.evidence ?? {},
    set: { attemptId: input.attemptId, dispatchedAt: new Date().toISOString() },
  })
}

export async function markExternalEffectUnknown(pool: Connectable, input: {
  effectId: string
  organizationId: string
  errorCode: string
  nextReconcileAt: string
  evidence?: Record<string, unknown>
}): Promise<ExternalEffect> {
  return transitionExternalEffect(pool, {
    effectId: input.effectId,
    organizationId: input.organizationId,
    fromStatuses: ['dispatched', 'reconciling'],
    toStatus: 'unknown',
    eventType: 'provider_outcome_unknown',
    evidence: input.evidence ?? {},
    set: { errorCode: input.errorCode, nextReconcileAt: input.nextReconcileAt },
  })
}

export async function resolveExternalEffect(pool: Connectable, input: {
  effectId: string
  organizationId: string
  outcome: 'created' | 'failed'
  providerReference?: string
  evidence: Record<string, unknown>
}): Promise<ExternalEffect> {
  const toStatus = input.outcome === 'created' ? 'confirmed_created' : 'confirmed_failed'
  return transitionExternalEffect(pool, {
    effectId: input.effectId,
    organizationId: input.organizationId,
    fromStatuses: ['dispatched', 'unknown', 'reconciling'],
    toStatus,
    eventType: input.outcome === 'created' ? 'provider_effect_confirmed_created' : 'provider_effect_confirmed_failed',
    evidence: input.evidence,
    set: { providerReference: input.providerReference, resolvedAt: new Date().toISOString() },
  })
}

export async function claimExternalEffectForReconciliation(pool: Connectable, input: {
  effectId: string
  organizationId: string
  now?: string
}): Promise<ExternalEffect | null> {
  return transaction(pool, async (client) => {
    const result = await client.query<ExternalEffectRow>(
      `UPDATE public.action_external_effects
       SET status = 'reconciling', updated_at = NOW()
       WHERE id = $1 AND organization_id = $2 AND status = 'unknown'
         AND COALESCE(next_reconcile_at, NOW()) <= $3::TIMESTAMPTZ
       RETURNING *`,
      [input.effectId, input.organizationId, input.now ?? new Date().toISOString()],
    )
    const row = result.rows[0]
    if (!row) return null
    await appendEffectEvent(client, row, 'unknown', 'reconciling', 'provider_reconciliation_started', {})
    return mapEffect(row)
  })
}

export async function moveExternalEffectToManualReview(pool: Connectable, input: {
  effectId: string
  organizationId: string
  incidentType: string
  summary: string
  evidence: Record<string, unknown>
}): Promise<ExternalEffect> {
  return transaction(pool, async (client) => {
    const current = await loadExternalEffect(client, input.effectId, input.organizationId, true)
    if (!current) throw new Error('external_effect_not_found')
    if (!['unknown', 'reconciling', 'manual_review'].includes(current.status)) throw new Error('external_effect_transition_invalid')
    if (current.status !== 'manual_review') {
      const updated = await client.query<ExternalEffectRow>(
        `UPDATE public.action_external_effects
         SET status = 'manual_review', outcome_evidence = outcome_evidence || $3::jsonb,
             next_reconcile_at = NULL, updated_at = NOW()
         WHERE id = $1 AND organization_id = $2 RETURNING *`,
        [input.effectId, input.organizationId, input.evidence],
      )
      const row = updated.rows[0]
      if (!row) throw new Error('external_effect_transition_failed')
      await appendEffectEvent(client, row, current.status, 'manual_review', 'provider_reconciliation_manual_review', input.evidence)
      await client.query(
        `INSERT INTO public.action_incidents (
           organization_id, mission_id, external_effect_id, incident_type, severity, summary, evidence
         ) SELECT $1,$2,$3,$4,'high',$5,$6
         WHERE NOT EXISTS (
           SELECT 1 FROM public.action_incidents
           WHERE organization_id = $1 AND external_effect_id = $3 AND incident_type = $4 AND status <> 'resolved'
         )`,
        [input.organizationId, current.missionId, input.effectId, input.incidentType, input.summary, input.evidence],
      )
      return mapEffect(row)
    }
    return current
  })
}

export async function getExternalEffect(client: Queryable, effectId: string, organizationId: string): Promise<ExternalEffect | null> {
  return loadExternalEffect(client, effectId, organizationId, false)
}

export async function assertNoUnresolvedExternalEffects(client: Queryable, missionId: string, organizationId: string): Promise<void> {
  const result = await client.query<{ count: string }>(
    `SELECT COUNT(*)::TEXT AS count FROM public.action_external_effects
     WHERE mission_id = $1 AND organization_id = $2
       AND status IN ('dispatched','unknown','reconciling','manual_review')`,
    [missionId, organizationId],
  )
  if (Number(result.rows[0]?.count ?? 0) > 0) throw new Error('external_effect_unresolved')
}

async function transitionExternalEffect(pool: Connectable, input: {
  effectId: string
  organizationId: string
  fromStatuses: ExternalEffectStatus[]
  toStatus: ExternalEffectStatus
  eventType: string
  evidence: Record<string, unknown>
  set: { attemptId?: string; providerReference?: string; errorCode?: string; nextReconcileAt?: string; dispatchedAt?: string; resolvedAt?: string }
}): Promise<ExternalEffect> {
  return transaction(pool, async (client) => {
    const current = await loadExternalEffect(client, input.effectId, input.organizationId, true)
    if (!current) throw new Error('external_effect_not_found')
    if (current.status === input.toStatus) return current
    if (!input.fromStatuses.includes(current.status)) throw new Error('external_effect_transition_invalid')
    const result = await client.query<ExternalEffectRow>(
      `UPDATE public.action_external_effects SET
         status = $3,
         attempt_id = COALESCE($4::UUID, attempt_id),
         provider_reference = COALESCE($5, provider_reference),
         last_error_code = COALESCE($6, last_error_code),
         next_reconcile_at = $7::TIMESTAMPTZ,
         dispatched_at = COALESCE($8::TIMESTAMPTZ, dispatched_at),
         resolved_at = COALESCE($9::TIMESTAMPTZ, resolved_at),
         outcome_evidence = outcome_evidence || $10::jsonb,
         updated_at = NOW()
       WHERE id = $1 AND organization_id = $2 AND status = $11
       RETURNING *`,
      [input.effectId, input.organizationId, input.toStatus, input.set.attemptId ?? null,
        input.set.providerReference ?? null, input.set.errorCode ?? null, input.set.nextReconcileAt ?? null,
        input.set.dispatchedAt ?? null, input.set.resolvedAt ?? null, input.evidence, current.status],
    )
    const row = result.rows[0]
    if (!row) throw new Error('external_effect_transition_race')
    await appendEffectEvent(client, row, current.status, input.toStatus, input.eventType, input.evidence)
    return mapEffect(row)
  })
}

async function loadExternalEffect(client: Queryable, effectId: string, organizationId: string, lock: boolean): Promise<ExternalEffect | null> {
  const result = await client.query<ExternalEffectRow>(
    `SELECT * FROM public.action_external_effects WHERE id = $1 AND organization_id = $2${lock ? ' FOR UPDATE' : ''}`,
    [effectId, organizationId],
  )
  return result.rows[0] ? mapEffect(result.rows[0]) : null
}

async function appendEffectEvent(
  client: Queryable,
  row: Pick<ExternalEffectRow, 'id' | 'organization_id'>,
  fromStatus: ExternalEffectStatus | null,
  toStatus: ExternalEffectStatus,
  eventType: string,
  evidence: Record<string, unknown>,
): Promise<void> {
  await client.query(
    `INSERT INTO public.action_external_effect_events (
       organization_id, effect_id, from_status, to_status, event_type, evidence
     ) VALUES ($1,$2,$3,$4,$5,$6)`,
    [row.organization_id, row.id, fromStatus, toStatus, eventType, evidence],
  )
}

function mapEffect(row: ExternalEffectRow): ExternalEffect {
  return {
    id: row.id,
    organizationId: row.organization_id,
    missionId: row.mission_id,
    ...(row.plan_id ? { planId: row.plan_id } : {}),
    runId: row.run_id,
    ...(row.attempt_id ? { attemptId: row.attempt_id } : {}),
    capabilityKey: row.capability_key,
    capabilityVersion: Number(row.capability_version),
    providerKey: row.provider_key,
    providerIdempotencyKey: row.provider_idempotency_key,
    requestHash: row.request_hash,
    requestMetadata: row.request_metadata ?? {},
    status: row.status,
    ...(row.provider_reference ? { providerReference: row.provider_reference } : {}),
    outcomeEvidence: row.outcome_evidence ?? {},
    ...(row.last_error_code ? { lastErrorCode: row.last_error_code } : {}),
    ...(row.next_reconcile_at ? { nextReconcileAt: toIso(row.next_reconcile_at) } : {}),
    reconciliationDeadlineAt: toIso(row.reconciliation_deadline_at),
    ...(row.dispatched_at ? { dispatchedAt: toIso(row.dispatched_at) } : {}),
    ...(row.resolved_at ? { resolvedAt: toIso(row.resolved_at) } : {}),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  }
}

function toIso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
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
