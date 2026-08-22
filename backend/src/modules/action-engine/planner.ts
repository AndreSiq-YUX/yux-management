import { createHash } from 'node:crypto'
import { z } from 'zod'
import type { AppEnv } from '../../config/env.js'
import { validatePlanConformance, type ActionPackVersion } from './action-pack.js'
import type { CapabilityRegistry } from './capability-registry.js'
import type { ActionPlanStep, ProposedMissionPlan } from './types.js'

const decimal = z.string().regex(/^-?\d+(\.\d+)?$/)
const harnessStep = z.object({
  stepKey: z.string().min(1), dependsOn: z.array(z.string()), capabilityKey: z.string().min(1),
  capabilityVersion: z.number().int().positive(), input: z.record(z.string(), z.unknown()).default({}),
  timeoutSeconds: z.number().int().min(1).max(86_400), maxAttempts: z.number().int().min(1).max(5),
  approvalRequired: z.boolean(), effect: z.enum(['none','internal','external']),
  extensionPoint: z.string().optional(),
  outputBindings: z.record(z.string(), z.object({ fromStep: z.string(), path: z.string().min(1) })).default({}),
})
const harnessPlan = z.object({
  schemaVersion: z.literal(1), missionId: z.string().min(1),
  actionPack: z.object({ key: z.string(), version: z.string(), templateHash: z.string() }),
  resolvedParameters: z.record(z.string(), z.unknown()).default({}),
  deviations: z.array(z.object({ path: z.string(), reason: z.string(), approvalRequired: z.boolean() })).default([]),
  rationale: z.string().default(''), assumptions: z.array(z.unknown()).default([]), risks: z.array(z.unknown()).default([]),
  estimatedEconomics: z.object({
    currency: z.literal('BRL'), aiAndProviderCost: decimal.default('0'), mediaCost: decimal.default('0'),
    humanHours: decimal.default('0'), humanCost: decimal.default('0'), totalExecutionCost: decimal,
  }),
  steps: z.array(harnessStep).min(1),
})

export type HarnessMissionPlan = z.infer<typeof harnessPlan>
export type CompiledMissionPlan = {
  missionId: string
  packKey: string
  packVersion: string
  packContentHash: string
  planHash: string
  parameters: Record<string, unknown>
  deviations: Array<{ path: string; reason: string; approvalRequired: boolean }>
  estimatedEconomics: HarnessMissionPlan['estimatedEconomics']
  steps: Array<ActionPlanStep & { timeoutSeconds: number; maxAttempts: number; outputBindings: Record<string, { fromStep: string; path: string }> }>
}

export type PlanMaterialDiff = {
  addedSteps: string[]; removedSteps: string[]; changedCapabilities: string[];
  changedApprovals: string[]; changedOwnership: boolean; populationExpanded: boolean;
  budgetExpanded: boolean; economicsChanged: boolean; requiresReplanApproval: boolean
}

