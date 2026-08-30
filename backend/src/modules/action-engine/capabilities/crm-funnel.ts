import { z } from 'zod'
import { missionArtifactHash } from '../mission-command.js'
import { validateFunnelDraft } from '../../crm/mission-commands.js'
import type { CapabilityDefinition } from '../capability-registry.js'

const stageInput = z.object({
  key: z.string().regex(/^[a-z0-9_]+$/),
  name: z.string().trim().min(1).max(120),
  color: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
  exitCriteria: z.array(z.string().trim().min(1).max(500)).max(20),
  isWon: z.boolean(),
  isLost: z.boolean(),
}).refine((stage) => !(stage.isWon && stage.isLost), { message: 'stage_cannot_be_won_and_lost' })

const funnelDraftInput = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).optional(),
  stages: z.array(stageInput).min(2).max(20),
}).superRefine((value, issue) => {
  if (new Set(value.stages.map((stage) => stage.key)).size !== value.stages.length) {
    issue.addIssue({ code: 'custom', message: 'pipeline_stage_key_duplicate', path: ['stages'] })
  }
  if (value.stages.filter((stage) => stage.isWon).length > 1 || value.stages.filter((stage) => stage.isLost).length > 1) {
    issue.addIssue({ code: 'custom', message: 'pipeline_stage_outcome_duplicate', path: ['stages'] })
  }
})

const artifactStage = z.object({
  key: z.string(), name: z.string(), color: z.string().optional(), exitCriteria: z.array(z.string()),
  isWon: z.boolean(), isLost: z.boolean(),
})

const simulationOutput = z.object({
  preview: z.literal(true), contentHash: z.string().regex(/^[a-f0-9]{64}$/), stageCount: z.number().int(),
  activated: z.literal(false), stages: z.array(artifactStage),
})

const draftOutput = z.object({
  preview: z.boolean(), versionId: z.string().uuid().optional(), contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  status: z.literal('draft').optional(), stageCount: z.number().int(), activated: z.literal(false),
})

const publishInput = z.object({ versionId: z.string().uuid(), expectedContentHash: z.string().regex(/^[a-f0-9]{64}$/) })
const publishOutput = z.object({
  preview: z.boolean(), pipelineId: z.string().uuid().optional(), versionId: z.string().uuid(),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/), status: z.literal('published').optional(),
  stageCount: z.number().int().optional(), activated: z.boolean(),
})

const inspectInput = z.object({ crmInstanceId: z.string().uuid().optional() })
const inspectOutput = z.object({
  pipelines: z.array(z.object({
    id: z.string().uuid(), name: z.string(), description: z.string().nullable(),
    stages: z.array(z.object({
      id: z.string().uuid(), key: z.string(), name: z.string(), position: z.number().int(),
      isWon: z.boolean(), isLost: z.boolean(),
    })),
  })),
})

type CommandResult = {
  entityId: string; versionId: string; status: 'draft' | 'published'; contentHash: string;
  evidence: { stageCount?: number; activated?: boolean }
}

export const crmPipelineInspect: CapabilityDefinition<z.infer<typeof inspectInput>, z.infer<typeof inspectOutput>> = {
  key: 'crm.pipeline.inspect', version: 1, title: 'Inspecionar funis do CRM',
  description: 'Lê funis ativos e seus estágios ordenados sem produzir efeitos.',
  risk: 'read_only', effect: 'none', approval: 'never', idempotency: 'none',
  inputSchema: inspectInput, outputSchema: inspectOutput, requiredModules: ['crm'], requiredConnections: [],
  domain: 'crm', requiredPermissions: ['crm.read'], supportsModes: ['shadow', 'prepare', 'assisted', 'autonomous'],
  readiness: async () => ({ ready: true, blockers: [] }),
  recovery: { kind: 'compensatable', async compensate() { return { output: { recovered: true, effect: 'none' }, effectProduced: false } } },
  async execute(context, input) {
    const rows = await context.query<{
      pipeline_id: string; pipeline_name: string; pipeline_description: string | null; stage_id: string;
      stage_key: string; stage_name: string; order_index: number; is_won: boolean; is_lost: boolean
    }>(
      `SELECT pipeline.id AS pipeline_id, pipeline.name AS pipeline_name, pipeline.description AS pipeline_description,
              stage.id AS stage_id, stage.key AS stage_key, stage.name AS stage_name,
              stage.order_index, stage.is_won, stage.is_lost
         FROM public.crm_pipelines pipeline
         JOIN public.crm_pipeline_stages stage ON stage.pipeline_id = pipeline.id AND stage.is_active = TRUE
        WHERE pipeline.organization_id = $1 AND pipeline.is_active = TRUE
          AND ($2::UUID IS NULL OR pipeline.crm_instance_id = $2)
        ORDER BY pipeline.name, stage.order_index, stage.id`,
      [context.organizationId, input.crmInstanceId ?? null],
    )
    const grouped = new Map<string, z.infer<typeof inspectOutput>['pipelines'][number]>()
    for (const row of rows.rows) {
      const pipeline = grouped.get(row.pipeline_id) ?? { id: row.pipeline_id, name: row.pipeline_name, description: row.pipeline_description, stages: [] }
      pipeline.stages.push({ id: row.stage_id, key: row.stage_key, name: row.stage_name, position: Number(row.order_index), isWon: row.is_won, isLost: row.is_lost })
      grouped.set(row.pipeline_id, pipeline)
    }
    return { output: { pipelines: [...grouped.values()] }, effectProduced: false, sourceRecords: [...grouped.keys()].map((id) => ({ type: 'crm_pipeline', id })) }
  },
}

