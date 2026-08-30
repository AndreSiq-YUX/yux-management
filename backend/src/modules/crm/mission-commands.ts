import { recordDomainEvent } from '../events/repository.js'
import { loadMissionCommandResult, missionArtifactHash, saveMissionCommandResult, type MissionCommandContext, type MissionCommandQueryable } from '../action-engine/mission-command.js'

export type FunnelStageDraft = { key: string; name: string; color?: string; exitCriteria: string[]; isWon: boolean; isLost: boolean }
export type FunnelDraft = { name: string; description?: string; stages: FunnelStageDraft[] }
type CommandResult = { entityId: string; versionId: string; status: 'draft' | 'published'; contentHash: string; evidence: Record<string, unknown> }

export function validateFunnelDraft(input: FunnelDraft): FunnelDraft {
  if (!input.name.trim() || input.name.length > 120) throw new Error('pipeline_name_invalid')
  if (input.stages.length < 2 || input.stages.length > 20) throw new Error('pipeline_stage_count_invalid')
  const keys = input.stages.map(stage => stage.key)
  if (keys.some(key => !/^[a-z0-9_]+$/.test(key)) || new Set(keys).size !== keys.length) throw new Error('pipeline_stage_key_invalid')
  if (input.stages.some(stage => !stage.name.trim() || (stage.isWon && stage.isLost))) throw new Error('pipeline_stage_outcome_invalid')
  if (input.stages.filter(stage => stage.isWon).length > 1 || input.stages.filter(stage => stage.isLost).length > 1) throw new Error('pipeline_stage_outcome_duplicate')
  return { ...input, name: input.name.trim(), description: input.description?.trim(), stages: input.stages.map(stage => ({ ...stage, name: stage.name.trim(), color: stage.color ?? '#64748b', exitCriteria: stage.exitCriteria.map(item => item.trim()).filter(Boolean) })) }
}

export async function createPipelineDraft(client: MissionCommandQueryable, context: MissionCommandContext, input: FunnelDraft): Promise<CommandResult> {
  const commandKey = 'crm.pipeline.create_draft'
  const prior = await loadMissionCommandResult<CommandResult>(client, context, commandKey); if (prior) return prior
  const draft = validateFunnelDraft(input)
  const instance = await client.query<{ id: string }>(`SELECT id FROM public.crm_instances WHERE organization_id = $1 AND status = 'active' LIMIT 1`, [context.organizationId])
  if (!instance.rows[0]) throw new Error('crm_instance_unavailable')
  const contentHash = missionArtifactHash(draft)
  const version = await client.query<{ id: string }>(
    `INSERT INTO public.crm_pipeline_versions (crm_instance_id, version_number, status, snapshot_payload, mission_id, action_run_id, content_hash)
     VALUES ($1, COALESCE((SELECT MAX(version_number)+1 FROM public.crm_pipeline_versions WHERE crm_instance_id = $1),1), 'draft', $2, $3, $4, $5) RETURNING id`,
    [instance.rows[0].id, draft, context.missionId, context.actionRunId, contentHash],
  )
  const versionId = requiredId(version.rows[0]?.id)
  for (const [index, stage] of draft.stages.entries()) await client.query(
    `INSERT INTO public.crm_stage_versions (pipeline_version_id, stable_key, name, color, order_index, is_won, is_lost)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`, [versionId, stage.key, stage.name, stage.color, index, stage.isWon, stage.isLost])
  const result = { entityId: versionId, versionId, status: 'draft' as const, contentHash, evidence: { stageCount: draft.stages.length, activated: false } }
  await recordDomainEvent(client as never, { eventType: 'mission.pipeline_draft_created', organizationId: context.organizationId, aggregateType: 'mission', aggregateId: context.missionId, actor: { type: 'user', id: context.actorId }, payload: { missionId: context.missionId, actionRunId: context.actionRunId, versionId, contentHash } })
  return saveMissionCommandResult(client, context, commandKey, result)
}

