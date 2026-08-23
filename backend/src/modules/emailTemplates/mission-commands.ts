import { recordDomainEvent } from '../events/repository.js'
import { loadMissionCommandResult, missionArtifactHash, saveMissionCommandResult, type MissionCommandContext, type MissionCommandQueryable } from '../action-engine/mission-command.js'

export type EmailTemplateDraft = {
  name: string; subject: string; preheader?: string; bodyHtml: string; bodyText: string;
  sourceIds: string[]; complianceNotes: string[]
}
type CommandResult = { entityId: string; versionId?: string; status: 'draft' | 'published'; contentHash: string; evidence: Record<string, unknown> }

export function validateEmailTemplateDraft(input: EmailTemplateDraft) {
  if (!input.name.trim() || !input.subject.trim() || !input.bodyHtml.trim() || !input.bodyText.trim()) throw new Error('email_template_content_invalid')
  if (input.sourceIds.length === 0 || new Set(input.sourceIds).size !== input.sourceIds.length) throw new Error('email_template_citations_required')
  return { ...input, name: input.name.trim(), subject: input.subject.trim(), preheader: input.preheader?.trim(), bodyHtml: input.bodyHtml.trim(), bodyText: input.bodyText.trim(), sourceIds: [...input.sourceIds].sort(), complianceNotes: [...input.complianceNotes] }
}

export async function createEmailTemplateDraft(client: MissionCommandQueryable, context: MissionCommandContext, input: EmailTemplateDraft): Promise<CommandResult> {
  const commandKey = 'email.template.create_draft'
  const prior = await loadMissionCommandResult<CommandResult>(client, context, commandKey); if (prior) return prior
  const draft = validateEmailTemplateDraft(input); const contentHash = missionArtifactHash(draft)
  const inserted = await client.query<{ id: string }>(
    `INSERT INTO public.email_templates (scope, organization_id, name, description, category, email_kind, module_key, status,
       subject, preheader, body_html, body_text, variables_schema, required_variables, editable_by_client, created_by, updated_by,
       mission_id, action_run_id, content_hash)
     VALUES ('organization',$1,$2,$3,'mission_nurture','marketing','action_engine','draft',$4,$5,$6,$7,$8,'{}',TRUE,$9,$9,$10,$11,$12)
     RETURNING id`,
    [context.organizationId, draft.name, `Mission ${context.missionId}; sources: ${draft.sourceIds.join(',')}`, draft.subject, draft.preheader ?? null,
      draft.bodyHtml, draft.bodyText, { sourceIds: draft.sourceIds, complianceNotes: draft.complianceNotes }, context.actorId, context.missionId, context.actionRunId, contentHash])
  const entityId = requiredId(inserted.rows[0]?.id)
  const result = { entityId, status: 'draft' as const, contentHash, evidence: { sourceIds: draft.sourceIds, complianceNotes: draft.complianceNotes, activated: false } }
  await recordDomainEvent(client as never, { eventType: 'mission.email_template_draft_created', organizationId: context.organizationId, aggregateType: 'mission', aggregateId: context.missionId, actor: { type: 'user', id: context.actorId }, payload: { missionId: context.missionId, actionRunId: context.actionRunId, templateId: entityId, contentHash } })
  return saveMissionCommandResult(client, context, commandKey, result)
}

export async function publishEmailTemplateVersion(client: MissionCommandQueryable, context: MissionCommandContext, input: { templateId: string; expectedContentHash: string }): Promise<CommandResult> {
  const commandKey = 'email.template.publish'
  const prior = await loadMissionCommandResult<CommandResult>(client, context, commandKey); if (prior) return prior
  const current = await client.query<{ id: string; content_hash: string }>(
    `SELECT id, content_hash FROM public.email_templates WHERE id = $1 AND organization_id = $2 AND mission_id = $3 AND status = 'draft' LIMIT 1`,
    [input.templateId, context.organizationId, context.missionId])
  if (!current.rows[0]) throw new Error('email_template_draft_not_found')
  if (current.rows[0].content_hash !== input.expectedContentHash) throw new Error('email_template_hash_changed')
  const published = await client.query<{ template_id: string; version_id: string }>(
    `WITH source AS (SELECT * FROM public.email_templates WHERE id = $1 FOR UPDATE),
      next AS (SELECT COALESCE(MAX(version_number),0)+1 AS number FROM public.email_template_versions WHERE template_id = $1),
      version AS (INSERT INTO public.email_template_versions (template_id, version_number, subject, preheader, body_html, body_text,
        variables_schema, required_variables, change_summary, published_by, content_hash)
        SELECT source.id, next.number, source.subject, source.preheader, source.body_html, source.body_text, source.variables_schema,
          source.required_variables, 'Published by Mission', $2, source.content_hash FROM source,next RETURNING id, template_id)
     UPDATE public.email_templates template SET status='published', published_version_id=version.id, updated_by=$2, updated_at=NOW()
       FROM version WHERE template.id=version.template_id RETURNING template.id AS template_id, version.id AS version_id`, [input.templateId, context.actorId])
  const row = published.rows[0]; if (!row) throw new Error('email_template_publish_failed')
  const result = { entityId: row.template_id, versionId: row.version_id, status: 'published' as const, contentHash: input.expectedContentHash, evidence: { activated: true } }
  await recordDomainEvent(client as never, { eventType: 'mission.email_template_published', organizationId: context.organizationId, aggregateType: 'mission', aggregateId: context.missionId, actor: { type: 'user', id: context.actorId }, payload: { missionId: context.missionId, actionRunId: context.actionRunId, templateId: row.template_id, versionId: row.version_id, contentHash: input.expectedContentHash } })
  return saveMissionCommandResult(client, context, commandKey, result)
}

function requiredId(value?: string) { if (!value) throw new Error('mission_command_persistence_failed'); return value }
