import { z } from 'zod'
import type { CapabilityDefinition } from '../capability-registry.js'

const segmentInput = z.object({
  candidateIds: z.array(z.string().uuid()).max(500),
  canarySize: z.number().int().min(1).max(20).default(20),
})
const segmentOutput = z.object({ canaryIds: z.array(z.string().uuid()), remainderIds: z.array(z.string().uuid()), total: z.number().int() })

export const growthSegmentPreview: CapabilityDefinition<z.infer<typeof segmentInput>, z.infer<typeof segmentOutput>> = {
  key: 'growth.segment.preview', version: 1, title: 'Prévia de segmento',
  description: 'Divide deterministicamente candidatos entre canário e restante, sem mutation.',
  risk: 'read_only', effect: 'none', approval: 'never', idempotency: 'none', inputSchema: segmentInput, outputSchema: segmentOutput,
  requiredModules: ['crm'], requiredConnections: [],
  async execute(_context, input) {
    const ordered = [...new Set(input.candidateIds)].sort()
    return { output: { canaryIds: ordered.slice(0, input.canarySize), remainderIds: ordered.slice(input.canarySize), total: ordered.length }, effectProduced: false }
  },
}
