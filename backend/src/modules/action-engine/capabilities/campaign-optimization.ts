import { z } from 'zod'
import { missionArtifactHash } from '../mission-command.js'
import { noEffectRecovery, type CapabilityContext, type CapabilityDefinition } from '../capability-registry.js'

const uuid = z.string().uuid()
const hash = z.string().regex(/^[a-f0-9]{64}$/)
const decimal = z.string().regex(/^\d+(\.\d{1,6})?$/)

export type CampaignOptimizationDecision = {
  conclusion: 'observe' | 'continue' | 'pause' | 'decrease_budget' | 'increase_budget' | 'creative_draft'
  reason: string
  requiresApproval: boolean
  nextDailyBudgetBrl?: string
  adjustmentPercent?: string
  cplBrl?: string
  ctr?: string
}

export function decideCampaignOptimization(input: {
  trackingKnown: boolean
  impressions: number
  clicks: number
  leads: number
  spendBrl: string
  currentDailyBudgetBrl: string
  minimumImpressions: number
  minimumClicks: number
  minimumLeadsForScale: number
  minimumCtr: string
  targetCplBrl: string
  maximumCplBrl: string
  maxBudgetAdjustmentPercent: string
}): CampaignOptimizationDecision {
  if (!input.trackingKnown) return { conclusion: 'pause', reason: 'campaign_tracking_lost', requiresApproval: false }
  if (input.impressions < input.minimumImpressions) {
    return { conclusion: 'observe', reason: 'campaign_sample_insufficient', requiresApproval: false }
  }
  const ctr = input.impressions === 0 ? 0 : input.clicks / input.impressions
  const cpl = input.leads === 0 ? null : Number(input.spendBrl) / input.leads
  if (input.clicks >= input.minimumClicks && ctr < Number(input.minimumCtr)) {
    return { conclusion: 'creative_draft', reason: 'campaign_ctr_below_guardrail', requiresApproval: false, ctr: fixed(ctr, 6), ...(cpl === null ? {} : { cplBrl: fixed(cpl, 2) }) }
  }
  if (cpl !== null && cpl > Number(input.maximumCplBrl)) {
    const adjustment = boundedAdjustment(input.maxBudgetAdjustmentPercent)
    return {
      conclusion: 'decrease_budget', reason: 'campaign_cpl_above_maximum', requiresApproval: false,
      cplBrl: fixed(cpl, 2), ctr: fixed(ctr, 6), adjustmentPercent: fixed(adjustment, 2),
      nextDailyBudgetBrl: adjustedBudget(input.currentDailyBudgetBrl, -adjustment),
    }
  }
  if (cpl !== null && input.leads >= input.minimumLeadsForScale && cpl <= Number(input.targetCplBrl)) {
    const adjustment = boundedAdjustment(input.maxBudgetAdjustmentPercent)
    return {
      conclusion: 'increase_budget', reason: 'campaign_cpl_supports_scale', requiresApproval: true,
      cplBrl: fixed(cpl, 2), ctr: fixed(ctr, 6), adjustmentPercent: fixed(adjustment, 2),
      nextDailyBudgetBrl: adjustedBudget(input.currentDailyBudgetBrl, adjustment),
    }
  }
  return {
    conclusion: 'continue', reason: cpl === null ? 'campaign_no_conversions_continue_observing' : 'campaign_within_guardrails',
    requiresApproval: false, ...(cpl === null ? {} : { cplBrl: fixed(cpl, 2) }), ctr: fixed(ctr, 6),
  }
}

