import { z } from 'zod'
import type { CapabilityDefinition } from '../capability-registry.js'

const inputSchema = z.object({
  flowId: z.string().uuid(), publishedVersionId: z.string().uuid(), entityIds: z.array(z.string().uuid()).min(1).max(500),
  ownershipMode: z.enum(['observe','shared','exclusive']), allowedActionKeys: z.array(z.string().min(1)).max(100),
  timeoutSeconds: z.number().int().min(1).max(86400),
})
const outputSchema = z.object({ preview: z.boolean(), subprocessRunId: z.string().uuid().optional(), publishedVersionId: z.string().uuid() })

export const automationFlowExecute: CapabilityDefinition<z.infer<typeof inputSchema>, z.infer<typeof outputSchema>> = {
  key: 'automation.flow.execute', version: 1, title: 'Executar automação como subprocesso',
  description: 'Executa uma versão publicada e congelada sob ownership e correlation da missão.',
  risk: 'high', effect: 'external', approval: 'always', idempotency: 'required', inputSchema, outputSchema,
  requiredModules: ['automations'], requiredConnections: [],
  recovery: {
    kind: 'pausable',
    async contain(context, result) {
      if (!result.subprocessRunId) return { output: { contained: true, reason: 'preview_only' }, effectProduced: false }
      if (!context.commands?.pauseAutomation) throw new Error('capability_recovery_command_unavailable')
      await context.commands.pauseAutomation({ subprocessRunId: result.subprocessRunId, organizationId: context.organizationId, missionId: context.missionId })
      return { output: { contained: true, subprocessRunId: result.subprocessRunId }, effectProduced: true, sourceRecords: [{ type: 'automation_run', id: result.subprocessRunId }] }
    },
  },
  async execute(context, input) {
    if (context.dryRun) return { output: { preview: true, publishedVersionId: input.publishedVersionId }, effectProduced: false }
    if (!context.commands?.executeAutomation) throw new Error('capability_command_unavailable')
    const result = await context.commands.executeAutomation({ ...input, organizationId: context.organizationId, missionId: context.missionId, idempotencyKey: context.idempotencyKey }) as { id?: string }
    if (!result.id) throw new Error('capability_command_result_invalid')
    return { output: { preview: false, subprocessRunId: result.id, publishedVersionId: input.publishedVersionId }, effectProduced: true,
      sourceRecords: [{ type: 'automation_run', id: result.id }] }
  },
}
