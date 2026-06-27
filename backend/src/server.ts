import cookie from '@fastify/cookie'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import Fastify from 'fastify'
import { loadEnv, type AppEnv } from './config/env.js'
import { registerHealthRoutes } from './modules/health/routes.js'

export async function buildServer(env: AppEnv = loadEnv()) {
  const app = Fastify({ logger: env.NODE_ENV !== 'test' })

  await app.register(helmet)
  await app.register(cookie, { secret: env.SESSION_SECRET })
  await app.register(cors, {
    origin: env.CORS_ORIGIN,
    credentials: true,
  })

  await app.register(registerHealthRoutes, { prefix: '/api' })

  return app
}
