import { createHash } from 'node:crypto'
import type { Queryable } from './repository.js'

export type PlanningArtifactIdentity = {
  organizationId: string
  contextHash: string
  packKey: string
  packVersion: string
  specialistProfile: string
  specialistVersion: number
  relevantInput: Record<string, unknown>
}

export function createPlanningArtifactCacheKey(input: PlanningArtifactIdentity): string {
  const identity: PlanningArtifactIdentity = {
    organizationId: input.organizationId,
    contextHash: input.contextHash,
    packKey: input.packKey,
    packVersion: input.packVersion,
    specialistProfile: input.specialistProfile,
    specialistVersion: input.specialistVersion,
    relevantInput: input.relevantInput,
  }
  return createHash('sha256').update(stableSerialize(identity)).digest('hex')
}

export async function getCachedArtifact(client: Queryable, input: PlanningArtifactIdentity & {
  cacheKey?: string
  artifactSchema: string
  artifactVersion: number
}): Promise<Record<string, unknown> | null> {
  const expectedKey = createPlanningArtifactCacheKey(input)
  if (input.cacheKey && input.cacheKey !== expectedKey) throw new Error('planning_artifact_cache_key_invalid')
  const result = await client.query<{ artifact: Record<string, unknown>; artifact_schema: string; artifact_version: number }>(
    `SELECT artifact, artifact_schema, artifact_version FROM public.action_planning_artifact_cache
     WHERE organization_id = $1 AND cache_key = $2 AND context_hash = $3
       AND pack_key = $4 AND pack_version = $5 AND specialist_profile = $6
       AND specialist_version = $7 AND artifact_schema = $8 AND artifact_version = $9
       AND (expires_at IS NULL OR expires_at > NOW()) LIMIT 1`,
    [input.organizationId, expectedKey, input.contextHash, input.packKey, input.packVersion,
      input.specialistProfile, input.specialistVersion, input.artifactSchema, input.artifactVersion],
  )
  return result.rows[0]?.artifact ?? null
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stableSerialize(item)}`).join(',')}}`
  return JSON.stringify(value)
}
