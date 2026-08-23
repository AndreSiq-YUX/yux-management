import { recordDomainEvent } from '../events/repository.js'
import { loadMissionCommandResult, missionArtifactHash, saveMissionCommandResult, type MissionCommandContext, type MissionCommandQueryable } from '../action-engine/mission-command.js'

export type SequenceDraft = {
  name: string; description?: string; conversionGoal?: string;
  steps: Array<{ templateVersionId: string; delayMinutes: number; exitConditions: string[] }>
}
type CommandResult = { entityId: string; versionId: string; status: 'draft' | 'published'; contentHash: string; evidence: Record<string, unknown> }

export function validateSequenceDraft(input: SequenceDraft): SequenceDraft {
  if (!input.name.trim() || input.steps.length < 1 || input.steps.length > 12) throw new Error('sequence_draft_invalid')
  if (input.steps.some((step, index) => !step.templateVersionId || !Number.isInteger(step.delayMinutes) || step.delayMinutes < 0 || (index > 0 && step.delayMinutes === 0))) throw new Error('sequence_step_invalid')
  if (new Set(input.steps.map(step => step.templateVersionId)).size !== input.steps.length) throw new Error('sequence_template_version_duplicate')
  return { ...input, name: input.name.trim(), description: input.description?.trim(), steps: input.steps.map(step => ({ ...step, exitConditions: [...step.exitConditions] })) }
}

export async function createSequenceDraft(client: MissionCommandQueryable, context: MissionCommandContext, input: SequenceDraft): Promise<CommandResult> {
  const commandKey = 'crm.sequence.create_draft'
  const prior = await loadMissionCommandResult<CommandResult>(client, context, commandKey); if (prior) return prior
  const draft = validateSequenceDraft(input)
  const templates = await client.query<{ count: number | string }>(
    `SELECT COUNT(*)::INT AS count FROM public.email_template_versions version JOIN public.email_templates template ON template.id=version.template_id
      WHERE template.organization_id=$1 AND version.id = ANY($2::UUID[]) AND template.status='published'`, [context.organizationId, draft.steps.map(step => step.templateVersionId)])
  if (Number(templates.rows[0]?.count ?? 0) !== draft.steps.length) throw new Error('sequence_template_version_unavailable')
  const contentHash = missionArtifactHash(draft)
  const sequence = await client.query<{ id: string }>(
    `INSERT INTO public.crm_sequences (organization_id,name,description,is_active,channel,status,conversion_goal,mission_id,action_run_id,content_hash)
     VALUES ($1,$2,$3,FALSE,'email','draft',$4,$5,$6,$7) RETURNING id`,
    [context.organizationId, draft.name, draft.description ?? null, draft.conversionGoal ?? null, context.missionId, context.actionRunId, contentHash])
  const entityId = requiredId(sequence.rows[0]?.id)
  for (const [index, step] of draft.steps.entries()) await client.query(
    `INSERT INTO public.crm_sequence_steps (sequence_id,step_kind,action_type,channel,delay_minutes,subject,body,template_id,template_version_id,requires_human_approval,is_active,order_index)
     SELECT $1,'message','email','email',$2,version.subject,version.body_text,version.template_id,version.id,FALSE,FALSE,$3
       FROM public.email_template_versions version WHERE version.id=$4`, [entityId, step.delayMinutes, index, step.templateVersionId])
  const version = await client.query<{ id: string }>(
    `INSERT INTO public.crm_sequence_versions (organization_id,sequence_id,version_number,status,snapshot,content_hash,mission_id,action_run_id)
     VALUES ($1,$2,1,'draft',$3,$4,$5,$6) RETURNING id`, [context.organizationId, entityId, draft, contentHash, context.missionId, context.actionRunId])
  const versionId = requiredId(version.rows[0]?.id)
  const result = { entityId, versionId, status: 'draft' as const, contentHash, evidence: { stepCount: draft.steps.length, activated: false, existingEnrollments: 0 } }
  await recordDomainEvent(client as never, { eventType: 'mission.sequence_draft_created', organizationId: context.organizationId, aggregateType: 'mission', aggregateId: context.missionId, actor: { type: 'user', id: context.actorId }, payload: { missionId: context.missionId, actionRunId: context.actionRunId, sequenceId: entityId, versionId, contentHash } })
  return saveMissionCommandResult(client, context, commandKey, result)
}

