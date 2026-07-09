import fp from 'fastify-plugin'
import { hashSessionToken } from '../auth/session.js'
import type { RequestContext, UserRole } from './request-context.js'

declare module 'fastify' {
  interface FastifyRequest {
    ctx: RequestContext | null
  }
}

export const contextPlugin = fp(async (app) => {
  app.decorateRequest('ctx', null)

  app.addHook('preHandler', async (request) => {
    const token = request.cookies[app.config.SESSION_COOKIE_NAME]
    if (!token) return

    const user = await app.authStore.findUserBySession(hashSessionToken(token), new Date())
    if (!user) return

    const [memberships, modules] = await Promise.all([
      app.pg.query<{ organization_id: string }>(
        `SELECT organization_id
         FROM public.memberships
         WHERE user_id = $1`,
        [user.id],
      ),
      app.pg.query<{ module_key: string }>(
        `SELECT DISTINCT cm.module_key
         FROM public.contract_modules cm
         JOIN public.contracts c ON c.id = cm.contract_id
         JOIN public.organizations o ON o.client_id = c.client_id
         JOIN public.memberships m ON m.organization_id = o.id
         WHERE m.user_id = $1
           AND c.status = 'active'
           AND cm.enabled = TRUE`,
        [user.id],
      ),
    ])

    request.ctx = {
      userId: user.id,
      role: user.role as UserRole,
      organizationIds: memberships.rows.map((row) => row.organization_id),
      enabledModuleKeys: modules.rows.map((row) => row.module_key),
    }
  })
})
