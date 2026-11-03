import type { AuthUser } from '../../auth/routes.js'
import type { PriorityDefinition } from './priority-model.js'
import { priorityAccess, priorityContactBlockedSql } from './priority-repository.js'
import { profileError, type ProfileDb } from './record-profile.js'
import { insertLeadTask } from './task-repository.js'

// Activation changes and authorization updates take the exclusive lock. Tasks share it.
export function lockPriorityEffects(db: ProfileDb, instanceId: string, shared = false) {
  const lock = shared ? 'pg_advisory_xact_lock_shared' : 'pg_advisory_xact_lock'
  return db.query(`SELECT ${lock}(hashtextextended($1,0))`, [`crm-priority-effects:${instanceId}`])
}

export async function setPriorityEffects(
  db: ProfileDb,
  user: AuthUser,
  input: { crmInstanceId: string; expectedActivationId: string; enabled: boolean },
) {
  const { crmInstanceId, expectedActivationId, enabled } = input
  const { canEdit, organizationId } = await priorityAccess(db, user, crmInstanceId)
  if (!canEdit)
    throw profileError(
      403,
      'Somente administradores autorizados podem configurar tarefas automáticas.',
    )
  await lockPriorityEffects(db, crmInstanceId)
  const updated = await db.query(
    `UPDATE public.crm_priority_configs c SET effects_enabled=$4
     WHERE c.crm_instance_id=$1 AND c.organization_id=$2 AND c.active_activation_id=$3
     RETURNING c.effects_enabled`,
    [crmInstanceId, organizationId, expectedActivationId, enabled],
  )
  if (!updated.rowCount) throw profileError(409, 'O modelo ativo mudou. Recarregue a configuração.')
  return { effectsEnabled: enabled }
}

type PriorityTransition = {
  id: string
  leadId: string
  instanceId: string
  organizationId: string
  activationId: string
  cause: 'baseline' | 'change' | 'time'
  occurredAt: Date
  previousQueueId: string | null
  queue?: PriorityDefinition['queues'][number]
}

// The caller holds the lead and pending work locks and persists the transition in this transaction.
export async function applyPriorityTransition(
  db: ProfileDb,
  input: PriorityTransition,
): Promise<void> {
  const {
    id,
    leadId,
    instanceId,
    organizationId,
    activationId,
    cause,
    occurredAt,
    queue,
    previousQueueId,
  } = input
  if (
    cause === 'baseline' ||
    !queue?.taskDueDays ||
    !queue.recommendation ||
    previousQueueId === queue.id
  )
    return
  await lockPriorityEffects(db, instanceId, true)
  const assignee = (
    await db.query<{ user_id: string }>(
      `SELECT m.user_id FROM public.leads l
     JOIN public.crm_pipelines p ON p.id=l.pipeline_id AND p.organization_id=l.organization_id
     JOIN public.crm_priority_configs c ON c.crm_instance_id=COALESCE(l.crm_instance_id,p.crm_instance_id)
       AND c.organization_id=l.organization_id
     JOIN public.crm_priority_activations a ON a.id=c.active_activation_id
     JOIN public.crm_instances ci ON ci.id=c.crm_instance_id AND ci.status='active'
     JOIN public.crm_instance_members m ON m.crm_instance_id=ci.id AND m.status='active'
       AND (m.id=l.owner_member_id OR m.user_id=COALESCE(l.assigned_to,l.owner_id))
     WHERE l.id=$1 AND c.crm_instance_id=$2 AND l.organization_id=$3 AND c.active_activation_id=$4
       AND (l.crm_instance_id IS NULL OR p.crm_instance_id IS NULL OR l.crm_instance_id=p.crm_instance_id)
       AND c.effects_enabled AND a.refreshed_at<=$6 AND l.deleted_at IS NULL
       AND l.status='open' AND NOT ${priorityContactBlockedSql}
       AND NOT EXISTS (SELECT 1 FROM public.crm_priority_task_effects WHERE transition_id=$5)
     ORDER BY (m.id=l.owner_member_id) DESC NULLS LAST LIMIT 1`,
      [leadId, instanceId, organizationId, activationId, id, occurredAt],
    )
  ).rows[0]
  if (!assignee) return
  const task = await insertLeadTask(db, {
    organizationId,
    leadId,
    title: queue.recommendation,
    description: `Criada automaticamente ao entrar na fila “${queue.label}”.`,
    dueAt: new Date(occurredAt.getTime() + queue.taskDueDays * 86_400_000).toISOString(),
    assignedTo: assignee.user_id,
  })
  await db.query(
    `INSERT INTO public.crm_priority_task_effects(transition_id,organization_id,crm_instance_id,task_id)
     VALUES($1,$2,$3,$4)`,
    [id, organizationId, instanceId, task.id],
  )
}
