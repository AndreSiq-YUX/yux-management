import { createHash } from 'node:crypto'
import { z } from 'zod'
import type { ActionPackVersion, PackStepTemplate, RuntimeActionPackVersion } from '../action-pack.js'

const decimal = z.string().regex(/^\d+(\.\d{1,6})?$/)

export const campaignOptimizationParameters = z.object({
  campaignId: z.string().uuid(),
  campaignVersionId: z.string().uuid(),
  checkpointFrequency: z.enum(['hourly', 'daily']).default('daily'),
  minimumImpressions: z.number().int().min(100).max(10_000_000).default(1000),
  minimumClicks: z.number().int().min(10).max(1_000_000).default(50),
  minimumLeadsForScale: z.number().int().min(1).max(100_000).default(5),
  minimumCtr: decimal.default('0.01'),
  targetCplBrl: decimal,
  maximumCplBrl: decimal,
  maxBudgetAdjustmentPercent: decimal.refine((value) => Number(value) > 0 && Number(value) <= 20),
  maxTotalCostBrl: decimal.default('1000'),
  maxHumanHours: decimal.default('4'),
}).superRefine((value, context) => {
  if (Number(value.targetCplBrl) > Number(value.maximumCplBrl)) {
    context.addIssue({ code: 'custom', message: 'campaign_optimization_target_cpl_above_maximum', path: ['targetCplBrl'] })
  }
})

export type CampaignOptimizationParameters = z.infer<typeof campaignOptimizationParameters>

const rawSteps: Array<{ stepKey: string; capabilityKey: string; parameters?: Record<string, unknown> }> = [
  {
    stepKey: 'pack.readiness', capabilityKey: 'system.readiness.check',
    parameters: { requiredModules: ['campaigns', 'campaign_launch_agent', 'campaign_optimization_agent'], requiredConnections: ['ads_provider'] },
  },
  {
    stepKey: 'pack.collect_metrics', capabilityKey: 'campaign.metrics.snapshot',
    parameters: { campaignId: 'runtime' },
  },
  {
    stepKey: 'pack.evaluate_guardrails', capabilityKey: 'campaign.optimization.evaluate',
    parameters: { campaignId: 'runtime' },
  },
  {
    stepKey: 'pack.record_checkpoint', capabilityKey: 'system.evaluation.checkpoint',
    parameters: { checkpointKey: 'campaign_optimization', targetRevenueBrl: '0' },
  },
]

const topologySteps: PackStepTemplate[] = rawSteps.map((step, index) => ({
  stepKey: step.stepKey,
  capabilityKey: step.capabilityKey,
  capabilityVersion: 1,
  dependsOn: index === 0 ? [] : [rawSteps[index - 1]!.stepKey],
  approvalRequired: false,
  protected: true,
  defaultParameters: step.parameters ?? {},
}))

