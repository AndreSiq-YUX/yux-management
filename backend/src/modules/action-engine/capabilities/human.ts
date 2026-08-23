import { z } from 'zod'
import type { CapabilityDefinition } from '../capability-registry.js'

const inputSchema = z.object({ title: z.string().min(1).max(200), description: z.string().max(5000), dueAt: z.string().datetime(), assignedTo: z.string().uuid().optional(), leadId: z.string().uuid().optional() })
const outputSchema = z.object({ preview: z.boolean(), taskId: z.string().uuid().optional() })

export const humanTaskCreate: CapabilityDefinition<z.infer<typeof inputSchema>, z.infer<typeof outputSchema>> = {
  key: 'human.task.create', version: 1, title: 'Criar intervenção humana',
  description: 'Cria uma tarefa rastreável e posteriormente mede os minutos humanos reais.',
  risk: 'low', effect: 'internal', approval: 'risk_based', idempotency: 'required', inputSchema, outputSchema,
  requiredModules: ['crm'], requiredConnections: [],
  recovery: {
    kind: 'compensatable',
    async compensate(context, result) {
      if (!result.taskId) return { output: { recovered: true, reason: 'preview_only' }, effectProduced: false }
      const updated = await context.query<{ id: string }>(
        `UPDATE public.action_observations
         SET payload = payload || '{"status":"cancelled"}'::jsonb
         WHERE id = $1 AND organization_id = $2 AND mission_id = $3
           AND observation_type = 'human_task_created' RETURNING id`,
        [result.taskId, context.organizationId, context.missionId],
      )
      if (!updated.rows[0]) throw new Error('human_task_recovery_target_not_found')
      return { output: { recovered: true, taskId: result.taskId }, effectProduced: true, sourceRecords: [{ type: 'human_task', id: result.taskId }] }
    },
  },
  async execute(context, input) {
    if (context.dryRun) return { output: { preview: true }, effectProduced: false }
    const result = await context.query<{ id: string }>(
      `INSERT INTO public.action_observations (
         organization_id, mission_id, observation_type, idempotency_key, source_type, source_record_id, payload
       ) VALUES ($1,$2,'human_task_created',$3,'mission',$2,$4)
       ON CONFLICT (idempotency_key) DO UPDATE SET idempotency_key = EXCLUDED.idempotency_key
       RETURNING id`,
      [context.organizationId, context.missionId, context.idempotencyKey, { ...input, status: 'open' }],
    )
    const taskId = result.rows[0]?.id
    if (!taskId) throw new Error('human_task_not_created')
    return { output: { preview: false, taskId }, effectProduced: true, sourceRecords: [{ type: 'human_task', id: taskId }] }
  },
}
