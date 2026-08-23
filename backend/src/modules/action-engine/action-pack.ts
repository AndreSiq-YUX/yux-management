import type { ZodType } from 'zod'
import type { ProposedMissionPlan } from './types.js'

export type PackStepTemplate = {
  stepKey: string
  capabilityKey: string
  capabilityVersion: number
  dependsOn: string[]
  approvalRequired: boolean
  protected: boolean
  extensionPoint?: string
  defaultParameters: Record<string, unknown>
}

export type PackExtensionPoint = {
  key: string
  afterStepKey: string
  beforeStepKey: string
  allowedCapabilities: Array<{ key: string; versions: number[] }>
  maxAdditionalSteps: number
}

export type ActionPackVersion = {
  key: string
  semanticVersion: string
  schemaVersion: 1
  outcomeType: string
  status: 'draft' | 'published_for_internal_pilot' | 'published' | 'retired'
  parameterSchema: Record<string, unknown>
  readinessSpec: Record<string, unknown>
  topologyTemplate: { steps: PackStepTemplate[] }
  protectedStepKeys: string[]
  extensionPoints: PackExtensionPoint[]
  allowedCapabilities: Array<{ key: string; versions: number[]; required: boolean }>
  metricSpec: Record<string, unknown>
  economicsSpec: Record<string, unknown>
  policyDefaults: Record<string, unknown>
  contentHash: string
}

export type RuntimeActionPackVersion<TParameters> = ActionPackVersion & {
  parameters: ZodType<TParameters>
}

export function validatePackParameters<TParameters>(parameters: unknown, pack: RuntimeActionPackVersion<TParameters>) {
  return pack.parameters.safeParse(parameters)
}

export function validatePlanConformance(plan: ProposedMissionPlan, pack: ActionPackVersion): void {
  if (plan.schemaVersion !== pack.schemaVersion || plan.packKey !== pack.key || plan.packVersion !== pack.semanticVersion) {
    throw new Error('action_pack_identity_mismatch')
  }
  if (plan.packContentHash !== pack.contentHash) throw new Error('action_pack_hash_mismatch')

  const stepKeys = plan.steps.map((step) => step.stepKey)
  if (new Set(stepKeys).size !== stepKeys.length) throw new Error('action_pack_duplicate_step')

  let lastProtectedIndex = -1
  for (const protectedKey of pack.protectedStepKeys) {
    const index = stepKeys.indexOf(protectedKey)
    if (index === -1) throw new Error('action_pack_protected_step_missing')
    if (index <= lastProtectedIndex) throw new Error('action_pack_protected_order_invalid')
    lastProtectedIndex = index
    const template = pack.topologyTemplate.steps.find((step) => step.stepKey === protectedKey)
    const proposed = plan.steps[index]
    if (!template || proposed.capabilityKey !== template.capabilityKey || proposed.capabilityVersion !== template.capabilityVersion) {
      throw new Error('action_pack_protected_step_changed')
    }
  }

  const capabilityAllowlist = new Map(pack.allowedCapabilities.map((entry) => [entry.key, entry.versions]))
  for (const deviation of plan.deviations) {
    if (!pack.extensionPoints.some((extension) => extension.key === deviation.extensionPoint)) {
      throw new Error('action_pack_extension_point_unknown')
    }
  }
  for (const step of plan.steps) {
    const versions = capabilityAllowlist.get(step.capabilityKey)
    if (!versions?.includes(step.capabilityVersion)) throw new Error('action_pack_capability_not_allowed')
    if (step.extensionPoint) {
      const extension = pack.extensionPoints.find((candidate) => candidate.key === step.extensionPoint)
      if (!extension) throw new Error('action_pack_extension_point_unknown')
      const allowed = extension.allowedCapabilities.find((candidate) => candidate.key === step.capabilityKey)
      if (!allowed?.versions.includes(step.capabilityVersion)) throw new Error('action_pack_extension_capability_not_allowed')
    }
    for (const dependency of step.dependsOn) {
      const dependencyIndex = stepKeys.indexOf(dependency)
      if (dependencyIndex === -1 || dependencyIndex >= stepKeys.indexOf(step.stepKey)) {
        throw new Error('action_pack_dependency_invalid')
      }
    }
  }

  for (const extension of pack.extensionPoints) {
    const count = plan.steps.filter((step) => step.extensionPoint === extension.key).length
    if (count > extension.maxAdditionalSteps) throw new Error('action_pack_extension_limit_exceeded')
  }

  if (pack.key === 'revenue_recovery') {
    const populationApproval = stepKeys.indexOf('pack.approve_population')
    const canaryApproval = stepKeys.indexOf('pack.approve_canary')
    const outreach = stepKeys.indexOf('pack.execute_outreach')
    if (populationApproval < 0 || canaryApproval < 0 || outreach < 0 || populationApproval > outreach || canaryApproval > outreach) {
      throw new Error('action_pack_outreach_approval_missing')
    }
  }
}
