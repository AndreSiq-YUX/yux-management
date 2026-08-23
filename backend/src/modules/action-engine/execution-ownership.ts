import type { Connectable, Queryable } from './repository.js'
import type { OwnershipConflictPolicy, OwnershipMode } from './types.js'
import { releaseResourceClaims } from './resource-claims.js'

export type MissionOwnership = {
  missionId: string
  mode: OwnershipMode
  conflictPolicy: OwnershipConflictPolicy
  allowedActionKeys: string[]
  active?: boolean
}

export type AutomationIntent = {
  missionId?: string
  missionBound: boolean
  actionKey: string
}

export type AutomationConflictDecision =
  | { outcome: 'allow'; reason: 'no_ownership' | 'observe_only' | 'disjoint_action' | 'same_mission_subprocess' }
  | { outcome: 'block'; reason: 'mission_exclusive_ownership' | 'action_key_conflict' | 'mission_conflict_policy' }

export function resolveAutomationConflict(ownership: MissionOwnership | null, intent: AutomationIntent): AutomationConflictDecision {
  if (!ownership || ownership.active === false) return { outcome: 'allow', reason: 'no_ownership' }
  if (intent.missionBound && intent.missionId === ownership.missionId) return { outcome: 'allow', reason: 'same_mission_subprocess' }
  if (ownership.mode === 'observe') return { outcome: 'allow', reason: 'observe_only' }
  if (ownership.mode === 'exclusive') return { outcome: 'block', reason: 'mission_exclusive_ownership' }
  if (ownership.allowedActionKeys.includes(intent.actionKey)) return { outcome: 'block', reason: 'action_key_conflict' }
  if (ownership.conflictPolicy === 'block_new') return { outcome: 'block', reason: 'mission_conflict_policy' }
  return { outcome: 'allow', reason: 'disjoint_action' }
}

export async function acquireMissionOwnership(client: Queryable, input: {
  organizationId: string; missionId: string; entityType: string; entityId: string; role: string;
  mode: OwnershipMode; conflictPolicy: OwnershipConflictPolicy; allowedActionKeys?: string[]
}) {
  const existing = await client.query<{ id: string; mission_id: string }>(
    `SELECT id, mission_id FROM public.action_mission_entities
     WHERE organization_id = $1 AND entity_type = $2 AND entity_id = $3 AND active = TRUE
       AND (ownership_mode = 'exclusive' OR $6 = 'exclusive') FOR UPDATE`,
    [input.organizationId, input.entityType, input.entityId, input.role, input.missionId, input.mode],
  )
  if (existing.rows[0] && existing.rows[0].mission_id !== input.missionId) throw new Error('mission_entity_ownership_conflict')
  const result = await client.query<{ id: string }>(
    `INSERT INTO public.action_mission_entities (
       organization_id, mission_id, entity_type, entity_id, role, ownership_mode, conflict_policy, allowed_action_keys
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (mission_id, entity_type, entity_id, role) DO UPDATE SET
       active = TRUE, released_at = NULL, ownership_mode = EXCLUDED.ownership_mode,
       conflict_policy = EXCLUDED.conflict_policy, allowed_action_keys = EXCLUDED.allowed_action_keys
     RETURNING id`,
    [input.organizationId, input.missionId, input.entityType, input.entityId, input.role,
      input.mode, input.conflictPolicy, input.allowedActionKeys ?? []],
  )
  return result.rows[0]
}

export async function releaseMissionOwnership(client: Queryable, missionId: string, organizationId: string): Promise<number> {
  const result = await client.query(
    `UPDATE public.action_mission_entities SET active = FALSE, released_at = NOW()
     WHERE mission_id = $1 AND organization_id = $2 AND active = TRUE`, [missionId, organizationId],
  )
  const releasedClaims = await releaseResourceClaims(client, missionId, organizationId)
  return (result.rowCount ?? 0) + releasedClaims
}

export async function loadEntityOwnership(client: Queryable, organizationId: string, entityType: string, entityId: string): Promise<MissionOwnership | null> {
  const result = await client.query<{ mission_id: string; ownership_mode: OwnershipMode; conflict_policy: OwnershipConflictPolicy; allowed_action_keys: string[] }>(
    `SELECT mission_id, ownership_mode, conflict_policy, allowed_action_keys
     FROM public.action_mission_entities
     WHERE organization_id = $1 AND entity_type = $2 AND entity_id = $3 AND active = TRUE
     ORDER BY CASE ownership_mode WHEN 'exclusive' THEN 0 WHEN 'shared' THEN 1 ELSE 2 END LIMIT 1`,
    [organizationId, entityType, entityId],
  )
  const row = result.rows[0]
  return row ? { missionId: row.mission_id, mode: row.ownership_mode, conflictPolicy: row.conflict_policy, allowedActionKeys: row.allowed_action_keys ?? [], active: true } : null
}
