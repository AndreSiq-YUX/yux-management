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
import { leadWhatsAppCapability, leadWhatsAppSendSchema, queueLeadWhatsApp } from './lead-whatsapp.js'
import { leadBulkSchema, runLeadBulkAction } from './lead-bulk.js'
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
  app.post('/leads/bulk', async (request, reply) => {
    const user = await authenticate(request, reply)
    if (!user) return reply
    const input = leadBulkSchema.safeParse(request.body)
    if (!input.success) throw profileError(400, 'Selecione até 100 leads e uma ação válida.')
    return runLeadBulkAction(app.pg, user, input.data)
  })
  app.get('/leads/:id/whatsapp', async (request, reply) => {
    const user = await authenticate(request, reply)
    if (!user) return reply
    return inProfileTransaction(app.pg, async (db) => {
      const lead = await requireActiveLead(db, user, id(request.params))
      return leadWhatsAppCapability(db, lead)
    })
  })
  app.post('/leads/:id/whatsapp', async (request, reply) => {
    const user = await authenticate(request, reply)
    if (!user) return reply
    const input = leadWhatsAppSendSchema.safeParse(request.body)
    if (!input.success)
      throw profileError(400, 'Escreva a mensagem ou informe o modelo aprovado.')
    const result = await inProfileTransaction(app.pg, (db) =>
      queueLeadWhatsApp(db, user, id(request.params), input.data),
    )
    if (result.status === 'queued') {
      try {
        await app.jobQueue.add(
          'omnichannel.dispatchOutbound',
          { messageId: result.messageId },
          { jobId: `crm-whatsapp-${result.messageId}` },
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
      // Explicit columns: the reply text is the lead's own message; no routing tokens or provider data.
      const replies = (
        await db.query(
          `SELECT id, from_email AS "fromEmail", from_name AS "fromName", subject, left(text_body, 20000) AS text,
                  is_auto_reply AS "isAutoReply", received_at AS "receivedAt",
                  COALESCE((SELECT jsonb_agg(jsonb_build_object('filename', a->>'filename', 'size', a->'size')) FROM jsonb_array_elements(attachments) a), '[]'::jsonb) AS attachments
             FROM public.email_inbound_messages
            WHERE lead_id=$1 AND organization_id=$2 ORDER BY received_at DESC LIMIT 20`,
          [lead.id, lead.organization_id],
        )
      ).rows
      return { ...capability, requests, replies }
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
        replyToInboundId: z.uuid().optional(),
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
