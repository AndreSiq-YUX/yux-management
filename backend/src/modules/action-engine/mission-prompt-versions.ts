import type pg from 'pg'
import { z } from 'zod'
import type { AppEnv } from '../../config/env.js'
import { withDatabaseTransaction } from '../../db/client.js'
import { ApiError } from '../../http/errors.js'
import type { MissionPromptConfigurationWire } from './generated/mission-wire.js'
import type { Queryable } from './repository.js'

export const missionPromptScopeSchema = z.enum(['mission-planning', 'mission-intake-internal', 'mission-intake-client'])
export const missionPromptStageSchema = z.enum([
  'synthesizer', 'planner',
  'funnel_nurture.crm_architect', 'funnel_nurture.copywriter',
  'funnel_nurture.automation_architect', 'funnel_nurture.brand_compliance_guardian',
  'campaign_launch.campaign_strategist', 'campaign_launch.copywriter',
  'campaign_launch.brand_compliance_guardian', 'campaign_launch.measurement_analyst',
])
export type MissionPromptScope = z.infer<typeof missionPromptScopeSchema>
type MissionPromptStage = z.infer<typeof missionPromptStageSchema>

export type MissionPromptVersion = {
  version: number
  instructions: Partial<Record<MissionPromptStage, string>>
  operation: 'publish' | 'restore'
  restored_from_version: number | null
  reason: string
  test_fingerprints: string[]
  author_id: string
  created_at: string
}

export function intakePromptScope(audience: 'internal_operator' | 'client_user'): MissionPromptScope {
  return audience === 'internal_operator' ? 'mission-intake-internal' : 'mission-intake-client'
}

export function missionPromptPilotEnabled(env: AppEnv, organizationId: string) {
  return (env.ACTION_ENGINE_PROMPT_PILOT_ORGANIZATION_IDS ?? '').split(',')
    .some(id => id.trim().toLowerCase() === organizationId.toLowerCase())
}

export function missionPromptConfiguration(version: Pick<MissionPromptVersion, 'version' | 'instructions'> | undefined): MissionPromptConfigurationWire | undefined {
  if (!version || !Object.keys(version.instructions).length) return
  return { version: version.version, instructions: version.instructions }
}

export async function listMissionPromptVersions(pool: Queryable, organizationId: string, scope: MissionPromptScope, limit = 20) {
  return (await pool.query<MissionPromptVersion>(
    `SELECT version, instructions, operation, restored_from_version, reason, test_fingerprints, author_id, created_at
     FROM private.mission_prompt_versions WHERE organization_id=$1 AND scope=$2 ORDER BY version DESC LIMIT $3`,
    [organizationId, scope, limit],
  )).rows
}

export async function changeMissionPromptVersion(pool: pg.Pool, input: {
  organizationId: string
  scope: MissionPromptScope
  authorId: string
  expectedVersion: number
  reason: string
} & ({ stage: MissionPromptStage; instruction: string; fingerprints: string[] } | { restoreVersion: number })) {
  return withDatabaseTransaction(pool, async client => {
    const { organizationId, scope } = input
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended('mission-prompt:' || $1::text || ':' || $2::text, 0))", [organizationId, scope])
    const [current] = await listMissionPromptVersions(client, organizationId, scope, 1)
    if ((current?.version ?? 0) !== input.expectedVersion) throw new ApiError(409, 'agent_prompt_version_conflict')

    const restoring = 'restoreVersion' in input
    const restored = restoring && input.restoreVersion > 0 ? (await client.query<MissionPromptVersion>(
      `SELECT instructions, test_fingerprints FROM private.mission_prompt_versions
       WHERE organization_id=$1 AND scope=$2 AND version=$3`, [organizationId, scope, input.restoreVersion],
    )).rows[0] : undefined
    if (restoring && input.restoreVersion > 0 && !restored) throw new ApiError(404, 'agent_prompt_version_not_found')
    const instructions = restoring ? restored?.instructions ?? {} : { ...current?.instructions, [input.stage]: input.instruction }
    const fingerprints = restoring ? restored?.test_fingerprints ?? [] : input.fingerprints
    return (await client.query<MissionPromptVersion>(
      `INSERT INTO private.mission_prompt_versions
         (organization_id, scope, version, instructions, operation, restored_from_version, reason, test_fingerprints, author_id)
       VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7,$8,$9) RETURNING version, instructions, operation,
         restored_from_version, reason, test_fingerprints, author_id, created_at`,
      [organizationId, scope, input.expectedVersion + 1, JSON.stringify(instructions), restoring ? 'restore' : 'publish',
        restoring ? input.restoreVersion : null, input.reason, fingerprints, input.authorId],
    )).rows[0]
  })
}

export async function pinMissionPromptVersion(pool: Queryable, env: AppEnv, input: {
  organizationId: string
  scope: MissionPromptScope
  operationId: string
  operationVersion: number
}) {
  if (!missionPromptPilotEnabled(env, input.organizationId)) return
  const values = [input.organizationId, input.scope, input.operationId, input.operationVersion]
  // NULL captures the inherited configuration when a turn starts before publication.
  await pool.query(
    `INSERT INTO private.mission_prompt_execution_versions
         (organization_id, scope, operation_id, operation_version, prompt_version)
       VALUES ($1,$2,$3,$4,(SELECT version FROM private.mission_prompt_versions
                            WHERE organization_id=$1 AND scope=$2 ORDER BY version DESC LIMIT 1))
       ON CONFLICT (organization_id, scope, operation_id, operation_version) DO NOTHING`, values,
  )
  const pinned = (await pool.query<{ prompt_version: number | null; instructions: MissionPromptVersion['instructions'] | null }>(
    `SELECT execution.prompt_version, publication.instructions
       FROM private.mission_prompt_execution_versions execution LEFT JOIN private.mission_prompt_versions publication
         ON publication.organization_id=execution.organization_id AND publication.scope=execution.scope
         AND publication.version=execution.prompt_version
      WHERE execution.organization_id=$1 AND execution.scope=$2 AND execution.operation_id=$3 AND execution.operation_version=$4`,
    values,
  )).rows[0]
  if (!pinned || (pinned.prompt_version !== null && !pinned.instructions)) throw new Error('mission_prompt_version_unavailable')
  return pinned.prompt_version === null || !pinned.instructions ? undefined
    : missionPromptConfiguration({ version: pinned.prompt_version, instructions: pinned.instructions })
}
