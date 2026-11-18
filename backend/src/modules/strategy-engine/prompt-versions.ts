import type pg from 'pg'
import { z } from 'zod'
import type { AppEnv } from '../../config/env.js'
import { withDatabaseTransaction } from '../../db/client.js'
import { ApiError } from '../../http/errors.js'
import { agentSourceRulesSchema, type AgentSourceRules } from '../action-engine/agent-source-rules.js'

type Queryable = Pick<pg.Pool, 'query'>

export const strategistModeSchema = z.enum([
  'general', 'initial_analysis', 'diagnostic_48h', 'service_plan', 'proposal', 'roadmap_30_60_90', 'do_not_do',
])
export const stageKeySchema = z.string().regex(/^[a-z][a-z0-9_-]{0,79}$/)
export const promptInstructionSchema = z.string().trim().min(1).max(4000)
export const stageInstructionMapSchema = z.record(stageKeySchema, promptInstructionSchema)

type StrategistMode = z.infer<typeof strategistModeSchema>
type StageInstruction = { mode: StrategistMode; stage: string; instruction: string }

type PromptVersion = {
  version: number
  instruction: string | null
  stage_instructions: StageInstruction[]
  source_rules?: AgentSourceRules | null
  operation: 'publish' | 'restore'
  restored_from_version: number | null
  reason: string
  test_fingerprints: string[]
  author_id: string
  created_at: string
}

export function promptSettings(version: PromptVersion | undefined, mode?: StrategistMode) {
  const applicable = (version?.stage_instructions ?? []).filter(entry => !mode || entry.mode === mode)
  const instruction = version?.instruction ?? null
  const sourceRules = version?.source_rules ? agentSourceRulesSchema.parse(version.source_rules) : undefined
  return {
    instruction,
    stageInstructions: Object.fromEntries(applicable.map(entry => [entry.stage, entry.instruction])),
    sourceRules,
    active: Boolean(instruction || applicable.length || sourceRules),
  }
}

export function presalesPilotEnabled(env: AppEnv, organizationId: string) {
  return (env.STRATEGY_PRESALES_PILOT_ORGANIZATION_IDS ?? '').split(',')
    .some(id => id.trim().toLowerCase() === organizationId.toLowerCase())
}

export async function listPromptVersions(pool: Queryable, organizationId: string, limit = 20) {
  return (await pool.query<PromptVersion>(
    `SELECT version, instruction, stage_instructions, source_rules, operation, restored_from_version, reason, test_fingerprints, author_id, created_at
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
} & ({ instruction: string; fingerprints: string[]; target?: { mode: StrategistMode; stage: string } }
  | { sourceRules: AgentSourceRules; fingerprints: string[] } | { restoreVersion: number })) {
  return withDatabaseTransaction(pool, async client => {
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended('strategy-prompt:' || $1::text, 0))", [input.organizationId])
    const [current] = await listPromptVersions(client, input.organizationId, 1)
    if ((current?.version ?? 0) !== input.expectedVersion) throw new ApiError(409, 'agent_prompt_version_conflict')
    let instruction = current?.instruction ?? null
    let operation: PromptVersion['operation'], restoreVersion: number | null, fingerprints: string[]
    let stageInstructions = current?.stage_instructions ?? []
    let sourceRules = current?.source_rules ?? null
    if ('restoreVersion' in input) {
      operation = 'restore'
      restoreVersion = input.restoreVersion
      const restored = restoreVersion === 0 ? null : (await client.query<PromptVersion>(
        `SELECT instruction, stage_instructions, source_rules, test_fingerprints FROM public.strategy_agent_prompt_versions
         WHERE organization_id = $1 AND version = $2`,
        [input.organizationId, restoreVersion],
      )).rows[0]
      if (restoreVersion !== 0 && !restored) throw new ApiError(404, 'agent_prompt_version_not_found')
      instruction = restored?.instruction ?? null
      stageInstructions = restored?.stage_instructions ?? []
      sourceRules = restored?.source_rules ?? null
      fingerprints = restored?.test_fingerprints ?? []
    } else {
      operation = 'publish'
      restoreVersion = null
      if ('sourceRules' in input) sourceRules = input.sourceRules
      else if (!input.target) instruction = input.instruction
      else {
        const target = input.target
        stageInstructions = [
          ...stageInstructions.filter(entry => entry.mode !== target.mode || entry.stage !== target.stage),
          { ...target, instruction: input.instruction },
        ]
        if (stageInstructions.length > 48 || stageInstructions.filter(entry => entry.mode === target.mode).length > 24) {
          throw new ApiError(409, 'agent_prompt_stage_limit')
        }
      }
      fingerprints = input.fingerprints
    }
    const { rows } = await client.query<PromptVersion>(
      `INSERT INTO public.strategy_agent_prompt_versions (
         organization_id, version, instruction, operation, restored_from_version, reason, test_fingerprints, author_id, stage_instructions, source_rules
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb) RETURNING *`,
      [input.organizationId, input.expectedVersion + 1, instruction, operation, restoreVersion,
        input.reason, fingerprints, input.authorId, JSON.stringify(stageInstructions), sourceRules ? JSON.stringify(sourceRules) : null],
    )
    return rows[0]
  })
}
