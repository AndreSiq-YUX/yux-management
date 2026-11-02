import { mapLead } from './repository.js'
import { createLeadProposal } from './lead-proposals.js'
import { listProposals } from '../proposals/repository.js'
import { loadLeadRelated } from './lead-related.js'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { AuthUser } from '../../auth/routes.js'
import { z } from 'zod'
import {
  createLeadActivity,
  leadActivitySchema,
  leadEmailCapability,
  queueLeadEmail,
  requireActiveLead,
} from './lead-actions.js'
import { inProfileTransaction, profileError } from './record-profile.js'
export async function registerLeadActionRoutes(
  app: FastifyInstance,
  authenticate: (
    r: FastifyRequest,
    p: FastifyReply,
  ) => Promise<AuthUser | null>,
) {
  const id = (value: unknown) => {
    const parsed = z.object({ id: z.uuid() }).safeParse(value)
    if (!parsed.success) throw profileError(400, 'Lead inválido.')
    return parsed.data.id
  }
  app.get('/leads/:id', async (request, reply) => {
    const user = await authenticate(request, reply)
    if (!user) return reply
    return inProfileTransaction(app.pg, async (db) =>
      mapLead(await requireActiveLead(db, user, id(request.params))),
    )
  })
  app.get('/leads/:id/related', async (request, reply) => {
    const user = await authenticate(request, reply)
    if (!user) return reply
    return inProfileTransaction(app.pg, (db) =>
      loadLeadRelated(db, user, id(request.params)),
    )
  })
  app.get('/leads/:id/proposals', async (request, reply) => {
    const user = await authenticate(request, reply)
    if (!user) return reply
    const leadId = id(request.params)
    return inProfileTransaction(app.pg, async (db) => {
      const lead = await requireActiveLead(db, user, leadId)
      return listProposals(db as typeof app.pg, user, {
        leadId,
        organizationId: lead.organization_id,
      })
    })
  })
  app.post('/leads/:id/proposal-drafts', async (request, reply) => {
    const user = await authenticate(request, reply)
    if (!user) return reply
    const input = z
      .object({ packageId: z.uuid(), requestId: z.uuid() })
      .strict()
      .safeParse(request.body)
    if (!input.success)
      throw profileError(400, 'Selecione um pacote comercial.')
    return reply
      .code(201)
      .send(
        await createLeadProposal(app.pg, user, id(request.params), input.data),
      )
  })
  app.post('/leads/:id/activities', async (request, reply) => {
    const user = await authenticate(request, reply)
    if (!user) return reply
    const input = leadActivitySchema.safeParse(request.body)
    if (!input.success)
      throw profileError(
        400,
        'Preencha título, descrição e data quando necessária.',
      )
    return reply
      .code(201)
      .send(
        await createLeadActivity(app.pg, user, id(request.params), input.data),
      )
  })
  app.get('/leads/:id/email', async (request, reply) => {
    const user = await authenticate(request, reply)
    if (!user) return reply
    return inProfileTransaction(app.pg, async (db) => {
      const lead = await requireActiveLead(db, user, id(request.params))
      const capability = await leadEmailCapability(db, lead)
      const requests = (
        await db.query(
          'SELECT id,subject,status,created_at AS "createdAt" FROM public.email_send_requests WHERE lead_id=$1 AND organization_id=$2 ORDER BY created_at DESC LIMIT 20',
          [lead.id, lead.organization_id],
        )
      ).rows
      return { ...capability, requests }
    })
  })
  app.post('/leads/:id/email', async (request, reply) => {
    const user = await authenticate(request, reply)
    if (!user) return reply
    const input = z
      .object({
        requestId: z.uuid(),
        subject: z.string().trim().min(1).max(300),
        body: z.string().trim().min(1).max(20000),
      })
      .strict()
      .safeParse(request.body)
    if (!input.success) throw profileError(400, 'Preencha assunto e mensagem.')
    const result = await queueLeadEmail(
      app.pg,
      user,
      id(request.params),
      input.data,
    )
    if (['queued', 'failed'].includes(result.status)) {
      try {
        await app.jobQueue.add(
          'email.send',
          { requestId: result.requestId },
          { jobId: `crm-email-${result.requestId}` },
        )
      } catch {
        throw profileError(
          503,
          'A mensagem foi registrada, mas a fila está indisponível. Tente novamente sem fechar a composição.',
        )
      }
    }
    return reply.code(202).send(result)
  })
}
