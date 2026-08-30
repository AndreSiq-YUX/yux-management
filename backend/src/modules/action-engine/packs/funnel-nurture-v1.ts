import { createHash } from 'node:crypto'
import { z } from 'zod'
import type { ActionPackVersion, PackStepTemplate, RuntimeActionPackVersion } from '../action-pack.js'
import { hashAttributionPolicy, type AttributionPolicy } from '../metrics/attribution.js'

export const FUNNEL_NURTURE_ATTRIBUTION_POLICY: AttributionPolicy = {
  version: 1, model: 'last_touch', windowDays: 30,
  eligibleEventTypes: ['qualified_lead', 'email_reply', 'opportunity_created'],
  identityResolution: 'exact_contact_or_declared_binding', currency: 'BRL', lateEvents: 'reopen_evaluation',
}

export const funnelNurtureParameters = z.object({
  icp: z.string().trim().min(3).max(2000), offer: z.string().trim().min(3).max(2000),
  targetOutcome: z.enum(['qualified_lead', 'reply', 'opportunity']).default('qualified_lead'),
  observationDays: z.number().int().min(1).max(90).default(30),
  maxTotalCostBrl: z.string().regex(/^\d+(\.\d{1,2})?$/).default('1000'),
  maxHumanHours: z.string().regex(/^\d+(\.\d{1,2})?$/).default('8'),
  humanHourlyRateBrl: z.string().regex(/^\d+(\.\d{1,2})?$/).default('100'),
  expectedReplyRate: z.number().min(0).max(1).default(0.05),
  maximumOptOutRate: z.number().min(0).max(1).default(0.02),
})

export type FunnelNurtureParameters = z.infer<typeof funnelNurtureParameters>