export async function simulateSequenceDraft(client: MissionCommandQueryable, context: MissionCommandContext, input: { sequenceId: string; expectedContentHash: string }) {
  const sequence = await client.query<{ id: string; content_hash: string; step_count: number | string; provider_ready: boolean }>(
    `SELECT sequence.id, sequence.content_hash, COUNT(step.id)::INT AS step_count,
       EXISTS (SELECT 1 FROM public.email_provider_connections connection WHERE connection.organization_id=$2 AND connection.status='connected') AS provider_ready
       FROM public.crm_sequences sequence LEFT JOIN public.crm_sequence_steps step ON step.sequence_id=sequence.id
      WHERE sequence.id=$1 AND sequence.organization_id=$2 AND sequence.mission_id=$3 AND sequence.status='draft'
      GROUP BY sequence.id`, [input.sequenceId, context.organizationId, context.missionId])
  const row = sequence.rows[0]; if (!row) throw new Error('sequence_draft_not_found')
  if (row.content_hash !== input.expectedContentHash) throw new Error('sequence_draft_hash_changed')
  return { entityId: row.id, status: 'simulated' as const, contentHash: row.content_hash, evidence: { stepCount: Number(row.step_count), providerReady: row.provider_ready, existingEnrollments: 0, activationPerformed: false } }
}

export async function publishSequenceDraft(client: MissionCommandQueryable, context: MissionCommandContext, input: { sequenceId: string; versionId: string; expectedContentHash: string }): Promise<CommandResult> {
  const commandKey = 'crm.sequence.publish'
  const prior = await loadMissionCommandResult<CommandResult>(client, context, commandKey); if (prior) return prior
  const artifact = await client.query<{ id: string; content_hash: string }>(
    `SELECT sequence.id, sequence.content_hash FROM public.crm_sequences sequence JOIN public.crm_sequence_versions version ON version.sequence_id=sequence.id
      WHERE sequence.id=$1 AND version.id=$2 AND sequence.organization_id=$3 AND sequence.mission_id=$4
        AND sequence.status='draft' AND version.status='draft' LIMIT 1`, [input.sequenceId, input.versionId, context.organizationId, context.missionId])
  const row = artifact.rows[0]; if (!row) throw new Error('sequence_draft_not_found')
  if (row.content_hash !== input.expectedContentHash) throw new Error('sequence_draft_hash_changed')
  const provider = await client.query<{ ready: boolean }>(`SELECT EXISTS (SELECT 1 FROM public.email_provider_connections WHERE organization_id=$1 AND status='connected') AS ready`, [context.organizationId])
  if (!provider.rows[0]?.ready) throw new Error('email_provider_unavailable')
  await client.query(`UPDATE public.crm_sequence_versions SET status='published',published_by=$2,published_at=NOW() WHERE id=$1`, [input.versionId, context.actorId])
  await client.query(`UPDATE public.crm_sequences SET status='active',is_active=TRUE,active_version_id=$2,updated_at=NOW() WHERE id=$1`, [input.sequenceId, input.versionId])
  await client.query(`UPDATE public.crm_sequence_steps SET is_active=TRUE WHERE sequence_id=$1`, [input.sequenceId])
  const result = { entityId: input.sequenceId, versionId: input.versionId, status: 'published' as const, contentHash: row.content_hash, evidence: { activated: true, existingEnrollments: 0 } }
  await recordDomainEvent(client as never, { eventType: 'mission.sequence_published', organizationId: context.organizationId, aggregateType: 'mission', aggregateId: context.missionId, actor: { type: 'user', id: context.actorId }, payload: { missionId: context.missionId, actionRunId: context.actionRunId, sequenceId: input.sequenceId, versionId: input.versionId, contentHash: row.content_hash } })
  return saveMissionCommandResult(client, context, commandKey, result)
}

function requiredId(value?: string) { if (!value) throw new Error('mission_command_persistence_failed'); return value }