const definition: Omit<ActionPackVersion, 'contentHash'> = {
  key: 'campaign_optimization',
  semanticVersion: '1.0.0',
  schemaVersion: 1,
  outcomeType: 'continuous_campaign_optimization',
  status: 'published_for_internal_pilot',
  parameterSchema: {
    type: 'object',
    required: ['campaignId', 'campaignVersionId', 'targetCplBrl', 'maximumCplBrl', 'maxBudgetAdjustmentPercent'],
    properties: {
      campaignId: { type: 'string', format: 'uuid' }, campaignVersionId: { type: 'string', format: 'uuid' },
      checkpointFrequency: { enum: ['hourly', 'daily'] }, minimumImpressions: { type: 'integer' },
      minimumClicks: { type: 'integer' }, minimumLeadsForScale: { type: 'integer' }, minimumCtr: { type: 'string', format: 'decimal' },
      targetCplBrl: { type: 'string', format: 'decimal' }, maximumCplBrl: { type: 'string', format: 'decimal' },
      maxBudgetAdjustmentPercent: { type: 'string', format: 'decimal', maximum: 20 },
    },
  },
  readinessSpec: {
    requiredModules: ['campaigns', 'campaign_launch_agent', 'campaign_optimization_agent'],
    requiredConnections: ['ads_provider'], requiredKnowledge: ['brand.rules'],
    correctionLinks: { provider: '/integrations', contract: '/platform/contracts', knowledge: '/knowledge' },
  },
  topologyTemplate: { steps: topologySteps },
  protectedStepKeys: rawSteps.map((step) => step.stepKey),
  extensionPoints: [{
    key: 'bounded_optimization_action', afterStepKey: 'pack.evaluate_guardrails', beforeStepKey: 'pack.record_checkpoint',
    allowedCapabilities: [
      { key: 'campaign.provider.pause', versions: [1] },
      { key: 'campaign.budget.decrease_bounded', versions: [1] },
      { key: 'campaign.budget.increase', versions: [1] },
      { key: 'marketing.creative.optimization_draft', versions: [1] },
    ],
    maxAdditionalSteps: 1,
  }],
  allowedCapabilities: [
    ...rawSteps.map((step) => ({ key: step.capabilityKey, versions: [1], required: true })),
    { key: 'campaign.provider.pause', versions: [1], required: false },
    { key: 'campaign.budget.decrease_bounded', versions: [1], required: false },
    { key: 'campaign.budget.increase', versions: [1], required: false },
    { key: 'marketing.creative.optimization_draft', versions: [1], required: false },
  ],
  metricSpec: {
    primary: ['leads', 'qualified_leads', 'attributed_revenue_brl'],
    leading: ['impressions', 'clicks', 'ctr'], economics: ['spend_brl', 'cpl_brl'],
    guardrails: ['tracking_known', 'maximum_cpl_brl', 'max_budget_adjustment_percent'],
    unknownPolicy: 'pause_when_tracking_is_unknown_after_campaign_activation',
  },
  economicsSpec: {
    currency: 'BRL', formulas: { cpl: 'spendBrl/leads', ctr: 'clicks/impressions' },
    zeroDenominator: 'not_applicable', trackFromFirstRun: true,
  },
  policyDefaults: {
    mode: 'autonomous', ownershipMode: 'exclusive', conflictPolicy: 'mission_wins',
    maximumBudgetAdjustmentPercent: 20, budgetIncreaseApprovalRequired: true,
    creativePublicationApprovalRequired: true, deterministicCheckpointRequired: true,
    capabilitiesDisabledByDefault: true,
  },
  artifactContract: {
    consumes: [{ key: 'campaign.launch', schemaVersion: 1, optional: false }],
    produces: [{ key: 'campaign.optimization_checkpoint', schemaVersion: 1 }],
  },
}

export const CAMPAIGN_OPTIMIZATION_PACK_V1: RuntimeActionPackVersion<CampaignOptimizationParameters> = {
  ...definition,
  parameters: campaignOptimizationParameters,
  contentHash: hashDefinition(definition),
}

export function createCampaignOptimizationPlan(parameters: CampaignOptimizationParameters) {
  return {
    schemaVersion: 1 as const,
    packKey: CAMPAIGN_OPTIMIZATION_PACK_V1.key,
    packVersion: CAMPAIGN_OPTIMIZATION_PACK_V1.semanticVersion,
    packContentHash: CAMPAIGN_OPTIMIZATION_PACK_V1.contentHash,
    parameters,
    deviations: [],
    steps: topologySteps.map((step) => ({
      stepKey: step.stepKey, capabilityKey: step.capabilityKey, capabilityVersion: step.capabilityVersion,
      dependsOn: [...step.dependsOn],
      parameters: Object.fromEntries(Object.entries(step.defaultParameters).map(([key, value]) => [
        key, value === 'runtime' && key === 'campaignId' ? parameters.campaignId : value,
      ])),
      approvalRequired: step.approvalRequired, protected: true,
    })),
    estimatedEconomics: {
      currency: 'BRL', mediaBudgetBrl: '0', maxTotalCostBrl: parameters.maxTotalCostBrl,
      maxHumanHours: parameters.maxHumanHours,
    },
  }
}

function hashDefinition(value: unknown) { return createHash('sha256').update(stable(value)).digest('hex') }
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(',')}}`
  return JSON.stringify(value)
}
