import { createHash } from 'node:crypto'
import type { AuthUser } from '../../auth/routes.js'
import { priorityAccess } from './priority-repository.js'
import { profileError, type ProfileDb } from './record-profile.js'

type ActivationResult = { activationId: string | null; versionId: string | null }
type Command = { crmInstanceId: string; expectedActivationId: string | null; requestId: string } & (
  { revision: number; runId: string } | { versionId: string | null }
)

export async function changePriorityActivation(
  db: ProfileDb,
  user: AuthUser,
  input: Command,
): Promise<ActivationResult> {
  const { crmInstanceId, requestId, expectedActivationId } = input
  const { canEdit, organizationId } = await priorityAccess(db, user, crmInstanceId)
  if (!canEdit)
    throw profileError(403, 'Somente administradores autorizados podem publicar o modelo.')
  const args = [crmInstanceId, organizationId]
  const config = (
    await db.query<{ revision: number; active_activation_id: string | null }>(
      'SELECT revision,active_activation_id FROM public.crm_priority_configs WHERE crm_instance_id=$1 AND organization_id=$2 FOR UPDATE',
      args,
    )
  ).rows[0]
  if (!config) throw profileError(409, 'Salve e simule um rascunho primeiro.')
  const hash = createHash('sha256').update(JSON.stringify(input)).digest('hex')
  const prior = (
    await db.query<{ actor_id: string; payload_hash: string; result: ActivationResult }>(
      'SELECT actor_id,payload_hash,result FROM public.crm_priority_commands WHERE crm_instance_id=$1 AND organization_id=$2 AND request_id=$3',
      [...args, requestId],
    )
  ).rows[0]
  if (prior) {
    if (prior.payload_hash !== hash || prior.actor_id !== user.id)
      throw profileError(409, 'Esta solicitação já foi usada para outra mudança.')
    return prior.result
  }
  if (config.active_activation_id !== expectedActivationId)
    throw profileError(409, 'O modelo ativo mudou. Recarregue a configuração.')
  let versionId: string | null
  if ('revision' in input) {
    const preview = await db.query(
      `SELECT id FROM public.crm_priority_preview_runs
      WHERE crm_instance_id=$1 AND organization_id=$2 AND id=$3 AND revision=$4 AND actor_id=$5
        AND publishable AND completed_at IS NOT NULL AND as_of > now() - interval '24 hours'`,
      [...args, input.runId, input.revision, user.id],
    )
    if (config.revision !== input.revision || !preview.rows[0])
      throw profileError(409, 'Conclua uma simulação da revisão atual antes de publicar.')
    await db.query(
      `INSERT INTO public.crm_priority_versions(crm_instance_id,organization_id,revision,definition,created_by)
      SELECT crm_instance_id,organization_id,revision,draft,$3 FROM public.crm_priority_configs
      WHERE crm_instance_id=$1 AND organization_id=$2 ON CONFLICT (crm_instance_id,revision) DO NOTHING`,
      [...args, user.id],
    )
    versionId = (
      await db.query<{ id: string }>(
        `SELECT id FROM public.crm_priority_versions
      WHERE crm_instance_id=$1 AND organization_id=$2 AND revision=$3`,
        [...args, input.revision],
      )
    ).rows[0].id
  } else {
    versionId = input.versionId
    if (
      versionId &&
      !(
        await db.query(
          `SELECT id FROM public.crm_priority_versions
      WHERE crm_instance_id=$1 AND organization_id=$2 AND id=$3`,
          [...args, versionId],
        )
      ).rows[0]
    )
      throw profileError(404, 'Versão não encontrada neste CRM.')
  }
  const activationId = versionId
    ? (
        await db.query<{ id: string }>(
          `INSERT INTO public.crm_priority_activations
    (crm_instance_id,organization_id,version_id,created_by) VALUES($1,$2,$3,$4) RETURNING id`,
          [...args, versionId, user.id],
        )
      ).rows[0].id
    : null
  await db.query(
    `UPDATE public.crm_priority_configs SET active_version_id=$3,active_activation_id=$4
    WHERE crm_instance_id=$1 AND organization_id=$2`,
    [...args, versionId, activationId],
  )
  const result = { activationId, versionId }
  await db.query(
    `INSERT INTO public.crm_priority_commands(crm_instance_id,organization_id,request_id,actor_id,payload_hash,result)
    VALUES($1,$2,$3,$4,$5,$6)`,
    [...args, requestId, user.id, hash, JSON.stringify(result)],
  )
  return result
}
