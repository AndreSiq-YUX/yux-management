import { createHash } from 'node:crypto'
import { z } from 'zod'
import type { ActionPackVersion, PackStepTemplate, RuntimeActionPackVersion } from '../action-pack.js'

export const revenueRecoveryParameters = z.object({
  targetRevenueBrl: z.string().regex(/^\d+(\.\d{1,2})?$/).refine((value) => Number(value) > 0),
  deadlineDays: z.number().int().min(1).max(180).default(30),
  inactiveDays: z.number().int().min(7).max(3650).default(60),
  canarySize: z.number().int().min(1).max(20).default(20),
  maxPopulation: z.number().int().min(1).max(500).default(100),
  maxTotalCostBrl: z.string().regex(/^\d+(\.\d{1,2})?$/).default('1000'),
  maxHumanHours: z.string().regex(/^\d+(\.\d{1,2})?$/).default('10'),
  humanHourlyRateBrl: z.string().regex(/^\d+(\.\d{1,2})?$/).default('100'),
  minimumValueCostRatio: z.string().regex(/^\d+(\.\d+)?$/).default('3'),
  channels: z.array(z.enum(['human_task', 'email', 'whatsapp', 'automation'])).min(1).default(['human_task']),
})

export type RevenueRecoveryParameters = z.infer<typeof revenueRecoveryParameters>

const protectedStepKeys = [
  'pack.readiness',
  'pack.baseline',
  'pack.find_candidates',
  'pack.apply_exclusions',
  'pack.segment',
  'pack.approve_population',
  'pack.prepare_outreach',
  'pack.approve_canary',
  'pack.execute_outreach',
  'pack.wait_signals',
  'pack.collect_metrics_and_costs',
  'pack.evaluate',
] as const

const capabilityByStep: Record<(typeof protectedStepKeys)[number], { key: string; approval?: boolean; parameters: Record<string, unknown> }> = {
  'pack.readiness': { key: 'system.readiness.check', parameters: { requiredModules: ['crm'], requiredConnections: [] } },
  'pack.baseline': { key: 'crm.pipeline.snapshot', parameters: {} },
  'pack.find_candidates': { key: 'crm.recovery_candidates.search', parameters: { inactiveDays: 60, pipelineIds: [], stageIds: [], excludeLeadIds: [], limit: 100 } },
  'pack.apply_exclusions': { key: 'growth.segment.preview', parameters: { candidateIds: [], canarySize: 20 } },
  'pack.segment': { key: 'growth.segment.preview', parameters: { candidateIds: [], canarySize: 20 } },
  'pack.approve_population': { key: 'system.approval.await', approval: true, parameters: { approvalType: 'population', subject: {} } },
  'pack.prepare_outreach': { key: 'human.task.create', parameters: { title: 'Preparar abordagem de recuperação', description: 'Revisar contexto e preparar abordagem para o lote canário.', dueAt: 'runtime' } },
  'pack.approve_canary': { key: 'system.approval.await', approval: true, parameters: { approvalType: 'canary', subject: {} } },
  'pack.execute_outreach': { key: 'human.task.create', approval: true, parameters: { title: 'Executar abordagem aprovada', description: 'Executar a abordagem do lote canário aprovado e registrar evidências.', dueAt: 'runtime' } },
  'pack.wait_signals': { key: 'system.signal.wait', parameters: { durationHours: 24 } },
  'pack.collect_metrics_and_costs': { key: 'reports.recovered_revenue.snapshot', parameters: { since: 'runtime', leadIds: [] } },
  'pack.evaluate': { key: 'system.evaluation.checkpoint', parameters: { checkpointKey: 'canary_24h', targetRevenueBrl: 'runtime' } },
}

const topologySteps: PackStepTemplate[] = protectedStepKeys.map((stepKey, position) => ({
  stepKey,
  capabilityKey: capabilityByStep[stepKey].key,
  capabilityVersion: 1,
  dependsOn: position === 0 ? [] : [protectedStepKeys[position - 1]],
  approvalRequired: capabilityByStep[stepKey].approval ?? false,
  protected: true,
  defaultParameters: capabilityByStep[stepKey].parameters,
}))