export function validateBoundedBudgetChange(input: {
  currentDailyBudgetBrl: string
  nextDailyBudgetBrl: string
  maxAdjustmentPercent: string
  direction: 'decrease' | 'increase'
}) {
  const current = Number(input.currentDailyBudgetBrl)
  const next = Number(input.nextDailyBudgetBrl)
  const maximum = Number(input.maxAdjustmentPercent)
  if (!Number.isFinite(current) || current <= 0 || !Number.isFinite(next) || next <= 0 || !Number.isFinite(maximum) || maximum <= 0 || maximum > 20) {
    throw new Error('campaign_budget_adjustment_invalid')
  }
  if (input.direction === 'decrease' ? next >= current : next <= current) throw new Error('campaign_budget_adjustment_direction_invalid')
  const percent = Math.abs(next - current) / current * 100
  if (percent > maximum + 0.000001) throw new Error('campaign_budget_adjustment_exceeds_ceiling')
  return { currentDailyBudgetBrl: fixed(current, 2), nextDailyBudgetBrl: fixed(next, 2), adjustmentPercent: fixed(percent, 4) }
}

const evaluationInput = z.object({
  campaignId: uuid, trackingKnown: z.boolean(), impressions: z.number().int().nonnegative(),
  clicks: z.number().int().nonnegative(), leads: z.number().int().nonnegative(), spendBrl: decimal,
  currentDailyBudgetBrl: decimal, minimumImpressions: z.number().int().positive(), minimumClicks: z.number().int().positive(),
  minimumLeadsForScale: z.number().int().positive(), minimumCtr: decimal, targetCplBrl: decimal,
  maximumCplBrl: decimal, maxBudgetAdjustmentPercent: decimal,
})
const decisionOutput = z.object({
  conclusion: z.enum(['observe', 'continue', 'pause', 'decrease_budget', 'increase_budget', 'creative_draft']),
  reason: z.string(), requiresApproval: z.boolean(), nextDailyBudgetBrl: decimal.optional(),
  adjustmentPercent: decimal.optional(), cplBrl: decimal.optional(), ctr: decimal.optional(),
})

const readCommon = {
  requiredModules: ['campaigns', 'campaign_optimization_agent'], requiredConnections: [] as string[], domain: 'campaigns',
  requiredPermissions: ['campaign.read'], supportsModes: ['shadow', 'prepare', 'assisted', 'autonomous'] as const,
  readiness: async () => ({ ready: true, blockers: [] }),
}
const mutationCommon = {
  requiredModules: ['campaigns', 'campaign_launch_agent', 'campaign_optimization_agent'], requiredConnections: ['ads_provider'], domain: 'campaigns',
  requiredPermissions: ['campaign.write'], supportsModes: ['assisted', 'autonomous'] as const,
  readiness: async () => ({ ready: true, blockers: [] }),
}

export const campaignOptimizationEvaluate: CapabilityDefinition = {
  key: 'campaign.optimization.evaluate', version: 1, title: 'Avaliar guardrails de campanha',
  description: 'Decide deterministicamente observar, pausar, ajustar orçamento ou criar novo rascunho.',
  risk: 'read_only', effect: 'none', approval: 'never', idempotency: 'none',
  inputSchema: evaluationInput, outputSchema: decisionOutput, ...readCommon, recovery: noEffectRecovery(),
  async execute(_context, raw) {
    return { output: decideCampaignOptimization(raw as z.infer<typeof evaluationInput>), effectProduced: false }
  },
}

const budgetInput = z.object({
  versionId: uuid, expectedContentHash: hash, approvedSubjectHash: hash,
  currentDailyBudgetBrl: decimal, nextDailyBudgetBrl: decimal, maxAdjustmentPercent: decimal,
  providerBudgetResourceId: z.string().trim().min(1).max(500).optional(),
})
const budgetOutput = z.object({
  entityId: uuid, versionId: uuid, contentHash: hash, status: z.string(), providerReference: z.string(),
  mutationRunId: uuid, currentDailyBudgetBrl: decimal, nextDailyBudgetBrl: decimal, adjustmentPercent: decimal,
})

