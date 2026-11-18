import type pg from 'pg'
import type { AppEnv } from '../../config/env.js'
import { withDatabaseTransaction } from '../../db/client.js'
import { ApiError } from '../../http/errors.js'

type Queryable = Pick<pg.Pool, 'query'>

type PromptVersion = {
  version: number
  instruction: string | null
  operation: 'publish' | 'restore'
  restored_from_version: number | null
  reason: string
  test_fingerprints: string[]
  author_id: string
  created_at: string
}

export function presalesPilotEnabled(env: AppEnv, organizationId: string) {
  return (env.STRATEGY_PRESALES_PILOT_ORGANIZATION_IDS ?? '').split(',')
    .some(id => id.trim().toLowerCase() === organizationId.toLowerCase())
}

export async function listPromptVersions(pool: Queryable, organizationId: string, limit = 20) {
  return (await pool.query<PromptVersion>(
    `SELECT version, instruction, operation, restored_from_version, reason, test_fingerprints, author_id, created_at
     FROM public.strategy_agent_prompt_versions
     WHERE organization_id = $1 ORDER BY version DESC LIMIT $2`,
    [organizationId, limit],
  )).rows
}

export async function changePromptVersion(pool: pg.Pool, input: {
  organizationId: string
  authorId: string
  expectedVersion: number
  reason: string
} & ({ instruction: string; fingerprints: string[] } | { restoreVersion: number })) {
  return withDatabaseTransaction(pool, async client => {
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended('strategy-prompt:' || $1::text, 0))", [input.organizationId])
    const [current] = await listPromptVersions(client, input.organizationId, 1)
    if ((current?.version ?? 0) !== input.expectedVersion) throw new ApiError(409, 'agent_prompt_version_conflict')
    let instruction: string | null, operation: PromptVersion['operation'], restoreVersion: number | null, fingerprints: string[]
    if ('restoreVersion' in input) {
      operation = 'restore'
      restoreVersion = input.restoreVersion
      const restored = restoreVersion === 0 ? null : (await client.query<PromptVersion>(
        `SELECT instruction, test_fingerprints FROM public.strategy_agent_prompt_versions
         WHERE organization_id = $1 AND version = $2`,
        [input.organizationId, restoreVersion],
      )).rows[0]
      if (restoreVersion !== 0 && !restored) throw new ApiError(404, 'agent_prompt_version_not_found')
      instruction = restored?.instruction ?? null
      fingerprints = restored?.test_fingerprints ?? []
    } else {
      operation = 'publish'
      restoreVersion = null
      instruction = input.instruction
      fingerprints = input.fingerprints
    }
    const { rows } = await client.query<PromptVersion>(
      `INSERT INTO public.strategy_agent_prompt_versions (
         organization_id, version, instruction, operation, restored_from_version, reason, test_fingerprints, author_id
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [input.organizationId, input.expectedVersion + 1, instruction, operation, restoreVersion,
        input.reason, fingerprints, input.authorId],
    )
    return rows[0]
  })
}