export async function publishPipelineDraft(client: MissionCommandQueryable, context: MissionCommandContext, input: { versionId: string; expectedContentHash: string }): Promise<CommandResult> {
  const commandKey = 'crm.pipeline.publish'
  const prior = await loadMissionCommandResult<CommandResult>(client, context, commandKey); if (prior) return prior
  const version = await client.query<{ id: string; crm_instance_id: string; content_hash: string; snapshot_payload: FunnelDraft }>(
    `SELECT version.id, version.crm_instance_id, version.content_hash, version.snapshot_payload
       FROM public.crm_pipeline_versions version JOIN public.crm_instances instance ON instance.id = version.crm_instance_id
      WHERE version.id = $1 AND instance.organization_id = $2 AND version.mission_id = $3 AND version.status = 'draft' LIMIT 1`,
    [input.versionId, context.organizationId, context.missionId])
  const artifact = version.rows[0]
  if (!artifact) throw new Error('pipeline_draft_not_found')
  if (artifact.content_hash !== input.expectedContentHash) throw new Error('pipeline_draft_hash_changed')
  const pipeline = await client.query<{ id: string }>(
    `INSERT INTO public.crm_pipelines (organization_id, crm_instance_id, name, description, is_default, is_active)
     VALUES ($1,$2,$3,$4,FALSE,TRUE) RETURNING id`,
    [context.organizationId, artifact.crm_instance_id, artifact.snapshot_payload.name, artifact.snapshot_payload.description ?? null])
  const pipelineId = requiredId(pipeline.rows[0]?.id)
  await client.query(
    `INSERT INTO public.crm_pipeline_stages (pipeline_id, key, name, color, order_index, is_won, is_lost, is_active)
     SELECT $2, stable_key, name, color, order_index, is_won, is_lost, TRUE FROM public.crm_stage_versions WHERE pipeline_version_id = $1 ORDER BY order_index`,
    [artifact.id, pipelineId])
  await client.query(`UPDATE public.crm_pipeline_versions SET source_pipeline_id = $2, status = 'published', published_at = NOW(), published_by = $3, updated_at = NOW() WHERE id = $1`, [artifact.id, pipelineId, context.actorId])
  const result = { entityId: pipelineId, versionId: artifact.id, status: 'published' as const, contentHash: artifact.content_hash, evidence: { stageCount: artifact.snapshot_payload.stages.length, activated: true } }
  await recordDomainEvent(client as never, { eventType: 'mission.pipeline_published', organizationId: context.organizationId, aggregateType: 'mission', aggregateId: context.missionId, actor: { type: 'user', id: context.actorId }, payload: { missionId: context.missionId, actionRunId: context.actionRunId, pipelineId, versionId: artifact.id, contentHash: artifact.content_hash } })
  return saveMissionCommandResult(client, context, commandKey, result)
}

export async function discardPipelineDraft(client: MissionCommandQueryable, context: MissionCommandContext, input: { versionId: string }) {
  const commandKey = 'crm.pipeline.discard_draft'
  const prior = await loadMissionCommandResult<{ versionId: string; status: 'archived' }>(client, context, commandKey); if (prior) return prior
  const archived = await client.query<{ id: string }>(
    `UPDATE public.crm_pipeline_versions version SET status = 'archived', updated_at = NOW()
      FROM public.crm_instances instance
     WHERE version.id = $1 AND version.crm_instance_id = instance.id
       AND instance.organization_id = $2 AND version.mission_id = $3 AND version.status = 'draft'
     RETURNING version.id`,
    [input.versionId, context.organizationId, context.missionId],
  )
  if (!archived.rows[0]) throw new Error('pipeline_draft_recovery_not_available')
  const result = { versionId: input.versionId, status: 'archived' as const }
  await recordDomainEvent(client as never, { eventType: 'mission.pipeline_draft_archived', organizationId: context.organizationId, aggregateType: 'mission', aggregateId: context.missionId, actor: { type: 'user', id: context.actorId }, payload: { missionId: context.missionId, actionRunId: context.actionRunId, versionId: input.versionId } })
  return saveMissionCommandResult(client, context, commandKey, result)
}

export async function archiveMissionPipeline(client: MissionCommandQueryable, context: MissionCommandContext, input: { pipelineId: string }) {
  const commandKey = 'crm.pipeline.archive'
  const prior = await loadMissionCommandResult<{ pipelineId: string; status: 'archived' }>(client, context, commandKey); if (prior) return prior
  const archived = await client.query<{ id: string }>(
    `UPDATE public.crm_pipelines pipeline SET is_active = FALSE, updated_at = NOW()
      FROM public.crm_pipeline_versions version, public.crm_instances instance
     WHERE pipeline.id = $1 AND pipeline.organization_id = $2
       AND version.source_pipeline_id = pipeline.id AND version.mission_id = $3
       AND instance.id = pipeline.crm_instance_id AND instance.organization_id = $2
     RETURNING pipeline.id`,
    [input.pipelineId, context.organizationId, context.missionId],
  )
  if (!archived.rows[0]) throw new Error('pipeline_recovery_not_available')
  await client.query(`UPDATE public.crm_pipeline_versions SET status = 'archived', updated_at = NOW() WHERE source_pipeline_id = $1 AND mission_id = $2`, [input.pipelineId, context.missionId])
  const result = { pipelineId: input.pipelineId, status: 'archived' as const }
  await recordDomainEvent(client as never, { eventType: 'mission.pipeline_archived', organizationId: context.organizationId, aggregateType: 'mission', aggregateId: context.missionId, actor: { type: 'user', id: context.actorId }, payload: { missionId: context.missionId, actionRunId: context.actionRunId, pipelineId: input.pipelineId } })
  return saveMissionCommandResult(client, context, commandKey, result)
}

function requiredId(value?: string) { if (!value) throw new Error('mission_command_persistence_failed'); return value }
