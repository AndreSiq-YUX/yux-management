import { z } from 'zod'
import { noEffectRecovery, type CapabilityDefinition } from '../capability-registry.js'

const inputSchema = z.object({ since: z.string().datetime(), leadIds: z.array(z.string().uuid()).max(500).default([]) })
const outputSchema = z.object({ valueKind: z.enum(['known', 'unknown']), recoveredRevenueBrl: z.string().optional(), reason: z.string().optional(), sourceIds: z.array(z.string()) })

export const reportsRecoveredRevenueSnapshot: CapabilityDefinition<z.infer<typeof inputSchema>, z.infer<typeof outputSchema>> = {
  key: 'reports.recovered_revenue.snapshot', version: 1, title: 'Snapshot de receita recuperada',
  description: 'Soma receita ganha atribuível a leads do escopo preservando unknown quando não há fonte confiável.',
  risk: 'read_only', effect: 'none', approval: 'never', idempotency: 'none', inputSchema, outputSchema,
  requiredModules: ['crm'], requiredConnections: [],
  recovery: noEffectRecovery(),
  async execute(context, input) {
    if (input.leadIds.length === 0) {
      return { output: { valueKind: 'unknown', reason: 'recovery_population_not_available', sourceIds: [] }, effectProduced: false }
    }
    const result = await context.query<{ total: string | null; ids: string[] | null }>(
      `SELECT SUM(COALESCE(lead.value, 0))::TEXT AS total, ARRAY_AGG(lead.id::TEXT) AS ids
       FROM public.leads lead
       WHERE lead.organization_id = $1 AND lead.id = ANY($2::UUID[])
         AND lead.stage = 'WON' AND lead.updated_at >= $3`,
      [context.organizationId, input.leadIds, input.since],
    )
    const row = result.rows[0]
    return { output: { valueKind: 'known', recoveredRevenueBrl: row?.total ?? '0', sourceIds: row?.ids ?? [] }, effectProduced: false,
      sourceRecords: (row?.ids ?? []).map((id) => ({ type: 'lead', id })) }
  },
}