const steps: Array<{ stepKey: string; capabilityKey: string; approval?: boolean; parameters?: Record<string, unknown> }> = [
  { stepKey: 'pack.readiness', capabilityKey: 'system.readiness.check', parameters: { requiredModules: ['crm','automations'], requiredConnections: ['email'] } },
  { stepKey: 'pack.inspect', capabilityKey: 'crm.pipeline.inspect' },
  { stepKey: 'pack.baseline', capabilityKey: 'crm.pipeline.inspect' },
  { stepKey: 'pack.simulate_funnel', capabilityKey: 'crm.pipeline.simulate', parameters: { artifactRef: 'resolvedParameters.funnelNurtureArtifacts.funnel' } },
  { stepKey: 'pack.draft_funnel', capabilityKey: 'crm.pipeline.create_draft', parameters: { artifactRef: 'resolvedParameters.funnelNurtureArtifacts.funnel' } },
  { stepKey: 'pack.draft_email_1', capabilityKey: 'email.template.create_draft', parameters: { artifactRef: 'resolvedParameters.funnelNurtureArtifacts.emails.0' } },
  { stepKey: 'pack.draft_email_2', capabilityKey: 'email.template.create_draft', parameters: { artifactRef: 'resolvedParameters.funnelNurtureArtifacts.emails.1' } },
  { stepKey: 'pack.draft_email_3', capabilityKey: 'email.template.create_draft', parameters: { artifactRef: 'resolvedParameters.funnelNurtureArtifacts.emails.2' } },
  { stepKey: 'pack.draft_sequence', capabilityKey: 'crm.sequence.create_draft', parameters: { artifactRef: 'resolvedParameters.funnelNurtureArtifacts.sequence' } },
  { stepKey: 'pack.simulate_sequence', capabilityKey: 'crm.sequence.simulate', parameters: { sequenceId: 'binding:pack.draft_sequence.entityId', versionId: 'binding:pack.draft_sequence.versionId', expectedContentHash: 'binding:pack.draft_sequence.contentHash' } },
  { stepKey: 'pack.draft_flow', capabilityKey: 'automation.flow.create_draft', parameters: { artifactRef: 'resolvedParameters.funnelNurtureArtifacts.automation', sequenceVersionId: 'binding:pack.draft_sequence.versionId' } },
  { stepKey: 'pack.simulate_flow', capabilityKey: 'automation.flow.simulate', parameters: { flowId: 'binding:pack.draft_flow.entityId', versionId: 'binding:pack.draft_flow.versionId', expectedContentHash: 'binding:pack.draft_flow.contentHash' } },
  { stepKey: 'pack.approve_publication', capabilityKey: 'system.approval.await', approval: true, parameters: { approvalType: 'plan', subject: { artifactSet: 'funnel_nurture' } } },
  { stepKey: 'pack.publish_funnel', capabilityKey: 'crm.pipeline.publish', approval: true, parameters: { versionId: 'binding:pack.draft_funnel.versionId', expectedContentHash: 'binding:pack.draft_funnel.contentHash' } },
  { stepKey: 'pack.publish_email_1', capabilityKey: 'email.template.publish', approval: true, parameters: { templateId: 'binding:pack.draft_email_1.entityId', expectedContentHash: 'binding:pack.draft_email_1.contentHash' } },
  { stepKey: 'pack.publish_email_2', capabilityKey: 'email.template.publish', approval: true, parameters: { templateId: 'binding:pack.draft_email_2.entityId', expectedContentHash: 'binding:pack.draft_email_2.contentHash' } },
  { stepKey: 'pack.publish_email_3', capabilityKey: 'email.template.publish', approval: true, parameters: { templateId: 'binding:pack.draft_email_3.entityId', expectedContentHash: 'binding:pack.draft_email_3.contentHash' } },
  { stepKey: 'pack.publish_sequence', capabilityKey: 'crm.sequence.publish', approval: true, parameters: { sequenceId: 'binding:pack.draft_sequence.entityId', versionId: 'binding:pack.draft_sequence.versionId', expectedContentHash: 'binding:pack.draft_sequence.contentHash' } },
  { stepKey: 'pack.publish_flow', capabilityKey: 'automation.flow.publish', approval: true, parameters: { flowId: 'binding:pack.draft_flow.entityId', versionId: 'binding:pack.draft_flow.versionId', expectedContentHash: 'binding:pack.draft_flow.contentHash' } },
  { stepKey: 'pack.wait_observation', capabilityKey: 'system.signal.wait', parameters: { durationHours: 720 } },
  { stepKey: 'pack.evaluate', capabilityKey: 'system.evaluation.checkpoint', parameters: { checkpointKey: 'funnel_nurture_30d', targetRevenueBrl: '0' } },
]

const topologySteps: PackStepTemplate[] = steps.map((step, index) => ({
  stepKey: step.stepKey, capabilityKey: step.capabilityKey, capabilityVersion: 1,
  dependsOn: index === 0 ? [] : [steps[index - 1]!.stepKey], approvalRequired: step.approval ?? false,
  protected: true, defaultParameters: step.parameters ?? {},
}))

