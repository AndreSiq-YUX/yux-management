import type pg from 'pg'
import type { AppEnv } from '../../config/env.js'
import { invokeAgentRuntime } from '../../lib/agent-runtime-client.js'

export async function handleStrategyAdminChat(_pool: Pick<pg.Pool, 'query'>, env: AppEnv, data: Record<string, unknown>) {
  return invokeAgentRuntime(env, '/workflows/execute', { ...(data.body as Record<string, unknown> || {}), source: 'strategy_admin' })
}
