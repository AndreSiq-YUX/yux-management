import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { hashSessionToken } from '../../auth/session.js'
import { dataQuerySchema, executeDataQuery } from '../data/routes.js'

const allowedTables = new Set([
  'landing_pages',
  'landing_page_versions',
  'landing_page_forms',
  'landing_page_field_mappings',
  'landing_page_change_requests',
  'landing_page_approvals',
  'landing_page_events',
])

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

export async function registerLandingPageRoutes(app: FastifyInstance) {
  app.post('/query', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    const parsed = dataQuerySchema.safeParse(request.body)
    if (!parsed.success || !allowedTables.has(parsed.data.table)) {
      return reply.code(400).send({ error: 'invalid_landing_page_query' })
    }

    return executeDataQuery(app, parsed.data)
  })
}