const definitionWithoutHash: Omit<ActionPackVersion, 'contentHash'> = {
  key: 'funnel_nurture', semanticVersion: '1.0.0', schemaVersion: 1, outcomeType: 'qualified_demand_system', status: 'published',
  parameterSchema: { type: 'object', required: ['icp','offer'], properties: {
    icp: { type: 'string', minLength: 3 }, offer: { type: 'string', minLength: 3 },
    targetOutcome: { enum: ['qualified_lead','reply','opportunity'] }, observationDays: { type: 'integer', minimum: 1, maximum: 90 },
    maxTotalCostBrl: { type: 'string', format: 'decimal' }, maxHumanHours: { type: 'string', format: 'decimal' },
    humanHourlyRateBrl: { type: 'string', format: 'decimal' }, expectedReplyRate: { type: 'number', minimum: 0, maximum: 1 },
    maximumOptOutRate: { type: 'number', minimum: 0, maximum: 1 },
  } },
  readinessSpec: { requiredModules: ['crm','automations'], requiredConnections: ['email'], requiredKnowledge: ['company.icp','company.offer','brand.rules'], correctionLinks: { email: '/integrations', contract: '/platform/contracts', knowledge: '/knowledge' } },
  topologyTemplate: { steps: topologySteps }, protectedStepKeys: steps.map(step => step.stepKey),
  extensionPoints: [
    { key: 'optional_scoring_fields', afterStepKey: 'pack.inspect', beforeStepKey: 'pack.baseline', allowedCapabilities: [{ key: 'crm.lead.timeline.read', versions: [1] }], maxAdditionalSteps: 2 },
    { key: 'internal_owner_tasks', afterStepKey: 'pack.approve_publication', beforeStepKey: 'pack.publish_funnel', allowedCapabilities: [{ key: 'crm.task.create', versions: [1] }, { key: 'crm.lead.assign_owner', versions: [1] }], maxAdditionalSteps: 2 },
  ],
  allowedCapabilities: [...new Set(steps.map(step => step.capabilityKey).concat(['crm.lead.timeline.read','crm.task.create','crm.lead.assign_owner']))]
    .map(key => ({ key, versions: [1], required: steps.some(step => step.capabilityKey === key) })),
  metricSpec: {
    primary: { key: 'qualified_demand_value_brl', unit: 'BRL', attributionPolicy: FUNNEL_NURTURE_ATTRIBUTION_POLICY, attributionPolicyHash: hashAttributionPolicy(FUNNEL_NURTURE_ATTRIBUTION_POLICY) },
    operational: ['published_artifact_count','simulated_contact_count','enrollment_readiness','funnel_conversion_baseline','reply_rate'],
    guardrails: ['opt_out_rate','complaint_rate','consent_blocks','suppression_blocks'], unknownPolicy: 'preserve_unknown_when_identity_unresolved',
  },
  economicsSpec: { currency: 'BRL', formulas: {
    totalCost: 'sum(actual_cost_entries_brl)', valueCostRatio: 'qualifiedDemandValueBrl/totalCost',
    valuePerHumanHour: 'qualifiedDemandValueBrl/humanHours', interventionRate: 'human_interventions/total_actions',
  }, zeroDenominator: 'not_applicable', trackFromFirstRun: true },
  policyDefaults: { mode: 'prepare', ownershipMode: 'exclusive', conflictPolicy: 'mission_wins',
    publicationApprovalRequired: true, setupEnrollsExistingLeads: false, activationContractFlag: 'funnel_nurture_agent', activationCapabilitiesDisabledByDefault: true },
}

export const FUNNEL_NURTURE_PACK_V1: RuntimeActionPackVersion<FunnelNurtureParameters> = {
  ...definitionWithoutHash, parameters: funnelNurtureParameters, contentHash: hashDefinition(definitionWithoutHash),
}

export function createFunnelNurturePlan(parameters: FunnelNurtureParameters) {
  return {
    schemaVersion: 1 as const, packKey: FUNNEL_NURTURE_PACK_V1.key, packVersion: FUNNEL_NURTURE_PACK_V1.semanticVersion,
    packContentHash: FUNNEL_NURTURE_PACK_V1.contentHash, parameters, deviations: [],
    steps: topologySteps.map(step => ({ stepKey: step.stepKey, capabilityKey: step.capabilityKey,
      capabilityVersion: step.capabilityVersion, dependsOn: [...step.dependsOn], parameters: { ...step.defaultParameters },
      approvalRequired: step.approvalRequired, protected: true })),
    estimatedEconomics: { currency: 'BRL', maxTotalCostBrl: parameters.maxTotalCostBrl, maxHumanHours: parameters.maxHumanHours },
  }
}

function hashDefinition(value: unknown): string { return createHash('sha256').update(stable(value)).digest('hex') }
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>).sort(([a],[b]) => a.localeCompare(b)).map(([key,item]) => `${JSON.stringify(key)}:${stable(item)}`).join(',')}}`
  return JSON.stringify(value)
}