export function diffMissionPlans(previous: CompiledMissionPlan, proposed: CompiledMissionPlan): PlanMaterialDiff {
  if (previous.packKey !== proposed.packKey || previous.packVersion !== proposed.packVersion || previous.packContentHash !== proposed.packContentHash) {
    throw new Error('replan_pack_change_forbidden')
  }
  const previousSteps = new Map(previous.steps.map((step) => [step.stepKey, step]))
  const proposedSteps = new Map(proposed.steps.map((step) => [step.stepKey, step]))
  const addedSteps = [...proposedSteps.keys()].filter((key) => !previousSteps.has(key))
  const removedSteps = [...previousSteps.keys()].filter((key) => !proposedSteps.has(key))
  const common = [...proposedSteps.keys()].filter((key) => previousSteps.has(key))
  const changedCapabilities = common.filter((key) => {
    const left = previousSteps.get(key)!; const right = proposedSteps.get(key)!
    return left.capabilityKey !== right.capabilityKey || left.capabilityVersion !== right.capabilityVersion
  })
  const changedApprovals = common.filter((key) => previousSteps.get(key)!.approvalRequired !== proposedSteps.get(key)!.approvalRequired)
  const previousPopulation = decimalParameter(previous.parameters.maxPopulation)
  const proposedPopulation = decimalParameter(proposed.parameters.maxPopulation)
  const previousBudget = decimalParameter(previous.estimatedEconomics.totalExecutionCost)
  const proposedBudget = decimalParameter(proposed.estimatedEconomics.totalExecutionCost)
  const populationExpanded = proposedPopulation > previousPopulation
  const budgetExpanded = proposedBudget > previousBudget
  const economicsChanged = JSON.stringify(previous.estimatedEconomics) !== JSON.stringify(proposed.estimatedEconomics)
  const changedOwnership = JSON.stringify(previous.parameters.ownershipMode) !== JSON.stringify(proposed.parameters.ownershipMode)
  return {
    addedSteps, removedSteps, changedCapabilities, changedApprovals, changedOwnership, populationExpanded,
    budgetExpanded, economicsChanged,
    requiresReplanApproval: addedSteps.length > 0 || removedSteps.length > 0 || changedCapabilities.length > 0
      || changedApprovals.length > 0 || changedOwnership || populationExpanded || budgetExpanded || economicsChanged,
  }
}

function decimalParameter(value: unknown): bigint {
  const text = typeof value === 'string' || typeof value === 'number' ? String(value) : '0'
  const [whole, fraction = ''] = text.split('.')
  return BigInt(whole || '0') * 1_000_000n + BigInt(fraction.slice(0, 6).padEnd(6, '0') || '0')
}

