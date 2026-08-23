import { createHash } from 'node:crypto'

export type MissionCommandContext = {
  organizationId: string
  missionId: string
  actionRunId: string
  actorId: string
  idempotencyKey: string
}

export type MissionCommandQueryable = {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[]; rowCount?: number | null }>
}

export async function loadMissionCommandResult<T>(client: MissionCommandQueryable, context: MissionCommandContext, commandKey: string): Promise<T | null> {
  const result = await client.query<{ result: T }>(
    `SELECT result FROM public.action_mission_command_results
      WHERE organization_id = $1 AND command_key = $2 AND idempotency_key = $3 LIMIT 1`,
    [context.organizationId, commandKey, context.idempotencyKey],
  )
  return result.rows[0]?.result ?? null
}

export async function saveMissionCommandResult<T extends Record<string, unknown>>(client: MissionCommandQueryable, context: MissionCommandContext, commandKey: string, result: T): Promise<T> {
  const inserted = await client.query<{ result: T }>(
    `INSERT INTO public.action_mission_command_results (organization_id, mission_id, action_run_id, command_key, idempotency_key, result)
     VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (organization_id, command_key, idempotency_key) DO UPDATE
       SET result = public.action_mission_command_results.result RETURNING result`,
    [context.organizationId, context.missionId, context.actionRunId, commandKey, context.idempotencyKey, result],
  )
  return inserted.rows[0]?.result ?? result
}

export function missionArtifactHash(value: unknown): string { return createHash('sha256').update(stable(value)).digest('hex') }
function stable(value: unknown): string { if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`; if (value && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(',')}}`; return JSON.stringify(value) }