export const crmPipelineSimulate: CapabilityDefinition<z.infer<typeof funnelDraftInput>, z.infer<typeof simulationOutput>> = {
  key: 'crm.pipeline.simulate', version: 1, title: 'Simular criação de funil',
  description: 'Valida e resume o funil proposto sem persistir dados.',
  risk: 'read_only', effect: 'none', approval: 'never', idempotency: 'none',
  inputSchema: funnelDraftInput, outputSchema: simulationOutput, requiredModules: ['crm'], requiredConnections: [],
  domain: 'crm', requiredPermissions: ['crm.read'], supportsModes: ['shadow', 'prepare', 'assisted', 'autonomous'],
  readiness: async () => ({ ready: true, blockers: [] }),
  recovery: { kind: 'compensatable', async compensate() { return { output: { recovered: true, effect: 'none' }, effectProduced: false } } },
  async execute(_context, input) {
    const artifact = validateFunnelDraft(input)
    return { output: { preview: true, contentHash: missionArtifactHash(artifact), stageCount: artifact.stages.length, activated: false, stages: artifact.stages }, effectProduced: false }
  },
}

export const crmPipelineCreateDraft: CapabilityDefinition<z.infer<typeof funnelDraftInput>, z.infer<typeof draftOutput>> = {
  key: 'crm.pipeline.create_draft', version: 1, title: 'Criar rascunho de funil',
  description: 'Cria uma versão imutável do funil sem ativá-la no CRM.',
  risk: 'low', effect: 'draft', approval: 'never', idempotency: 'required',
  inputSchema: funnelDraftInput, outputSchema: draftOutput, requiredModules: ['crm'], requiredConnections: [],
  domain: 'crm', requiredPermissions: ['crm.write'], supportsModes: ['shadow', 'prepare', 'assisted', 'autonomous'],
  readiness: async () => ({ ready: true, blockers: [] }),
  recovery: {
    kind: 'compensatable',
    async compensate(context, result) {
      if (!result.versionId) return { output: { recovered: true, reason: 'preview_only' }, effectProduced: false }
      if (!context.commands?.discardPipelineDraft) throw new Error('capability_recovery_command_unavailable')
      await context.commands.discardPipelineDraft(commandContext(context, { versionId: result.versionId }))
      return { output: { recovered: true, versionId: result.versionId }, effectProduced: true, sourceRecords: [{ type: 'crm_pipeline_version', id: result.versionId }] }
    },
  },
  async execute(context, input) {
    const artifact = validateFunnelDraft(input)
    const hash = missionArtifactHash(artifact)
    if (context.dryRun) return { output: { preview: true, contentHash: hash, stageCount: artifact.stages.length, activated: false }, effectProduced: false }
    if (!context.commands?.createPipelineDraft) throw new Error('capability_command_unavailable')
    const result = await context.commands.createPipelineDraft(commandContext(context, artifact)) as CommandResult
    return {
      output: { preview: false, versionId: result.versionId, contentHash: result.contentHash, status: 'draft', stageCount: Number(result.evidence.stageCount ?? artifact.stages.length), activated: false },
      effectProduced: true, sourceRecords: [{ type: 'crm_pipeline_version', id: result.versionId }],
    }
  },
}

export const crmPipelinePublish: CapabilityDefinition<z.infer<typeof publishInput>, z.infer<typeof publishOutput>> = {
  key: 'crm.pipeline.publish', version: 1, title: 'Publicar funil no CRM',
  description: 'Publica somente a versão e o hash exatos aprovados, ativando o novo funil.',
  risk: 'medium', effect: 'internal', approval: 'always', idempotency: 'required',
  inputSchema: publishInput, outputSchema: publishOutput, requiredModules: ['crm'], requiredConnections: [],
  domain: 'crm', requiredPermissions: ['crm.write'], supportsModes: ['prepare', 'assisted', 'autonomous'],
  readiness: async () => ({ ready: true, blockers: [] }),
  recovery: {
    kind: 'compensatable',
    async compensate(context, result) {
      if (!result.pipelineId) return { output: { recovered: true, reason: 'preview_only' }, effectProduced: false }
      if (!context.commands?.archivePipeline) throw new Error('capability_recovery_command_unavailable')
      await context.commands.archivePipeline(commandContext(context, { pipelineId: result.pipelineId }))
      return { output: { recovered: true, pipelineId: result.pipelineId }, effectProduced: true, sourceRecords: [{ type: 'crm_pipeline', id: result.pipelineId }] }
    },
  },
  async execute(context, input) {
    if (context.dryRun) return { output: { preview: true, versionId: input.versionId, contentHash: input.expectedContentHash, activated: false }, effectProduced: false }
    if (!context.commands?.publishPipelineDraft) throw new Error('capability_command_unavailable')
    const result = await context.commands.publishPipelineDraft(commandContext(context, input)) as CommandResult
    return {
      output: { preview: false, pipelineId: result.entityId, versionId: result.versionId, contentHash: result.contentHash, status: 'published', stageCount: result.evidence.stageCount, activated: true },
      effectProduced: true, sourceRecords: [{ type: 'crm_pipeline', id: result.entityId }, { type: 'crm_pipeline_version', id: result.versionId }],
    }
  },
}

function commandContext(context: Parameters<CapabilityDefinition['execute']>[0], input: Record<string, unknown>) {
  const actorId = context.actor.id
  if (!context.actionRunId) throw new Error('capability_action_run_required')
  if (!actorId) throw new Error('capability_actor_required')
  return { ...input, organizationId: context.organizationId, missionId: context.missionId, actionRunId: context.actionRunId, actorId, idempotencyKey: context.idempotencyKey }
}