function budgetCapability(direction: 'decrease' | 'increase'): CapabilityDefinition {
  return {
    key: direction === 'decrease' ? 'campaign.budget.decrease_bounded' : 'campaign.budget.increase', version: 1,
    title: direction === 'decrease' ? 'Reduzir orçamento dentro do limite' : 'Aumentar orçamento com aprovação',
    description: 'Altera somente o orçamento diário da campanha exata, respeitando teto percentual e idempotência.',
    risk: 'high', effect: 'external', approval: direction === 'increase' ? 'always' : 'risk_based', idempotency: 'required',
    inputSchema: budgetInput, outputSchema: budgetOutput, ...mutationCommon,
    recovery: { kind: 'pausable', async contain(context, result) {
      const command = context.commands?.pauseProviderCampaign
      if (!command) throw new Error('capability_command_unavailable')
      const output = result as { versionId: string; contentHash: string }
      await command(commandContext(context, { versionId: output.versionId, expectedContentHash: output.contentHash, approvedSubjectHash: output.contentHash }))
      return { output: { contained: true }, effectProduced: true }
    } },
    async execute(context, raw) {
      const input = raw as z.infer<typeof budgetInput>
      const bounded = validateBoundedBudgetChange({ ...input, direction })
      if (context.dryRun) throw new Error('campaign_budget_mutation_dry_run_unsupported')
      const command = context.commands?.adjustCampaignBudget
      if (!command) throw new Error('capability_command_unavailable')
      const result = await command(commandContext(context, { ...input, ...bounded, direction })) as Record<string, unknown>
      return { output: { ...result, ...bounded }, effectProduced: true, sourceRecords: [{ type: 'provider_campaign', id: String(result.providerReference) }], costHints: [{ category: 'media', amount: '0', currency: 'BRL' }] }
    },
  }
}

export const campaignBudgetDecreaseBounded = budgetCapability('decrease')
export const campaignBudgetIncrease = budgetCapability('increase')

const creative = z.object({
  format: z.enum(['image', 'video', 'carousel', 'text']), headline: z.string().trim().min(1).max(240),
  body: z.string().trim().min(1).max(5000), sourceIds: z.array(z.string().min(1)).min(1).max(100),
})
const creativeOutput = z.object({ preview: z.boolean(), entityId: uuid.optional(), versionId: uuid.optional(), contentHash: hash, status: z.literal('draft') })

export const marketingCreativeOptimizationDraft: CapabilityDefinition = {
  key: 'marketing.creative.optimization_draft', version: 1, title: 'Criar variação de criativo',
  description: 'Cria somente um rascunho citado; publicação continua fora desta capability.',
  risk: 'low', effect: 'draft', approval: 'never', idempotency: 'required', inputSchema: z.object({ campaignVersionId: uuid, creative }),
  outputSchema: creativeOutput, requiredModules: ['campaigns', 'campaign_optimization_agent'], requiredConnections: [],
  domain: 'campaigns', requiredPermissions: ['campaign.write'], supportsModes: ['shadow', 'prepare', 'assisted', 'autonomous'],
  readiness: async () => ({ ready: true, blockers: [] }), recovery: { kind: 'compensatable', async compensate() { return { output: { recovered: true }, effectProduced: false } } },
  async execute(context, raw) {
    const input = raw as { campaignVersionId: string; creative: z.infer<typeof creative> }
    const contentHash = missionArtifactHash(input.creative)
    if (context.dryRun) return { output: { preview: true, contentHash, status: 'draft' as const }, effectProduced: false }
    const command = context.commands?.generateOptimizationCreativeDraft
    if (!command) throw new Error('capability_command_unavailable')
    const result = await command(commandContext(context, input)) as Record<string, unknown>
    return { output: { preview: false, ...result, contentHash, status: 'draft' as const }, effectProduced: true, sourceRecords: [{ type: 'campaign_creative_version', id: String(result.versionId) }] }
  },
}

function commandContext(context: CapabilityContext, input: Record<string, unknown>) {
  if (!context.actionRunId || !context.actor.id) throw new Error('capability_execution_context_required')
  return { ...input, organizationId: context.organizationId, missionId: context.missionId, actionRunId: context.actionRunId, actorId: context.actor.id, idempotencyKey: context.idempotencyKey }
}
function boundedAdjustment(value: string) { return Math.min(20, Math.max(0.01, Number(value))) }
function adjustedBudget(current: string, percent: number) { return fixed(Number(current) * (1 + percent / 100), 2) }
function fixed(value: number, digits: number) { return value.toFixed(digits) }
