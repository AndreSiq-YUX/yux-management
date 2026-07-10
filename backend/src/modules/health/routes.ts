import type { FastifyInstance } from 'fastify'

const service = 'yux-backend-api'

export async function registerHealthRoutes(app: FastifyInstance) {
  app.get('/health/live', async () => ({
    status: 'ok',
    service,
  }))

  app.get('/health', async () => ({
    status: 'ok',
    service,
  }))

  const ready = async (_request: unknown, reply: { code(statusCode: number): { send(value: unknown): unknown } }) => {
    try {
      await Promise.all([app.pg.query('SELECT 1'), app.redisPing()])
      return { status: 'ready', service }
    } catch (error) {
      app.log.warn(error, 'readiness dependency check failed')
      return reply.code(503).send({ status: 'unavailable', service })
    }
  }

  app.get('/ready', ready)
  app.get('/health/ready', ready)
}
