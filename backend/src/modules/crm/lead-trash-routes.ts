import { profileError as validationError } from './record-profile.js'
import { z } from 'zod'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { AuthUser } from '../../auth/routes.js'
import { inProfileTransaction } from './record-profile.js'
import { trashAccess, trashLeads } from './lead-trash.js'
export async function registerLeadTrashRoutes(
  app: FastifyInstance,
  authenticate: (
    r: FastifyRequest,
    p: FastifyReply,
  ) => Promise<AuthUser | null>,
) {
  app.post('/leads/restore', async (request, reply) => {
    const user = await authenticate(request, reply)
    if (!user) return reply
    const body = checked(() =>
      z
        .object({
          crmInstanceId: z.string().uuid(),
          leadIds: z.array(z.string().uuid()).min(1).max(100),
        })
        .strict()
        .parse(request.body),
    )
    return inProfileTransaction(app.pg, (db) =>
      trashLeads(db, user, body.crmInstanceId, body.leadIds, true),
    )
  })
  app.post('/leads/trash', async (request, reply) => {
    const user = await authenticate(request, reply)
    if (!user) return reply
    const body = checked(() =>
      z
        .object({
          crmInstanceId: z.string().uuid(),
          leadIds: z.array(z.string().uuid()).min(1).max(100),
        })
        .strict()
        .parse(request.body),
    )
    return inProfileTransaction(app.pg, (db) =>
      trashLeads(db, user, body.crmInstanceId, body.leadIds),
    )
  })
  app.post('/leads/:id/restore', async (request, reply) => {
    const user = await authenticate(request, reply)
    if (!user) return reply
    const { id } = checked(() =>
      z.object({ id: z.string().uuid() }).parse(request.params),
    )
    const body = checked(() =>
      z
        .object({ crmInstanceId: z.string().uuid() })
        .strict()
        .parse(request.body),
    )
    return inProfileTransaction(app.pg, (db) =>
      trashLeads(db, user, body.crmInstanceId, [id], true),
    )
  })
  app.get('/leads/trash', async (request, reply) => {
    const user = await authenticate(request, reply)
    if (!user) return reply
    const query = checked(() =>
      z
        .object({
          crmInstanceId: z.string().uuid(),
          afterId: z.string().uuid().optional(),
        })
        .strict()
        .parse(request.query),
    )
    await trashAccess(app.pg, user, query.crmInstanceId)
    const result = await app.pg.query<{
      id: string
      name: string
      company: string | null
      deleted_at: string
    }>(
      `SELECT id,name,company,deleted_at FROM public.leads WHERE crm_instance_id=$1 AND deleted_at IS NOT NULL AND ($2::uuid IS NULL OR id>$2) ORDER BY id LIMIT 101`,
      [query.crmInstanceId, query.afterId ?? null],
    )
    return {
      leads: result.rows.slice(0, 100).map((l) => ({
        id: l.id,
        name: l.name,
        company: l.company,
        deletedAt: l.deleted_at,
      })),
      nextCursor: result.rows.length > 100 ? result.rows[99].id : null,
    }
  })
}

function checked<T>(parse: () => T): T {
  try {
    return parse()
  } catch (error) {
    if (error instanceof z.ZodError)
      throw validationError(400, error.issues[0]?.message || 'Dados inválidos.')
    throw error
  }
}
