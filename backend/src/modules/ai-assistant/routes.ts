import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { hashSessionToken } from '../../auth/session.js'
import { requireAuth } from '../../http/guards.js'
import { dataQuerySchema } from '../data/routes.js'
import { createScopedTableRules, executeScopedDataQuery } from '../data/scoped-query.js'

const allowedTables = new Set([
  'ai_assistants',
  'ai_assistant_objectives',
  'ai_assistant_required_fields',
  'ai_assistant_handoff_rules',
  'ai_assistant_safety_rules',
  'ai_assistant_knowledge_links',
  'knowledge_entries',
  'conversation_queues',
])

const aiAssistantTableRules = createScopedTableRules(
  ['ai_assistants', 'knowledge_entries', 'conversation_queues'],
  ['ai_assistant_objectives', 'ai_assistant_required_fields', 'ai_assistant_handoff_rules', 'ai_assistant_safety_rules', 'ai_assistant_knowledge_links'],
)

async function getAuthenticatedUser(request: FastifyRequest, reply: FastifyReply) {
  const token = request.cookies[request.server.config.SESSION_COOKIE_NAME]
  if (!token) {
    void reply.code(401).send({ error: 'not_authenticated' })
    return null
  }

  const user = await request.server.authStore.findUserBySession(hashSessionToken(token), new Date())
  if (!user) {
    void reply.code(401).send({ error: 'not_authenticated' })
    return null
  }

  return user
}

export async function registerAiAssistantRoutes(app: FastifyInstance) {
  app.post('/query', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    const parsed = dataQuerySchema.safeParse(request.body)
    if (!parsed.success || !allowedTables.has(parsed.data.table)) {
      return reply.code(400).send({ error: 'invalid_ai_assistant_query' })
    }

    return executeScopedDataQuery(app, requireAuth(request), parsed.data, aiAssistantTableRules)
  })
}
