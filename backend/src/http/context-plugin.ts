import fp from 'fastify-plugin'
import { hashSessionToken } from '../auth/session.js'
import { runWithDatabaseRequestContext } from '../db/request-context.js'
import type { RequestContext, UserRole } from './request-context.js'

declare module 'fastify' {
  interface FastifyRequest {
    ctx: RequestContext | null
  }
}

export const contextPlugin = fp(async (app) => {
  app.decorateRequest('ctx', null)

  app.addHook('preHandler', (request, _reply, done) => {
    const loadContext = async () => {
      const token = request.cookies[app.config.SESSION_COOKIE_NAME]
      if (!token) return done()

      const user = await app.authStore.findUserBySession(hashSessionToken(token), new Date())
      if (!user) return done()

      const memberships = await app.pg.query<{ organization_id: string }>(
        `SELECT organization_id
         FROM public.memberships
         WHERE user_id = $1`,
        [user.id],
      )
      const organizationIds = memberships.rows.map((row) => row.organization_id)
      const role = user.role as UserRole

      await runWithDatabaseRequestContext({ role, organizationIds, serviceRole: 'api' }, async () => {
        const modules = organizationIds.length > 0 || role === 'yux_admin' || role === 'yux_operator'
          ? await app.pg.query<{ module_key: string }>(
            `SELECT DISTINCT cm.module_key
             FROM public.contract_modules cm
             JOIN public.contracts c ON c.id = cm.contract_id
             JOIN public.organizations o ON o.client_id = c.client_id
             JOIN public.memberships m ON m.organization_id = o.id
            WHERE m.user_id = $1
               AND c.status = 'active'
               AND cm.enabled = TRUE`,
            [user.id],
          )
          : { rows: [] }

        request.ctx = {
          userId: user.id,
          role,
          organizationIds,
          enabledModuleKeys: modules.rows.map((row) => row.module_key),
        }
        done()
      })
    }

    void loadContext().catch(error => done(error as Error))
  })
})
