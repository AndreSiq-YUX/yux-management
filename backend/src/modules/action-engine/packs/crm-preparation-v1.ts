import { z } from 'zod'
import type { ActionPackVersion, RuntimeActionPackVersion } from '../action-pack.js'
import { hashCanonical, publishActionPackVersion, type Queryable } from '../repository.js'
import { funnelNurtureParameters } from './funnel-nurture-v1.js'

export const crmPreparationParameters = funnelNurtureParameters.extend({
  maxTotalCostBrl: z.string().regex(/^\d+(\.\d{1,2})?$/).default('0'),
  maxHumanHours: z.string().regex(/^\d+(\.\d{1,2})?$/).default('0'),
})

const steps = [
  { stepKey: 'pack.readiness', capabilityKey: 'system.readiness.check', parameters: { requiredModules: ['crm', 'automations'], requiredConnections: [], preparationOnly: true } },
  { stepKey: 'pack.inspect', capabilityKey: 'crm.pipeline.inspect', parameters: {} },
  { stepKey: 'pack.simulate_funnel', capabilityKey: 'crm.pipeline.simulate', parameters: { artifactRef: 'resolvedParameters.funnelNurtureArtifacts.funnel' } },
  { stepKey: 'pack.draft_funnel', capabilityKey: 'crm.pipeline.create_draft', parameters: { artifactRef: 'resolvedParameters.funnelNurtureArtifacts.funnel' } },
  ...[0, 1, 2].map(index => ({ stepKey: `pack.draft_email_${index + 1}`, capabilityKey: 'email.template.create_draft', parameters: { artifactRef: `resolvedParameters.funnelNurtureArtifacts.emails.${index}` } })),
  { stepKey: 'pack.draft_sequence', capabilityKey: 'crm.sequence.create_draft', parameters: { artifactRef: 'resolvedParameters.funnelNurtureArtifacts.sequence' } },
]

const definition: Omit<ActionPackVersion, 'contentHash'> = {
  key: 'crm_preparation', semanticVersion: '1.0.0', schemaVersion: 1, outcomeType: 'crm_drafts_prepared', status: 'published',
  parameterSchema: { type: 'object', required: ['icp', 'offer'], properties: { icp: { type: 'string', minLength: 3 }, offer: { type: 'string', minLength: 3 } } },
  readinessSpec: { requiredModules: ['crm', 'automations'], requiredConnections: [], requiredKnowledge: [], acceptsDraftCrm: true },
  topologyTemplate: { steps: steps.map((step, index) => ({ stepKey: step.stepKey, capabilityKey: step.capabilityKey, capabilityVersion: 1,
    dependsOn: index ? [steps[index - 1]!.stepKey] : [], approvalRequired: false, protected: true, defaultParameters: step.parameters })) },
  protectedStepKeys: steps.map(step => step.stepKey), extensionPoints: [],
  allowedCapabilities: [...new Set(steps.map(step => step.capabilityKey))].map(key => ({ key, versions: [1], required: true })),
  metricSpec: { primary: { key: 'persisted_draft_count', unit: 'drafts' } },
  economicsSpec: { currency: 'BRL', zeroDenominator: 'not_applicable', trackFromFirstRun: true },
  policyDefaults: { mode: 'prepare', preparationOnly: true, publicationApprovalRequired: true, setupEnrollsExistingLeads: false },
  artifactContract: { consumes: [], produces: [{ key: 'crm.funnel_draft', schemaVersion: 1 }, { key: 'crm.email_sequence_draft', schemaVersion: 1 }] },
}

export const CRM_PREPARATION_PACK_V1: RuntimeActionPackVersion<z.infer<typeof crmPreparationParameters>> = {
  ...definition, contentHash: hashCanonical(definition), parameters: crmPreparationParameters,
}

export async function ensureCrmPreparationPackVersion(pool: Queryable, createdBy: string) {
  return publishActionPackVersion(pool, { packKey: definition.key, name: 'Preparar CRM, funil e e-mails',
    description: 'Salva rascunhos para revisão, sem publicar, ativar canais ou enviar mensagens.',
    semanticVersion: definition.semanticVersion, outcomeType: definition.outcomeType,
    definition: definition as unknown as Record<string, unknown>, contentHash: CRM_PREPARATION_PACK_V1.contentHash, createdBy })
}
