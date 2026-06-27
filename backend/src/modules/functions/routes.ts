import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { hashSessionToken } from '../../auth/session.js'
import type { JobName } from '../../jobs/queue.js'

const functionSchema = z.object({
  body: z.record(z.string(), z.unknown()).optional(),
})

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

export async function registerFunctionRoutes(app: FastifyInstance) {
  app.post('/:name', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply
    const params = z.object({ name: z.string().min(1) }).safeParse(request.params)
    const parsed = functionSchema.safeParse(request.body)
    if (!params.success || !parsed.success) return reply.code(400).send({ error: 'invalid_function_request' })

    const job = await app.jobQueue.add(functionJobName(params.data.name), {
      requestedBy: user.id,
      functionName: params.data.name,
      body: parsed.data.body || {},
    })

    return {
      success: true,
      pending: true,
      functionName: params.data.name,
      jobId: job.id,
    }
  })
}

function functionJobName(name: string): JobName {
  if (name === 'run-strategy-admin-chat') return 'strategy.adminChat'
  if (name === 'sync-ad-metrics') return 'provider.syncMetrics'
  return 'provider.functionInvoke'
}