const definitionWithoutHash: Omit<ActionPackVersion, 'contentHash'> = {
  key: 'revenue_recovery',
  semanticVersion: '0.1.0',
  schemaVersion: 1,
  outcomeType: 'recovered_revenue',
  status: 'published_for_internal_pilot',
  parameterSchema: {
    type: 'object',
    required: ['targetRevenueBrl'],
    properties: {
      targetRevenueBrl: { type: 'string', format: 'decimal' }, deadlineDays: { type: 'integer', minimum: 1, maximum: 180 },
      inactiveDays: { type: 'integer', minimum: 7 }, canarySize: { type: 'integer', minimum: 1, maximum: 20 },
      maxPopulation: { type: 'integer', minimum: 1, maximum: 500 }, maxTotalCostBrl: { type: 'string', format: 'decimal' },
      maxHumanHours: { type: 'string', format: 'decimal' }, humanHourlyRateBrl: { type: 'string', format: 'decimal' },
      minimumValueCostRatio: { type: 'string', format: 'decimal' }, channels: { type: 'array', items: { enum: ['human_task','email','whatsapp','automation'] } },
    },
  },
  readinessSpec: { requiredModules: ['crm'], revenueSource: { anyOf: ['lead.value', 'invoice', 'manual_attribution'] }, externalConnectionsOptional: true },
  topologyTemplate: { steps: topologySteps },
  protectedStepKeys: [...protectedStepKeys],
  extensionPoints: [
    { key: 'candidate_enrichment', afterStepKey: 'pack.find_candidates', beforeStepKey: 'pack.apply_exclusions', allowedCapabilities: [{ key: 'crm.lead.timeline.read', versions: [1] }], maxAdditionalSteps: 1 },
    { key: 'internal_follow_up', afterStepKey: 'pack.prepare_outreach', beforeStepKey: 'pack.approve_canary', allowedCapabilities: [{ key: 'crm.task.create', versions: [1] }, { key: 'crm.lead.assign_owner', versions: [1] }], maxAdditionalSteps: 2 },
    { key: 'approved_outreach', afterStepKey: 'pack.approve_canary', beforeStepKey: 'pack.execute_outreach', allowedCapabilities: [{ key: 'email.message.queue', versions: [1] }, { key: 'whatsapp.template.queue', versions: [1] }, { key: 'crm.sequence.enroll', versions: [1] }, { key: 'automation.flow.execute', versions: [1] }], maxAdditionalSteps: 1 },
  ],
  allowedCapabilities: [
    'system.readiness.check', 'crm.pipeline.snapshot', 'crm.recovery_candidates.search', 'growth.segment.preview',
    'system.approval.await', 'human.task.create', 'system.signal.wait', 'reports.recovered_revenue.snapshot',
    'system.evaluation.checkpoint', 'crm.lead.timeline.read', 'crm.task.create', 'crm.lead.assign_owner',
    'omnichannel.message.draft', 'crm.sequence.enroll', 'email.message.queue', 'whatsapp.template.queue', 'automation.flow.execute',
  ].map((key) => ({ key, versions: [1], required: protectedStepKeys.some((step) => capabilityByStep[step].key === key) })),
  metricSpec: {
    primary: { key: 'recovered_revenue_brl', unit: 'BRL', attribution: 'mission_population_won_since_start' },
    guardrails: ['opt_out_rate', 'complaint_rate', 'ownership_conflicts'],
    unknownPolicy: 'preserve_unknown',
  },
  economicsSpec: {
    currency: 'BRL',
    formulas: {
      totalCost: 'sum(actual_cost_entries_brl)', netValue: 'recoveredRevenueBrl-totalCost',
      valueCostRatio: 'recoveredRevenueBrl/totalCost', valuePerHumanHour: 'recoveredRevenueBrl/humanHours',
      humanFreeExecutionRate: 'actions_without_human_intervention/total_actions',
    },
    zeroDenominator: 'not_applicable',
  },
  policyDefaults: { mode: 'assisted', externalEffectsRequireApproval: true, maxCanarySize: 20, ownershipMode: 'exclusive', conflictPolicy: 'mission_wins' },
}

export const REVENUE_RECOVERY_PACK_V0: RuntimeActionPackVersion<RevenueRecoveryParameters> = {
  ...definitionWithoutHash,
  parameters: revenueRecoveryParameters,
  contentHash: hashDefinition(definitionWithoutHash),
}

export function createRevenueRecoveryPlan(parameters: RevenueRecoveryParameters) {
  return {
    schemaVersion: 1 as const,
    packKey: REVENUE_RECOVERY_PACK_V0.key,
    packVersion: REVENUE_RECOVERY_PACK_V0.semanticVersion,
    packContentHash: REVENUE_RECOVERY_PACK_V0.contentHash,
    parameters,
    deviations: [],
    steps: REVENUE_RECOVERY_PACK_V0.topologyTemplate.steps.map((step) => ({
      stepKey: step.stepKey,
      capabilityKey: step.capabilityKey,
      capabilityVersion: step.capabilityVersion,
      dependsOn: [...step.dependsOn],
      parameters: resolveRuntimeDefaults(step.defaultParameters, parameters),
      approvalRequired: step.approvalRequired,
      protected: step.protected,
    })),
    estimatedEconomics: { currency: 'BRL', maxTotalCostBrl: parameters.maxTotalCostBrl, maxHumanHours: parameters.maxHumanHours },
  }
}

function resolveRuntimeDefaults(value: Record<string, unknown>, parameters: RevenueRecoveryParameters): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).map(([key, item]) => {
    if (item !== 'runtime') return [key, item]
    if (key === 'dueAt' || key === 'since') return [key, new Date().toISOString()]
    if (key === 'targetRevenueBrl') return [key, parameters.targetRevenueBrl]
    return [key, item]
  }))
}

function hashDefinition(value: unknown): string {
  return createHash('sha256').update(stableSerialize(value)).digest('hex')
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableSerialize(item)}`).join(',')}}`
  }
  return JSON.stringify(value)
}
