import type { Queryable } from './repository.js'
import type { OwnershipMode } from './types.js'

export type ResourceClaim = {
  id: string
  organizationId: string
  missionId: string
  missionLabel: string
  resourceKey: string
  scope: string
  mode: OwnershipMode
  fencingToken: bigint
  leaseExpiresAt: string
  lastRenewedAt: string
}

type ClaimRow = {
  id: string; organization_id: string; mission_id: string; mission_label: string;
  resource_key: string; scope: string; mode: OwnershipMode; fencing_token: string | number | bigint;
  lease_expires_at: string | Date; last_renewed_at: string | Date;
}

export class ResourceClaimConflict extends Error {
  constructor(
    readonly ownerMissionId: string,
    readonly ownerMissionLabel: string,
    readonly leaseExpiresAt: string,
  ) {
    super('resource_claim_conflict')
    this.name = 'ResourceClaimConflict'
  }
}

export async function acquireResourceClaim(client: Queryable, input: {
  organizationId: string
  missionId: string
  missionLabel: string
  resourceKey: string
  scope: string
  mode: OwnershipMode
  ttlSeconds: number
  now?: Date
}): Promise<ResourceClaim> {
  assertClaimInput(input)
  const now = input.now ?? new Date()
  const expiresAt = new Date(now.getTime() + input.ttlSeconds * 1_000).toISOString()
  const lockKey = `${input.organizationId}\u001f${input.resourceKey}\u001f${input.scope}`
  await client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [lockKey])
  await client.query(
    `UPDATE public.action_resource_claims SET active = FALSE, released_at = $4::TIMESTAMPTZ
     WHERE organization_id = $1 AND resource_key = $2 AND scope = $3
       AND active = TRUE AND lease_expires_at <= $4::TIMESTAMPTZ`,
    [input.organizationId, input.resourceKey, input.scope, now.toISOString()],
  )
  const active = await client.query<ClaimRow>(
    `SELECT * FROM public.action_resource_claims
     WHERE organization_id = $1 AND resource_key = $2 AND scope = $3
       AND active = TRUE AND lease_expires_at > $4::TIMESTAMPTZ
     ORDER BY acquired_at FOR UPDATE`,
    [input.organizationId, input.resourceKey, input.scope, now.toISOString()],
  )
  const incompatible = active.rows.find((claim) =>
    claim.mission_id !== input.missionId && (input.mode === 'exclusive' || claim.mode === 'exclusive'))
  if (incompatible) {
    throw new ResourceClaimConflict(
      incompatible.mission_id,
      incompatible.mission_label,
      toIso(incompatible.lease_expires_at),
    )
  }
  const sameMission = active.rows.find((claim) => claim.mission_id === input.missionId)
  if (sameMission) {
    const renewed = await client.query<ClaimRow>(
      `UPDATE public.action_resource_claims
       SET lease_expires_at = $2::TIMESTAMPTZ, last_renewed_at = $3::TIMESTAMPTZ,
           mission_label = $4
       WHERE id = $1 AND active = TRUE RETURNING *`,
      [sameMission.id, expiresAt, now.toISOString(), input.missionLabel],
    )
    if (!renewed.rows[0]) throw new Error('resource_claim_renewal_race')
    return mapClaim(renewed.rows[0])
  }
  const token = await client.query<{ fencing_token: string | number | bigint }>(
    `SELECT COALESCE(MAX(fencing_token), 0) + 1 AS fencing_token
     FROM public.action_resource_claims
     WHERE organization_id = $1 AND resource_key = $2 AND scope = $3`,
    [input.organizationId, input.resourceKey, input.scope],
  )
  const inserted = await client.query<ClaimRow>(
    `INSERT INTO public.action_resource_claims (
       organization_id, mission_id, mission_label, resource_key, scope, mode,
       fencing_token, lease_expires_at, last_renewed_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [input.organizationId, input.missionId, input.missionLabel, input.resourceKey, input.scope,
      input.mode, String(token.rows[0]?.fencing_token ?? 1), expiresAt, now.toISOString()],
  )
  if (!inserted.rows[0]) throw new Error('resource_claim_insert_failed')
  return mapClaim(inserted.rows[0])
}

export async function renewResourceClaim(client: Queryable, input: {
  claimId: string; organizationId: string; missionId: string; fencingToken: bigint; ttlSeconds: number; now?: Date
}): Promise<ResourceClaim> {
  const now = input.now ?? new Date()
  const expiresAt = new Date(now.getTime() + input.ttlSeconds * 1_000).toISOString()
  const result = await client.query<ClaimRow>(
    `UPDATE public.action_resource_claims
     SET lease_expires_at = $6::TIMESTAMPTZ, last_renewed_at = $5::TIMESTAMPTZ
     WHERE id = $1 AND organization_id = $2 AND mission_id = $3 AND fencing_token = $4
       AND active = TRUE AND lease_expires_at > $5::TIMESTAMPTZ RETURNING *`,
    [input.claimId, input.organizationId, input.missionId, String(input.fencingToken), now.toISOString(), expiresAt],
  )
  if (!result.rows[0]) throw new Error('resource_claim_stale_fencing_token')
  return mapClaim(result.rows[0])
}

export async function renewMissionResourceClaims(
  client: Queryable,
  missionId: string,
  organizationId: string,
  ttlSeconds = 900,
): Promise<number> {
  const result = await client.query<{ known: number | string; renewed: number | string }>(
    `WITH known AS (
       SELECT COUNT(DISTINCT (resource_key, scope))::INT AS count FROM public.action_resource_claims
       WHERE mission_id = $1 AND organization_id = $2
     ), renewed AS (
       UPDATE public.action_resource_claims
       SET lease_expires_at = NOW() + ($3::TEXT || ' seconds')::INTERVAL, last_renewed_at = NOW()
       WHERE mission_id = $1 AND organization_id = $2 AND active = TRUE AND lease_expires_at > NOW()
       RETURNING id
     ) SELECT (SELECT count FROM known) AS known, COUNT(*)::INT AS renewed FROM renewed`,
    [missionId, organizationId, ttlSeconds],
  )
  const known = Number(result.rows[0]?.known ?? 0)
  const renewed = Number(result.rows[0]?.renewed ?? 0)
  if (known !== renewed) throw new Error('resource_claim_stale_fencing_token')
  return renewed
}

export async function assertFencingToken(client: Queryable, input: {
  organizationId: string; missionId: string; resourceKey: string; scope: string; fencingToken: bigint
}): Promise<void> {
  const result = await client.query<{ id: string }>(
    `SELECT id FROM public.action_resource_claims
     WHERE organization_id = $1 AND mission_id = $2 AND resource_key = $3 AND scope = $4
       AND fencing_token = $5 AND active = TRUE AND lease_expires_at > NOW() LIMIT 1`,
    [input.organizationId, input.missionId, input.resourceKey, input.scope, String(input.fencingToken)],
  )
  if (!result.rows[0]) throw new Error('resource_claim_stale_fencing_token')
}

export async function releaseResourceClaims(client: Queryable, missionId: string, organizationId: string): Promise<number> {
  const result = await client.query(
    `UPDATE public.action_resource_claims SET active = FALSE, released_at = NOW()
     WHERE mission_id = $1 AND organization_id = $2 AND active = TRUE`,
    [missionId, organizationId],
  )
  return result.rowCount ?? 0
}

function assertClaimInput(input: { resourceKey: string; scope: string; ttlSeconds: number }): void {
  if (!input.resourceKey.trim() || !input.scope.trim()) throw new Error('resource_claim_identity_invalid')
  if (!Number.isInteger(input.ttlSeconds) || input.ttlSeconds < 15 || input.ttlSeconds > 86_400) {
    throw new Error('resource_claim_ttl_invalid')
  }
}

function mapClaim(row: ClaimRow): ResourceClaim {
  return {
    id: row.id, organizationId: row.organization_id, missionId: row.mission_id,
    missionLabel: row.mission_label, resourceKey: row.resource_key, scope: row.scope, mode: row.mode,
    fencingToken: BigInt(row.fencing_token), leaseExpiresAt: toIso(row.lease_expires_at),
    lastRenewedAt: toIso(row.last_renewed_at),
  }
}

function toIso(value: string | Date): string { return value instanceof Date ? value.toISOString() : new Date(value).toISOString() }
