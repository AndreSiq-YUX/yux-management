import { z } from 'zod'
import { noEffectRecovery, type CapabilityDefinition } from '../capability-registry.js'

const pipelineSnapshotInput = z.object({ crmInstanceId: z.string().uuid().optional() })
const pipelineSnapshotOutput = z.object({
  pipelines: z.array(z.object({ id: z.string().uuid(), name: z.string(), stages: z.array(z.object({ id: z.string().uuid(), name: z.string(), position: z.number() })) })),
})

export const crmPipelineSnapshot: CapabilityDefinition<z.infer<typeof pipelineSnapshotInput>, z.infer<typeof pipelineSnapshotOutput>> = {
  key: 'crm.pipeline.snapshot', version: 1, title: 'Snapshot do pipeline',
  description: 'Lê pipelines e estágios do CRM sem produzir efeitos.', risk: 'read_only', effect: 'none',
  approval: 'never', idempotency: 'none', inputSchema: pipelineSnapshotInput, outputSchema: pipelineSnapshotOutput,
  requiredModules: ['crm'], requiredConnections: [],
  recovery: noEffectRecovery(),
  async execute(context, input) {
    const result = await context.query<{ pipeline_id: string; pipeline_name: string; stage_id: string; stage_name: string; position: number }>(
      `SELECT pipeline.id AS pipeline_id, pipeline.name AS pipeline_name,
              stage.id AS stage_id, stage.name AS stage_name, stage.position
       FROM public.crm_pipelines pipeline
       JOIN public.crm_pipeline_stages stage ON stage.pipeline_id = pipeline.id
       WHERE pipeline.organization_id = $1 AND pipeline.is_active = TRUE
         AND ($2::UUID IS NULL OR pipeline.crm_instance_id = $2)
       ORDER BY pipeline.name, stage.position`,
      [context.organizationId, input.crmInstanceId ?? null],
    )
    const grouped = new Map<string, { id: string; name: string; stages: Array<{ id: string; name: string; position: number }> }>()
    for (const row of result.rows) {
      const pipeline = grouped.get(row.pipeline_id) ?? { id: row.pipeline_id, name: row.pipeline_name, stages: [] }
      pipeline.stages.push({ id: row.stage_id, name: row.stage_name, position: Number(row.position) })
      grouped.set(row.pipeline_id, pipeline)
    }
    return { output: { pipelines: [...grouped.values()] }, effectProduced: false }
  },
}

const candidateInput = z.object({
  inactiveDays: z.number().int().min(1).max(3650),
  pipelineIds: z.array(z.string().uuid()).max(50).default([]),
  stageIds: z.array(z.string().uuid()).max(100).default([]),
  excludeLeadIds: z.array(z.string().uuid()).max(1000).default([]),
  limit: z.number().int().min(1).max(500).default(100),
})
const candidateOutput = z.object({
  candidates: z.array(z.object({ id: z.string().uuid(), name: z.string(), company: z.string().nullable(), valueBrl: z.string().nullable(), stageId: z.string().uuid().nullable(), lastActivityAt: z.string().nullable() })),
})

export const crmRecoveryCandidatesSearch: CapabilityDefinition<z.infer<typeof candidateInput>, z.infer<typeof candidateOutput>> = {
  key: 'crm.recovery_candidates.search', version: 1, title: 'Buscar oportunidades de recuperação',
  description: 'Busca leads inativos elegíveis usando filtros e exclusões explícitas.', risk: 'read_only', effect: 'none',
  approval: 'never', idempotency: 'none', inputSchema: candidateInput, outputSchema: candidateOutput,
  requiredModules: ['crm'], requiredConnections: [],
  recovery: noEffectRecovery(),
  async execute(context, input) {
    const result = await context.query<{ id: string; name: string; company: string | null; value: string | null; stage_id: string | null; last_activity_at: string | Date | null }>(
      `SELECT lead.id, lead.name, lead.company, lead.value::TEXT, lead.stage_id, lead.last_activity_at
       FROM public.leads lead
       WHERE lead.organization_id = $1
         AND COALESCE(lead.last_activity_at, lead.updated_at, lead.created_at) <= NOW() - ($2::INT * INTERVAL '1 day')
         AND (cardinality($3::UUID[]) = 0 OR lead.pipeline_id = ANY($3::UUID[]))
         AND (cardinality($4::UUID[]) = 0 OR lead.stage_id = ANY($4::UUID[]))
         AND NOT (lead.id = ANY($5::UUID[]))
       ORDER BY COALESCE(lead.value, 0) DESC, lead.updated_at ASC LIMIT $6`,
      [context.organizationId, input.inactiveDays, input.pipelineIds, input.stageIds, input.excludeLeadIds, input.limit],
    )
    return {
      output: { candidates: result.rows.map((row) => ({
        id: row.id, name: row.name, company: row.company, valueBrl: row.value,
        stageId: row.stage_id,
        lastActivityAt: row.last_activity_at ? new Date(row.last_activity_at).toISOString() : null,
      })) },
      effectProduced: false,
      sourceRecords: result.rows.map((row) => ({ type: 'lead', id: row.id })),
    }
  },
}

