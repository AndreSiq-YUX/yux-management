import type { AuthUser } from '../../auth/routes.js'
import { type ProfileDb, profileError } from './record-profile.js'
import { recordDomainEvent } from '../events/repository.js'
export async function trashAccess(
  db: ProfileDb,
  user: AuthUser,
  instanceId: string,
) {
  const result = await db.query<{ id: string }>(
    `SELECT ci.id FROM public.crm_instances ci WHERE ci.id=$1 AND ($3::boolean OR EXISTS (
    SELECT 1 FROM public.crm_instance_members m JOIN public.memberships member ON member.user_id=m.user_id AND member.organization_id=ci.organization_id
    WHERE m.crm_instance_id=ci.id AND m.user_id=$2 AND m.status='active' AND m.role IN ('client_admin','yux_admin')
  ))`,
    [instanceId, user.id, ['yux_admin', 'yux_operator'].includes(user.role)],
  )
  if (!result.rows[0])
    throw profileError(
      404,
      'CRM não encontrado ou sem permissão para excluir leads.',
    )
}
export async function trashLeads(
  db: ProfileDb,
  user: AuthUser,
  instanceId: string,
  ids: string[],
  restore = false,
) {
  await trashAccess(db, user, instanceId)
  const unique = [...new Set(ids)]
  const result = await db.query<{
    id: string
    organization_id: string
    deleted_at: string | null
  }>(
    `SELECT id,organization_id,deleted_at FROM public.leads WHERE crm_instance_id=$1 AND id=ANY($2::uuid[]) ORDER BY id FOR UPDATE`,
    [instanceId, unique],
  )
  if (result.rows.length !== unique.length)
    throw profileError(
      404,
      'Um dos leads não pertence a este CRM. Nenhuma alteração foi aplicada.',
    )
  for (const lead of result.rows) {
    if (restore) {
      await db.query(
        `UPDATE public.leads SET deleted_at=NULL,deleted_by=NULL,updated_at=now() WHERE id=$1`,
        [lead.id],
      )
    } else if (!lead.deleted_at) {
      // Mark paused before setting the tombstone so the DB guard also permits these maintenance writes.
      await db.query(
        `UPDATE public.crm_sequence_enrollments SET status='paused',next_execution_at=NULL,updated_at=now() WHERE lead_id=$1 AND status='active'`,
        [lead.id],
      )
      await db.query(
        `UPDATE public.email_send_requests SET status='suppressed',cancelled_at=now(),updated_at=now() WHERE lead_id=$1 AND status IN ('queued','failed')`,
        [lead.id],
      )
      await db.query(
        `UPDATE public.messages SET delivery_status='failed',cancelled_at=now(),updated_at=now() WHERE direction='outbound' AND delivery_status IN ('queued','pending','failed') AND conversation_id IN (SELECT id FROM public.conversations WHERE lead_id=$1)`,
        [lead.id],
      )
      await db.query(
        `UPDATE public.automation_executions SET status='cancelled',cancelled_at=now() WHERE lead_id=$1 AND status IN ('pending','failed')`,
        [lead.id],
      )
      await db.query(
        `UPDATE public.leads SET deleted_at=now(),deleted_by=$2,updated_at=now() WHERE id=$1`,
        [lead.id, user.id],
      )
    } else continue
    await recordDomainEvent(db as never, {
      eventType: restore ? 'lead.restored' : 'lead.deleted',
      organizationId: lead.organization_id,
      crmInstanceId: instanceId,
      aggregateType: 'lead',
      aggregateId: lead.id,
      leadId: lead.id,
      actor: { type: 'user', id: user.id },
      payload: { recoverable: true },
    })
  }
  return { success: true, count: unique.length }
}
