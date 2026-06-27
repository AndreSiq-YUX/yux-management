import type { FastifyInstance } from 'fastify'

const service = 'yux-backend-api'

export async function registerHealthRoutes(app: FastifyInstance) {
  app.get('/health', async () => ({
    status: 'ok',
    service,
  }))

  app.get('/ready', async () => ({
    status: 'ready',
    service,
  }))
}
