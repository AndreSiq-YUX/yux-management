import { createHash } from 'node:crypto'
import type { CapabilityRegistry } from './capability-registry.js'
import { getMission, type Queryable } from './repository.js'
import type { AutonomyEnvelope, AutonomyGrant } from './types.js'
import { recordDomainEvent } from '../events/repository.js'

type GrantRow = {
  id: string; organization_id: string; mission_id: string; grant_version: number; mission_version: number;
  envelope: AutonomyEnvelope; envelope_hash: string; starts_at: string | Date; expires_at: string | Date;
  requested_by: string; created_at: string | Date; event_types: string[]; approved_by: string | null;
  approved_at: string | Date | null; revoked_by: string | null; revoked_at: string | Date | null; revocation_reason: string | null;
}

export function hashAutonomyEnvelope(input: {
  missionId: string; missionVersion: number; envelope: AutonomyEnvelope; startsAt: string; expiresAt: string
}): string {
  return createHash('sha256').update(stable(input)).digest('hex')
}

export function validateAutonomyGrantEnvelope(input: {
  requested: AutonomyEnvelope
  missionEnvelope: AutonomyEnvelope
  registry: CapabilityRegistry
  startsAt: string
  now?: Date
}): void {
  const now = input.now ?? new Date()
  if (input.requested.mode !== 'autonomous' || input.missionEnvelope.mode !== 'autonomous') throw new Error('autonomy_grant_mode_invalid')
  if (Date.parse(input.startsAt) < now.getTime() - 60_000 || Date.parse(input.requested.expiresAt) <= Date.parse(input.startsAt)) throw new Error('autonomy_grant_window_invalid')
  if (Date.parse(input.requested.expiresAt) > Date.parse(input.missionEnvelope.expiresAt)) throw new Error('autonomy_grant_expiry_exceeds_mission')
  if (decimalGreater(input.requested.maxTotalCostBrl, input.missionEnvelope.maxTotalCostBrl)) throw new Error('autonomy_grant_budget_exceeds_mission')
  if (decimalGreater(input.requested.maxHumanHours, input.missionEnvelope.maxHumanHours)) throw new Error('autonomy_grant_human_hours_exceeds_mission')
  if ((input.requested.maxExternalContacts ?? 0) > (input.missionEnvelope.maxExternalContacts ?? 0)) throw new Error('autonomy_grant_contacts_exceed_mission')
  const allowedModules = new Set(input.missionEnvelope.allowedModules)
  if (input.requested.allowedModules.some(moduleKey => !allowedModules.has(moduleKey))) throw new Error('autonomy_grant_module_exceeds_mission')
  const missionCapabilities = new Set(input.missionEnvelope.allowedCapabilityKeys)
  for (const key of input.requested.allowedCapabilityKeys) {
    if (missionCapabilities.size > 0 && !missionCapabilities.has(key)) throw new Error('autonomy_grant_capability_exceeds_mission')
    const definitions = input.registry.listMetadata().filter(item => item.key === key)
    if (definitions.length === 0) throw new Error('autonomy_grant_capability_unknown')
    if (definitions.some(item => item.effect === 'destructive')) throw new Error('autonomy_grant_destructive_capability_forbidden')
  }
}