const timelineInput = z.object({ leadId: z.string().uuid(), limit: z.number().int().min(1).max(200).default(50) })
const timelineOutput = z.object({ events: z.array(z.object({ id: z.string(), type: z.string(), occurredAt: z.string(), summary: z.string() })) })

export const crmLeadTimelineRead: CapabilityDefinition<z.infer<typeof timelineInput>, z.infer<typeof timelineOutput>> = {
  key: 'crm.lead.timeline.read', version: 1, title: 'Ler timeline do lead', description: 'Lê interações e eventos recentes do lead.',
  risk: 'read_only', effect: 'none', approval: 'never', idempotency: 'none', inputSchema: timelineInput, outputSchema: timelineOutput,
  requiredModules: ['crm'], requiredConnections: [],
  recovery: noEffectRecovery(),
  async execute(context, input) {
    const result = await context.query<{ id: string; event_type: string; occurred_at: string | Date; summary: string }>(
      `SELECT event.id::TEXT AS id, event.event_type, event.occurred_at,
              COALESCE(event.payload->>'title', event.payload->>'status', event.event_type) AS summary
       FROM public.domain_events event
       WHERE event.organization_id = $1 AND event.lead_id = $2
       ORDER BY event.occurred_at DESC LIMIT $3`,
      [context.organizationId, input.leadId, input.limit],
    )
    return { output: { events: result.rows.map((row) => ({ id: row.id, type: row.event_type, occurredAt: new Date(row.occurred_at).toISOString(), summary: row.summary })) }, effectProduced: false }
  },
}

const taskInput = z.object({ leadId: z.string().uuid(), title: z.string().min(1).max(200), description: z.string().max(5000).optional(), dueAt: z.string().datetime(), assignedTo: z.string().uuid().optional(), priority: z.enum(['low','medium','high','urgent']).default('medium') })
const taskOutput = z.object({ preview: z.boolean(), taskId: z.string().uuid().optional() })

export const crmTaskCreate: CapabilityDefinition<z.infer<typeof taskInput>, z.infer<typeof taskOutput>> = {
  key: 'crm.task.create', version: 1, title: 'Criar tarefa no CRM', description: 'Cria uma tarefa interna pelo command de domínio do CRM.',
  risk: 'low', effect: 'internal', approval: 'risk_based', idempotency: 'required', inputSchema: taskInput, outputSchema: taskOutput,
  requiredModules: ['crm'], requiredConnections: [],
  recovery: {
    kind: 'compensatable',
    async compensate(context, result) {
      if (!result.taskId) return { output: { recovered: true, reason: 'preview_only' }, effectProduced: false }
      if (!context.commands?.cancelTask) throw new Error('capability_recovery_command_unavailable')
      await context.commands.cancelTask({ taskId: result.taskId, organizationId: context.organizationId, missionId: context.missionId })
      return { output: { recovered: true, taskId: result.taskId }, effectProduced: true, sourceRecords: [{ type: 'task', id: result.taskId }] }
    },
  },
  async execute(context, input) {
    if (context.dryRun) return { output: { preview: true }, effectProduced: false }
    if (!context.commands?.createTask) throw new Error('capability_command_unavailable')
    const result = await context.commands.createTask({ ...input, organizationId: context.organizationId, idempotencyKey: context.idempotencyKey }) as { id?: string }
    if (!result.id) throw new Error('capability_command_result_invalid')
    return { output: { preview: false, taskId: result.id }, effectProduced: true, sourceRecords: [{ type: 'task', id: result.id }] }
  },
}

const assignInput = z.object({ leadId: z.string().uuid(), ownerId: z.string().uuid() })
const assignOutput = z.object({ preview: z.boolean(), leadId: z.string().uuid(), ownerId: z.string().uuid() })

export const crmLeadAssignOwner: CapabilityDefinition<z.infer<typeof assignInput>, z.infer<typeof assignOutput>> = {
  key: 'crm.lead.assign_owner', version: 1, title: 'Atribuir responsável', description: 'Atribui um responsável usando o command do CRM.',
  risk: 'low', effect: 'internal', approval: 'risk_based', idempotency: 'required', inputSchema: assignInput, outputSchema: assignOutput,
  requiredModules: ['crm'], requiredConnections: [],
  recovery: { kind: 'irreversible', incidentType: 'lead_owner_assignment_requires_manual_review' },
  async execute(context, input) {
    if (!context.dryRun) {
      if (!context.commands?.assignLeadOwner) throw new Error('capability_command_unavailable')
      await context.commands.assignLeadOwner({ ...input, organizationId: context.organizationId, idempotencyKey: context.idempotencyKey })
    }
    return { output: { preview: context.dryRun, ...input }, effectProduced: !context.dryRun, sourceRecords: [{ type: 'lead', id: input.leadId }] }
  },
}