export async function requestMissionPlan(
  env: Pick<AppEnv, 'YUX_AGENT_RUNTIME_URL' | 'YUX_AGENT_RUNTIME_TOKEN'>,
  payload: Record<string, unknown>,
  fetchImpl: typeof fetch = fetch,
): Promise<unknown> {
  if (!env.YUX_AGENT_RUNTIME_URL || !env.YUX_AGENT_RUNTIME_TOKEN) throw new Error('agent_harness_unavailable')
  const response = await fetchImpl(new URL('/missions/plan', env.YUX_AGENT_RUNTIME_URL), {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${env.YUX_AGENT_RUNTIME_TOKEN}` },
    body: JSON.stringify(payload), signal: AbortSignal.timeout(60_000),
  })
  if (!response.ok) throw new Error(`agent_harness_plan_failed:${response.status}`)
  const body = await response.json() as { plan?: unknown }
  if (!body.plan) throw new Error('agent_harness_plan_missing')
  return body.plan
}

export function compileMissionPlan(input: {
  rawPlan: unknown
  missionId: string
  pack: ActionPackVersion
  registry: CapabilityRegistry
  maxTotalCostBrl: string
}): CompiledMissionPlan {
  const parsed = harnessPlan.safeParse(input.rawPlan)
  if (!parsed.success) throw new Error('mission_plan_contract_invalid')
  const raw = parsed.data
  if (raw.missionId !== input.missionId) throw new Error('mission_plan_mission_mismatch')

  const internal: ProposedMissionPlan = {
    schemaVersion: 1, packKey: raw.actionPack.key, packVersion: raw.actionPack.version,
    packContentHash: raw.actionPack.templateHash, parameters: raw.resolvedParameters,
    deviations: raw.deviations.map((item) => ({ extensionPoint: item.path, rationale: item.reason })),
    estimatedEconomics: raw.estimatedEconomics,
    steps: raw.steps.map((step) => ({
      stepKey: step.stepKey, capabilityKey: step.capabilityKey, capabilityVersion: step.capabilityVersion,
      dependsOn: step.dependsOn, parameters: step.input, approvalRequired: step.approvalRequired,
      protected: input.pack.protectedStepKeys.includes(step.stepKey), ...(step.extensionPoint ? { extensionPoint: step.extensionPoint } : {}),
    })),
  }
  assertAcyclic(raw.steps)
  validatePlanConformance(internal, input.pack)

  const stepKeys = new Set(raw.steps.map((step) => step.stepKey))
  for (const step of raw.steps) {
    const capability = input.registry.get(step.capabilityKey, step.capabilityVersion)
    if (!capability.inputSchema.safeParse(step.input).success) throw new Error('mission_plan_capability_input_invalid')
    if (capability.effect === 'external' && !step.approvalRequired) throw new Error('mission_plan_external_approval_required')
    if (capability.approval === 'always' && !step.approvalRequired) throw new Error('mission_plan_required_approval_missing')
    if (capability.effect !== step.effect) throw new Error('mission_plan_capability_effect_mismatch')
    if (capability.key === 'system.signal.wait' && step.timeoutSeconds < 1) throw new Error('mission_plan_wait_timeout_required')
    for (const binding of Object.values(step.outputBindings)) {
      if (!stepKeys.has(binding.fromStep) || raw.steps.findIndex((candidate) => candidate.stepKey === binding.fromStep) >= raw.steps.indexOf(step)) {
        throw new Error('mission_plan_output_binding_invalid')
      }
    }
  }

  if (compareDecimal(raw.estimatedEconomics.totalExecutionCost, input.maxTotalCostBrl) > 0) {
    throw new Error('mission_plan_budget_exceeded')
  }
  const normalized = {
    missionId: input.missionId, packKey: input.pack.key, packVersion: input.pack.semanticVersion,
    packContentHash: input.pack.contentHash, parameters: raw.resolvedParameters, deviations: raw.deviations,
    estimatedEconomics: raw.estimatedEconomics,
    steps: raw.steps.map((step) => ({
      stepKey: step.stepKey, capabilityKey: step.capabilityKey, capabilityVersion: step.capabilityVersion,
      dependsOn: [...step.dependsOn].sort(), parameters: step.input, approvalRequired: step.approvalRequired,
      protected: input.pack.protectedStepKeys.includes(step.stepKey), ...(step.extensionPoint ? { extensionPoint: step.extensionPoint } : {}),
      timeoutSeconds: step.timeoutSeconds, maxAttempts: step.maxAttempts, outputBindings: step.outputBindings,
    })),
  }
  return { ...normalized, planHash: createHash('sha256').update(stableSerialize(normalized)).digest('hex') }
}

function assertAcyclic(steps: HarnessMissionPlan['steps']): void {
  const graph = new Map(steps.map((step) => [step.stepKey, step.dependsOn]))
  const visiting = new Set<string>()
  const visited = new Set<string>()
  const visit = (key: string) => {
    if (visiting.has(key)) throw new Error('mission_plan_cycle_detected')
    if (visited.has(key)) return
    const dependencies = graph.get(key)
    if (!dependencies) throw new Error('mission_plan_dependency_missing')
    visiting.add(key)
    for (const dependency of dependencies) visit(dependency)
    visiting.delete(key)
    visited.add(key)
  }
  for (const key of graph.keys()) visit(key)
}

function compareDecimal(left: string, right: string): number {
  const normalize = (value: string) => {
    const [whole, fraction = ''] = value.split('.')
    return { whole: BigInt(whole), fraction }
  }
  const a = normalize(left)
  const b = normalize(right)
  const scale = Math.max(a.fraction.length, b.fraction.length)
  const scaled = (value: ReturnType<typeof normalize>) => value.whole * (10n ** BigInt(scale)) + BigInt(value.fraction.padEnd(scale, '0') || '0')
  return scaled(a) === scaled(b) ? 0 : scaled(a) > scaled(b) ? 1 : -1
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stableSerialize(item)}`).join(',')}}`
  return JSON.stringify(value)
}
