import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import type { Queryable } from './repository.js'

export type MutationLeaseEffect = 'draft' | 'internal' | 'external' | 'destructive'

export type MutationLeaseClaims = {
  leaseId: string
  missionId: string
  actionRunId: string
  attemptId: string
  capabilityKey: string
  capabilityVersion: number
  capabilityDefinitionHash: string
  fencingToken: string
  effect: MutationLeaseEffect
  issuedAt: string
  expiresAt: string
}

export function signMutationLease(claims: MutationLeaseClaims, secret: string): string {
  assertSecret(secret)
  assertClaims(claims)
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url')
  const signature = createHmac('sha256', secret).update(payload).digest('base64url')
  return `${payload}.${signature}`
}

export function verifyMutationLease(
  token: string,
  secret: string,
  expected: MutationLeaseClaims,
  now = new Date(),
): MutationLeaseClaims {
  assertSecret(secret)
  const [payload, signature, extra] = token.split('.')
  if (!payload || !signature || extra) throw new Error('mutation_lease_invalid')
  const calculated = createHmac('sha256', secret).update(payload).digest()
  let supplied: Buffer
  try { supplied = Buffer.from(signature, 'base64url') } catch { throw new Error('mutation_lease_invalid') }
  if (supplied.length !== calculated.length || !timingSafeEqual(supplied, calculated)) throw new Error('mutation_lease_invalid_signature')
  let claims: MutationLeaseClaims
  try { claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as MutationLeaseClaims } catch { throw new Error('mutation_lease_invalid') }
  assertClaims(claims)
  if (now.getTime() >= Date.parse(claims.expiresAt)) throw new Error('mutation_lease_expired')
  for (const field of ['leaseId','missionId','actionRunId','attemptId','capabilityKey','capabilityVersion','capabilityDefinitionHash','fencingToken','effect'] as const) {
    if (claims[field] !== expected[field]) throw new Error('mutation_lease_scope_mismatch')
  }
  return claims
}

export async function issueMutationLease(
  client: Queryable,
  secret: string,
  input: Omit<MutationLeaseClaims, 'leaseId' | 'issuedAt' | 'expiresAt'> & {
    organizationId: string; ttlSeconds: number; now?: Date; leaseId?: undefined; issuedAt?: undefined; expiresAt?: undefined
  },
): Promise<{ token: string; claims: MutationLeaseClaims }> {
  assertSecret(secret)
  const now = input.now ?? new Date()
  const ttlSeconds = Math.max(1, Math.min(30, Math.floor(input.ttlSeconds)))
  const claims: MutationLeaseClaims = {
    leaseId: randomUUID(), missionId: input.missionId, actionRunId: input.actionRunId,
    attemptId: input.attemptId, capabilityKey: input.capabilityKey, capabilityVersion: input.capabilityVersion,
    capabilityDefinitionHash: input.capabilityDefinitionHash, fencingToken: input.fencingToken,
    effect: input.effect, issuedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + ttlSeconds * 1_000).toISOString(),
  }
  const token = signMutationLease(claims, secret)
  const result = await client.query<{ id: string }>(
    `INSERT INTO public.action_mutation_leases (
       id, organization_id, mission_id, action_run_id, attempt_id, capability_key,
       capability_version, capability_definition_hash, fencing_token, effect,
       token_hash, issued_at, expires_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
    [claims.leaseId, input.organizationId, claims.missionId, claims.actionRunId, claims.attemptId,
      claims.capabilityKey, claims.capabilityVersion, claims.capabilityDefinitionHash, claims.fencingToken,
      claims.effect, sha256(token), claims.issuedAt, claims.expiresAt],
  )
  if (!result.rows[0]) throw new Error('mutation_lease_issue_failed')
  return { token, claims }
}

export async function consumeMutationLease(client: Queryable, input: {
  token: string
  secret: string
  expected: MutationLeaseClaims
  organizationId: string
  now?: Date
}): Promise<void> {
  const now = input.now ?? new Date()
  const claims = verifyMutationLease(input.token, input.secret, input.expected, now)
  const result = await client.query<{ id: string }>(
    `UPDATE public.action_mutation_leases lease
     SET consumed = TRUE, consumed_at = $4::TIMESTAMPTZ
     WHERE lease.id = $1 AND lease.organization_id = $2 AND lease.token_hash = $3
       AND lease.consumed = FALSE AND lease.revoked_at IS NULL AND lease.expires_at > $4::TIMESTAMPTZ
       AND EXISTS (
         SELECT 1 FROM public.action_resource_claims claim
         WHERE claim.organization_id = lease.organization_id AND claim.mission_id = lease.mission_id
           AND claim.fencing_token = lease.fencing_token AND claim.active = TRUE
           AND claim.lease_expires_at > $4::TIMESTAMPTZ
       ) RETURNING lease.id`,
    [claims.leaseId, input.organizationId, sha256(input.token), now.toISOString()],
  )
  if (!result.rows[0]) throw new Error('mutation_lease_replayed_or_revoked')
}

function assertSecret(secret: string): void {
  if (Buffer.byteLength(secret) < 32) throw new Error('mutation_lease_secret_invalid')
}

function assertClaims(claims: MutationLeaseClaims): void {
  const issued = Date.parse(claims.issuedAt)
  const expires = Date.parse(claims.expiresAt)
  if (!claims.leaseId || !claims.missionId || !claims.actionRunId || !claims.attemptId || !claims.capabilityKey
    || !Number.isInteger(claims.capabilityVersion) || !/^[a-f0-9]{64}$/.test(claims.capabilityDefinitionHash)
    || !/^\d+$/.test(claims.fencingToken) || !Number.isFinite(issued) || !Number.isFinite(expires)
    || expires <= issued || expires - issued > 30_000) throw new Error('mutation_lease_invalid')
}

function sha256(value: string): string { return createHash('sha256').update(value).digest('hex') }
