import type pg from 'pg'
import type { AppEnv } from '../../config/env.js'
import { processStrategyAdminChat, strategyAdminChatRequestSchema } from '../../modules/strategy-engine/admin-chat.js'

export async function handleStrategyAdminChat(pool: Pick<pg.Pool, 'query'>, env: AppEnv, data: Record<string, unknown>) {
  const body = data.body as Record<string, unknown> | undefined
  const request = strategyAdminChatRequestSchema.extend({
    sessionId: strategyAdminChatRequestSchema.shape.sessionId.unwrap(),
    assistantMessageId: strategyAdminChatRequestSchema.shape.sessionId.unwrap(),
    actorUserId: strategyAdminChatRequestSchema.shape.sessionId.unwrap(),
  }).parse(body)
  return processStrategyAdminChat(pool, env, request)
}
