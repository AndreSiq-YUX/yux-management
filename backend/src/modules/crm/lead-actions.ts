import { createHash } from 'node:crypto'
import { z } from 'zod'
import type pg from 'pg'
import type { AuthUser } from '../../auth/routes.js'
import { runWithDatabaseRequestContext } from '../../db/request-context.js'
import { assertEmailSendAllowed } from '../../email/delivery-policy.js'
import { queueEmailRequest } from '../email-delivery/service.js'
import { getApprovedCommercialSender } from '../../email/commercial-sender.js'
import { contactAllowedByPolicy, getContactPolicy } from '../../email/contact-policy.js'
import { recordDomainEvent } from '../events/repository.js'
import {
  getLeadProfile,
  inProfileTransaction,
  profileError,
  type ProfileDb,
} from './record-profile.js'

export const leadActivitySchema = z
  .object({
    kind: z.enum(['note', 'call', 'task', 'meeting']),
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(10000).default(''),
    dueAt: z.iso.datetime().optional(),
    requestId: z.uuid(),
  })
  .strict()
  .refine((v) => !['task', 'meeting'].includes(v.kind) || !!v.dueAt, {
    message: 'Informe data e hora.',
  })
export type LeadActivityInput = z.infer<typeof leadActivitySchema>
export async function requireActiveLead(
  db: ProfileDb,
  user: AuthUser,
  leadId: string,
) {
  await getLeadProfile(db, user, leadId)
  const lead = (
    await db.query(
      'SELECT * FROM public.leads WHERE id=$1 AND deleted_at IS NULL FOR UPDATE',
      [leadId],
    )
  ).rows[0]
  if (!lead) throw profileError(404, 'Lead não encontrado.')
  return lead
}
export async function createLeadActivity(
  pool: pg.Pool,
  user: AuthUser,
  leadId: string,
  input: LeadActivityInput,
) {
  return inProfileTransaction(pool, async (db) => {
    const lead = await requireActiveLead(db, user, leadId)
    const hash = createHash('sha256')
      .update(JSON.stringify(input))
      .digest('hex')
    const prior = (
      await db.query(
        'SELECT payload_hash,result FROM public.crm_lead_activity_requests WHERE id=$1 AND lead_id=$2',
        [input.requestId, leadId],
      )
    ).rows[0]
    if (prior) {
      if (prior.payload_hash !== hash)
        throw profileError(
          409,
          'Esta solicitação já foi usada. Atualize o formulário.',
        )
      return prior.result
    }
    const result: { taskId?: string; interactionId?: string } = {}
    if (['task', 'meeting'].includes(input.kind)) {
      const task = (
        await db.query(
          `INSERT INTO public.lead_tasks(organization_id,lead_id,title,description,due_at,created_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING id`,
          [
            lead.organization_id,
            leadId,
            input.title,
            input.description,
            input.dueAt,
            user.id,
          ],
        )
      ).rows[0]
      result.taskId = task.id
      await db.query(
        'UPDATE public.leads SET next_follow_up_at=LEAST(COALESCE(next_follow_up_at,$2),$2),updated_at=now() WHERE id=$1',
        [leadId, input.dueAt],
      )
      await recordDomainEvent(db, {
        eventType: 'lead.task_created',
        organizationId: lead.organization_id,
        crmInstanceId: lead.crm_instance_id,
        leadId,
        aggregateType: 'task',
        aggregateId: task.id,
        actor: { type: 'user', id: user.id },
        payload: { taskId: task.id, leadId, dueAt: input.dueAt },
      })
    }
    if (input.kind !== 'task') {
      const interaction = (
        await db.query(
          `INSERT INTO public.interactions(organization_id,lead_id,type,title,description,date) VALUES($1,$2,$3,$4,$5,$6) RETURNING id`,
          [
            lead.organization_id,
            leadId,
            input.kind,
            input.title,
            input.description || input.title,
            input.kind === 'meeting' ? input.dueAt : new Date().toISOString(),
          ],
        )
      ).rows[0]
      result.interactionId = interaction.id
      await recordDomainEvent(db, {
        eventType: 'lead.interaction_recorded',
        organizationId: lead.organization_id,
        crmInstanceId: lead.crm_instance_id,
        leadId,
        aggregateType: 'lead',
        aggregateId: leadId,
        actor: { type: 'user', id: user.id },
        payload: {
          interactionId: interaction.id,
          type: input.kind,
          channel: input.kind,
          text: input.description,
        },
      })
      await db.query(
        'UPDATE public.leads SET last_activity_at=now(),updated_at=now() WHERE id=$1',
        [leadId],
      )
    }
    await db.query(
      'INSERT INTO public.crm_lead_activity_requests(id,organization_id,lead_id,payload_hash,result) VALUES($1,$2,$3,$4,$5::jsonb)',
      [
        input.requestId,
        lead.organization_id,
        leadId,
        hash,
        JSON.stringify(result),
      ],
    )
    return result
  })
}
export async function leadEmailCapability(db: ProfileDb, lead: any) {
  if (!lead.email || /@(?:lead|yux)\.local$/i.test(lead.email))
    return {
      canSend: false,
      message: 'Cadastre um e-mail válido para este lead.',
    }
  // Policy and sender are organization data; read them with internal scope and
  // return only a capability to the client, never configuration details.
  const context = await runWithDatabaseRequestContext(
    { role: 'yux_admin', organizationIds: [lead.organization_id] },
    async () => ({
      policy: await getContactPolicy(db, lead.organization_id),
      sender: await getApprovedCommercialSender(db, lead.organization_id),
      revoked: (
        await db.query(
          "SELECT 1 FROM public.lead_channel_permissions WHERE organization_id=$1 AND channel='email' AND lower(address)=lower($2) AND status='revoked' LIMIT 1",
          [lead.organization_id, lead.email.trim()],
        )
      ).rows.length > 0,
    }),
  )
  if (!context.sender)
    return {
      canSend: false,
      message:
        'Configure o remetente comercial em Configurações → E-mails. Depois da aprovação da equipe YUX, o envio fica disponível.',
    }
  if (context.revoked)
    return {
      canSend: false,
      message: 'Este contato pediu para não receber mais e-mails.',
    }
  if (!contactAllowedByPolicy(context.policy.emailBasis, lead.email_opt_in === true))
    return {
      canSend: false,
      message:
        'A política de contato desta conta exige autorização do contato antes do envio por e-mail.',
    }
  try {
    await assertEmailSendAllowed(db, {
      organizationId: lead.organization_id,
      recipient: lead.email,
      category: 'operational',
    })
  } catch {
    return {
      canSend: false,
      message:
        'O envio está bloqueado para este contato ou o limite da conta foi atingido.',
    }
  }
  return {
    canSend: true,
    message: 'Revise a mensagem antes de confirmar o envio.',
    sender: { fromName: context.sender.fromName, fromEmail: context.sender.fromEmail },
    senderRevision: context.sender.revision,
    contactBasis: lead.email_opt_in === true ? 'explicit_opt_in' : context.policy.emailBasis,
  }
}
export async function queueLeadEmail(
  pool: pg.Pool,
  user: AuthUser,
  leadId: string,
  input: { requestId: string; subject: string; body: string },
) {
  return inProfileTransaction(pool, async (db) => {
    const lead = await requireActiveLead(db, user, leadId)
    const capability = await leadEmailCapability(db, lead)
    if (!capability.canSend) throw profileError(422, capability.message)
    const prior = (
      await db.query(
        'SELECT id,subject,body_text,recipient_email,status FROM public.email_send_requests WHERE idempotency_key=$1 AND lead_id=$2',
        [`crm-manual:${leadId}:${input.requestId}`, leadId],
      )
    ).rows[0]
    if (prior) {
      if (
        prior.subject !== input.subject ||
        prior.body_text !== input.body ||
        prior.recipient_email !== lead.email.trim().toLowerCase()
      )
        throw profileError(409, 'A mensagem mudou. Abra uma nova composição.')
      return { requestId: prior.id, status: prior.status }
    }
    // One-to-one commercial message: the contact basis comes from the
    // organization policy (or the lead's explicit opt-in) and is audited.
    const request = await queueEmailRequest(db, {
      organizationId: lead.organization_id,
      leadId,
      recipientEmail: lead.email,
      recipientOptIn: lead.email_opt_in === true,
      emailKind: 'operational',
      subject: input.subject,
      bodyText: input.body,
      bodyHtml: '',
      idempotencyKey: `crm-manual:${leadId}:${input.requestId}`,
      moduleKey: 'crm',
      sourceEntityType: 'crm_manual_email',
      sourceEntityId: leadId,
      metadata: {
        senderRevision: capability.senderRevision,
        contactBasis: capability.contactBasis,
        actorId: user.id,
      },
    })
    await db.query(
      "INSERT INTO public.interactions(organization_id,lead_id,type,title,description,date) VALUES($1,$2,'email','E-mail colocado na fila',$3,now())",
      [lead.organization_id, leadId, input.subject],
    )
    return { requestId: request.id, status: request.status }
  })
}
