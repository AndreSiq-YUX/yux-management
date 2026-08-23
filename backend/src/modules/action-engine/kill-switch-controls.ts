import { recordDomainEvent } from '../events/repository.js'
import type { Queryable } from './repository.js'

export type CapabilityControl = { capabilityKey: string; capabilityVersion: number; disabled: boolean; reason?: string }

export async function listMissionCapabilityControls(client: Queryable, input: { organizationId: string; missionId: string }): Promise<CapabilityControl[]> {
  const result = await client.query<{ capability_key: string; capability_version: number; disabled: boolean; reason: string | null }>(
    `SELECT DISTINCT step.capability_key, step.capability_version,
            EXISTS (SELECT 1 FROM public.action_engine_kill_switches switch
              WHERE switch.organization_id = $1 AND switch.scope = 'capability' AND switch.enabled = TRUE
                AND (switch.expires_at IS NULL OR switch.expires_at > NOW())
                AND switch.capability_key = step.capability_key AND switch.capability_version = step.capability_version) AS disabled,
            (SELECT switch.reason FROM public.action_engine_kill_switches switch
              WHERE switch.organization_id = $1 AND switch.scope = 'capability' AND switch.enabled = TRUE
                AND (switch.expires_at IS NULL OR switch.expires_at > NOW())
                AND switch.capability_key = step.capability_key AND switch.capability_version = step.capability_version
              ORDER BY switch.activated_at DESC LIMIT 1) AS reason
       FROM public.action_plan_steps step JOIN public.action_plans plan ON plan.id = step.plan_id
      WHERE step.organization_id = $1 AND plan.mission_id = $2
        AND plan.revision = (SELECT MAX(revision) FROM public.action_plans WHERE mission_id = $2 AND organization_id = $1)
      ORDER BY step.capability_key, step.capability_version`, [input.organizationId, input.missionId],
  )
  return result.rows.map(row => ({ capabilityKey: row.capability_key, capabilityVersion: row.capability_version, disabled: row.disabled, ...(row.reason ? { reason: row.reason } : {}) }))
}

export async function setCapabilityControl(client: Queryable, input: {
  organizationId: string; missionId: string; capabilityKey: string; capabilityVersion: number;
  disabled: boolean; reason: string; actorId: string
}) {
  const exact = await client.query<{ found: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM public.action_plan_steps step JOIN public.action_plans plan ON plan.id = step.plan_id
      WHERE step.organization_id = $1 AND plan.mission_id = $2 AND step.capability_key = $3 AND step.capability_version = $4
        AND plan.revision = (SELECT MAX(revision) FROM public.action_plans WHERE mission_id = $2 AND organization_id = $1)) AS found`,
    [input.organizationId, input.missionId, input.capabilityKey, input.capabilityVersion],
  )
  if (!exact.rows[0]?.found) throw new Error('mission_capability_not_found')
  await client.query(
    `UPDATE public.action_engine_kill_switches SET enabled = FALSE, deactivated_by = $4,
            deactivated_at = NOW(), deactivation_reason = $5
      WHERE organization_id = $1 AND scope = 'capability' AND capability_key = $2 AND capability_version = $3 AND enabled = TRUE`,
    [input.organizationId, input.capabilityKey, input.capabilityVersion, input.actorId, input.reason],
  )
  if (input.disabled) await client.query(
    `INSERT INTO public.action_engine_kill_switches (
       organization_id, scope, capability_key, capability_version, enabled, reason, activated_by
     ) VALUES ($1,'capability',$2,$3,TRUE,$4,$5)`,
    [input.organizationId, input.capabilityKey, input.capabilityVersion, input.reason, input.actorId],
  )
  await recordDomainEvent(client, {
    eventType: input.disabled ? 'mission.capability_paused' : 'mission.capability_resumed', organizationId: input.organizationId,
    aggregateType: 'mission', aggregateId: input.missionId, actor: { type: 'user', id: input.actorId },
    payload: { capabilityKey: input.capabilityKey, capabilityVersion: input.capabilityVersion, reason: input.reason },
  })
  return { capabilityKey: input.capabilityKey, capabilityVersion: input.capabilityVersion, disabled: input.disabled }
}