export async function requestAutonomyGrant(client: Queryable, registry: CapabilityRegistry, input: {
  organizationId: string; missionId: string; expectedMissionVersion: number; envelope: AutonomyEnvelope;
  startsAt?: string; requestedBy: string; now?: Date
}): Promise<AutonomyGrant> {
  const now = input.now ?? new Date()
  const locked = await client.query<{ version:number }>(
    `SELECT version FROM public.action_missions WHERE id=$1 AND organization_id=$2 FOR UPDATE`,
    [input.missionId,input.organizationId],
  )
  if (!locked.rows[0]) throw new Error('mission_not_found')
  if (Number(locked.rows[0].version) !== input.expectedMissionVersion) throw new Error('mission_version_conflict')
  const mission = await getMission(client, input.missionId, input.organizationId)
  if (!mission) throw new Error('mission_not_found')
  if (mission.version !== input.expectedMissionVersion) throw new Error('mission_version_conflict')
  if (['succeeded','failed','expired','cancelled'].includes(mission.status)) throw new Error('autonomy_grant_mission_terminal')
  const startsAt = input.startsAt ?? now.toISOString()
  validateAutonomyGrantEnvelope({ requested: input.envelope, missionEnvelope: mission.autonomyEnvelope, registry, startsAt, now })
  const envelopeHash = hashAutonomyEnvelope({ missionId: mission.id, missionVersion: mission.version, envelope: input.envelope, startsAt, expiresAt: input.envelope.expiresAt })
  const version = await client.query<{ grant_version: number }>(
    `SELECT COALESCE(MAX(grant_version),0)::INT+1 AS grant_version FROM public.action_autonomy_grants WHERE mission_id=$1`,
    [input.missionId],
  )
  const inserted = await client.query<{ id: string }>(
    `INSERT INTO public.action_autonomy_grants
       (organization_id,mission_id,grant_version,mission_version,envelope,envelope_hash,starts_at,expires_at,requested_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
    [input.organizationId,input.missionId,Number(version.rows[0]?.grant_version ?? 1),mission.version,input.envelope,envelopeHash,startsAt,input.envelope.expiresAt,input.requestedBy],
  )
  const grantId = inserted.rows[0]?.id
  if (!grantId) throw new Error('autonomy_grant_insert_failed')
  await client.query(
    `INSERT INTO public.action_autonomy_grant_events (organization_id,grant_id,event_type,actor_id,subject_hash)
     VALUES ($1,$2,'requested',$3,$4)`,
    [input.organizationId,grantId,input.requestedBy,envelopeHash],
  )
  await recordDomainEvent(client, { eventType:'mission.autonomy_grant_requested',organizationId:input.organizationId,aggregateType:'mission',aggregateId:input.missionId,actor:{type:'user',id:input.requestedBy},payload:{grantId,envelopeHash,missionVersion:mission.version} })
  return getAutonomyGrant(client, grantId, input.organizationId).then(requiredGrant)
}

export async function approveAutonomyGrant(client: Queryable, input: {
  organizationId: string; missionId: string; grantId: string; expectedMissionVersion: number;
  subjectHash: string; approvedBy: string; now?: Date
}): Promise<AutonomyGrant> {
  const grant = await getAutonomyGrant(client, input.grantId, input.organizationId)
  if (!grant || grant.missionId !== input.missionId) throw new Error('autonomy_grant_not_found')
  const now = input.now ?? new Date()
  validateAutonomyGrantApproval(grant, { expectedMissionVersion:input.expectedMissionVersion, subjectHash:input.subjectHash, now })
  const locked = await client.query<{ version:number }>(
    `SELECT version FROM public.action_missions WHERE id=$1 AND organization_id=$2 FOR UPDATE`,
    [input.missionId,input.organizationId],
  )
  if (!locked.rows[0] || Number(locked.rows[0].version) !== input.expectedMissionVersion) throw new Error('mission_version_conflict')
  const mission = await getMission(client, input.missionId, input.organizationId)
  if (!mission || mission.version !== input.expectedMissionVersion) throw new Error('mission_version_conflict')
  await client.query(
    `INSERT INTO public.action_autonomy_grant_events (organization_id,grant_id,event_type,actor_id,subject_hash,occurred_at)
     VALUES ($1,$2,'approved',$3,$4,$5),($1,$2,'activated',$3,$4,$5)`,
    [input.organizationId,input.grantId,input.approvedBy,input.subjectHash,now.toISOString()],
  )
  await recordDomainEvent(client, { eventType:'mission.autonomy_grant_activated',organizationId:input.organizationId,aggregateType:'mission',aggregateId:input.missionId,actor:{type:'user',id:input.approvedBy},payload:{grantId:input.grantId,envelopeHash:input.subjectHash} })
  return getAutonomyGrant(client, input.grantId, input.organizationId).then(requiredGrant)
}

export function validateAutonomyGrantApproval(grant: AutonomyGrant, input: { expectedMissionVersion:number; subjectHash:string; now?:Date }): void {
  if (grant.status !== 'pending') throw new Error('autonomy_grant_not_pending')
  if (grant.missionVersion !== input.expectedMissionVersion) throw new Error('mission_version_conflict')
  if (grant.envelopeHash !== input.subjectHash) throw new Error('autonomy_grant_subject_changed')
  if (Date.parse(grant.expiresAt) <= (input.now ?? new Date()).getTime()) throw new Error('autonomy_grant_expired')
}

export async function revokeAutonomyGrant(client: Queryable, input: {
  organizationId: string; missionId: string; grantId: string; revokedBy: string; reason: string; now?: Date
}): Promise<AutonomyGrant> {
  const grant = await getAutonomyGrant(client, input.grantId, input.organizationId)
  if (!grant || grant.missionId !== input.missionId) throw new Error('autonomy_grant_not_found')
  if (!['pending','active'].includes(grant.status)) throw new Error('autonomy_grant_not_revocable')
  await client.query(
    `INSERT INTO public.action_autonomy_grant_events (organization_id,grant_id,event_type,actor_id,subject_hash,reason,occurred_at)
     VALUES ($1,$2,'revoked',$3,$4,$5,$6)`,
    [input.organizationId,input.grantId,input.revokedBy,grant.envelopeHash,input.reason.trim(),(input.now ?? new Date()).toISOString()],
  )
  await recordDomainEvent(client, { eventType:'mission.autonomy_grant_revoked',organizationId:input.organizationId,aggregateType:'mission',aggregateId:input.missionId,actor:{type:'user',id:input.revokedBy},payload:{grantId:input.grantId,reason:input.reason.trim()} })
  return getAutonomyGrant(client, input.grantId, input.organizationId).then(requiredGrant)
}

export async function getAutonomyGrant(client: Queryable, grantId: string, organizationId: string): Promise<AutonomyGrant | null> {
  const result = await client.query<GrantRow>(grantSelect('grant.id=$1 AND grant.organization_id=$2'), [grantId, organizationId])
  return result.rows[0] ? mapGrant(result.rows[0]) : null
}

export async function getActiveAutonomyGrant(client: Queryable, missionId: string, organizationId: string, now = new Date()): Promise<AutonomyGrant | null> {
  const result = await client.query<GrantRow>(`${grantSelect('grant.mission_id=$1 AND grant.organization_id=$2')} ORDER BY grant.grant_version DESC`, [missionId, organizationId])
  return result.rows.map(row=>mapGrant(row,now)).find(grant => grant.status === 'active' && Date.parse(grant.startsAt) <= now.getTime() && Date.parse(grant.expiresAt) > now.getTime()) ?? null
}

export async function listAutonomyGrants(client: Queryable, missionId: string, organizationId: string): Promise<AutonomyGrant[]> {
  const result = await client.query<GrantRow>(`${grantSelect('grant.mission_id=$1 AND grant.organization_id=$2')} ORDER BY grant.grant_version DESC`, [missionId, organizationId])
  return result.rows.map((row) => mapGrant(row))
}

function grantSelect(where: string) {
  return `SELECT grant.*,COALESCE(ARRAY_AGG(event.event_type ORDER BY event.occurred_at) FILTER (WHERE event.id IS NOT NULL),ARRAY[]::TEXT[]) AS event_types,
    (ARRAY_AGG(event.actor_id ORDER BY event.occurred_at) FILTER (WHERE event.event_type='approved'))[1] AS approved_by,
    (ARRAY_AGG(event.occurred_at ORDER BY event.occurred_at) FILTER (WHERE event.event_type='approved'))[1] AS approved_at,
    (ARRAY_AGG(event.actor_id ORDER BY event.occurred_at DESC) FILTER (WHERE event.event_type='revoked'))[1] AS revoked_by,
    (ARRAY_AGG(event.occurred_at ORDER BY event.occurred_at DESC) FILTER (WHERE event.event_type='revoked'))[1] AS revoked_at,
    (ARRAY_AGG(event.reason ORDER BY event.occurred_at DESC) FILTER (WHERE event.event_type='revoked'))[1] AS revocation_reason
    FROM public.action_autonomy_grants grant LEFT JOIN public.action_autonomy_grant_events event ON event.grant_id=grant.id
    WHERE ${where} GROUP BY grant.id`
}

function mapGrant(row: GrantRow,now=new Date()): AutonomyGrant {
  const events = new Set(row.event_types ?? [])
  const expiresAt = iso(row.expires_at)
  const status = deriveAutonomyGrantStatus([...events], expiresAt,now)
  return {
    id:row.id,organizationId:row.organization_id,missionId:row.mission_id,grantVersion:Number(row.grant_version),missionVersion:Number(row.mission_version),
    envelope:row.envelope,envelopeHash:row.envelope_hash,status,startsAt:iso(row.starts_at),expiresAt,requestedBy:row.requested_by,createdAt:iso(row.created_at),
    ...(row.approved_by?{approvedBy:row.approved_by}:{}),...(row.approved_at?{approvedAt:iso(row.approved_at)}:{}),
    ...(row.revoked_by?{revokedBy:row.revoked_by}:{}),...(row.revoked_at?{revokedAt:iso(row.revoked_at)}:{}),
    ...(row.revocation_reason?{revocationReason:row.revocation_reason}:{}),
  }
}

export function deriveAutonomyGrantStatus(events:string[],expiresAt:string,now=new Date()):AutonomyGrant['status']{
  const types=new Set(events)
  return types.has('revoked')?'revoked':Date.parse(expiresAt)<=now.getTime()?'expired':types.has('activated')?'active':'pending'
}

function requiredGrant(value: AutonomyGrant | null) { if (!value) throw new Error('autonomy_grant_not_found'); return value }
function iso(value:string|Date){return value instanceof Date?value.toISOString():new Date(value).toISOString()}
function decimalGreater(left:string,right:string){const scale=Math.max((left.split('.')[1]??'').length,(right.split('.')[1]??'').length);const parse=(value:string)=>{const[whole,fraction='']=value.split('.');return BigInt(whole)*10n**BigInt(scale)+BigInt(fraction.padEnd(scale,'0')||'0')};return parse(left)>parse(right)}
function stable(value:unknown):string{if(Array.isArray(value))return`[${value.map(stable).join(',')}]`;if(value&&typeof value==='object')return`{${Object.entries(value as Record<string,unknown>).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>`${JSON.stringify(key)}:${stable(item)}`).join(',')}}`;return JSON.stringify(value)}
