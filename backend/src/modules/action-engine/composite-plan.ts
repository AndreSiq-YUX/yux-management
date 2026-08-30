import { createHash } from 'node:crypto'
import { hashCapabilityManifest, type CapabilityManifestEntry } from './capability-manifest.js'
import type { CompiledMissionPlan } from './planner.js'
import type { ResolvedPackSelection } from './pack-resolver.js'

export type CompositeArtifactBinding = {
  fromPack: string
  artifactKey: string
  fromStepKey: string
  outputPath: string
  toPack: string
  toStepKey: string
  inputKey: string
  schemaVersion: number
}

export type CompiledCompositePlan = {
  missionId: string
  packs: Array<{ key: string; semanticVersion: string; contentHash: string; optional: boolean; order: number }>
  steps: CompiledMissionPlan['steps']
  artifactBindings: CompositeArtifactBinding[]
  aggregateEconomics: { currency: 'BRL'; aiAndProviderCost: string; mediaCost: string; humanHours: string; humanCost: string; totalExecutionCost: string }
  capabilityManifest: CapabilityManifestEntry[]
  capabilityManifestHash: string
  contextHash: string
  sourceIds: string[]
  planHash: string
}

export function compileCompositePlan(input: {
  missionId: string
  selections: ResolvedPackSelection[]
  plans: CompiledMissionPlan[]
  bindings: CompositeArtifactBinding[]
  contextHash: string
  sourceIds: string[]
  allowedSourceIds: string[]
  maxTotalCostBrl: string
}): CompiledCompositePlan {
  if (input.selections.length < 2 || input.plans.length !== input.selections.length) throw new Error('mission_composite_pack_count_invalid')
  if (!/^[a-f0-9]{64}$/.test(input.contextHash)) throw new Error('mission_context_hash_invalid')
  const allowedSources = new Set(input.allowedSourceIds)
  const sourceIds = [...new Set(input.sourceIds)].sort()
  if (sourceIds.some(id => !allowedSources.has(id))) throw new Error('mission_plan_source_not_allowed')
  const selections = new Map(input.selections.map(selection => [selection.key, selection]))
  if (selections.size !== input.selections.length) throw new Error('mission_pack_selection_duplicate')
  const plans = new Map<string, CompiledMissionPlan>()
  for (const plan of input.plans) {
    const selection = selections.get(plan.packKey)
    if (!selection || plan.missionId !== input.missionId || plan.packVersion !== selection.semanticVersion || plan.packContentHash !== selection.contentHash) throw new Error('mission_composite_pack_plan_mismatch')
    if (plans.has(plan.packKey)) throw new Error('mission_composite_pack_plan_duplicate')
    const allowedCapabilities = new Set(selection.pack.allowedCapabilities.flatMap(item => item.versions.map(version => `${item.key}@${version}`)))
    if (plan.steps.some(step => !allowedCapabilities.has(`${step.capabilityKey}@${step.capabilityVersion}`))) throw new Error('mission_composite_capability_escalation')
    plans.set(plan.packKey, plan)
  }
  validateBindings(input.bindings, input.selections, plans)
  assertPackGraphAcyclic(input.selections.map(item => item.key), input.bindings)

  const steps = input.selections.flatMap(selection => plans.get(selection.key)!.steps.map(step => ({
    ...step,
    stepKey: namespaced(selection.key, step.stepKey),
    dependsOn: step.dependsOn.map(dependency => namespaced(selection.key, dependency)),
    ...(step.extensionPoint ? { extensionPoint: `${selection.key}.${step.extensionPoint}` } : {}),
  })))
  for (const binding of input.bindings) {
    const target = steps.find(step => step.stepKey === namespaced(binding.toPack, binding.toStepKey))
    const dependency = namespaced(binding.fromPack, binding.fromStepKey)
    if (!target || !steps.some(step => step.stepKey === dependency)) throw new Error('mission_composite_binding_step_missing')
    target.dependsOn = [...new Set([...target.dependsOn, dependency])].sort()
  }
  if (new Set(steps.map(step => step.stepKey)).size !== steps.length) throw new Error('mission_composite_protected_node_collision')
  const aggregateEconomics = aggregate(input.plans.map(plan => plan.estimatedEconomics))
  if (scaled(aggregateEconomics.totalExecutionCost) > scaled(input.maxTotalCostBrl)) throw new Error('mission_composite_budget_exceeded')
  const manifestByIdentity = new Map<string, CapabilityManifestEntry>()
  for (const plan of input.plans) for (const item of plan.capabilityManifest) manifestByIdentity.set(`${item.key}@${item.version}`, item)
  const capabilityManifest = [...manifestByIdentity.values()].sort((a, b) => `${a.key}@${a.version}`.localeCompare(`${b.key}@${b.version}`))
  const normalized = {
    missionId: input.missionId,
    packs: input.selections.map(({ key, semanticVersion, contentHash, optional, order }) => ({ key, semanticVersion, contentHash, optional, order })),
    steps, artifactBindings: input.bindings.map(binding => ({ ...binding })).sort(bindingOrder), aggregateEconomics,
    capabilityManifest, capabilityManifestHash: hashCapabilityManifest(capabilityManifest), contextHash: input.contextHash, sourceIds,
  }
  return { ...normalized, planHash: createHash('sha256').update(stable(normalized)).digest('hex') }
}

function validateBindings(bindings: CompositeArtifactBinding[], selections: ResolvedPackSelection[], plans: Map<string, CompiledMissionPlan>) {
  const seen = new Set<string>()
  for (const binding of bindings) {
    const from = selections.find(item => item.key === binding.fromPack)
    const to = selections.find(item => item.key === binding.toPack)
    if (!from || !to || from.key === to.key) throw new Error('mission_composite_binding_pack_invalid')
    if (!from.producesArtifacts.some(item => item.key === binding.artifactKey && item.schemaVersion === binding.schemaVersion)) throw new Error('mission_composite_binding_producer_undeclared')
    if (!to.consumesArtifacts.some(item => item.key === binding.artifactKey && item.schemaVersion === binding.schemaVersion)) throw new Error('mission_composite_binding_consumer_undeclared')
    if (!plans.get(from.key)?.steps.some(step => step.stepKey === binding.fromStepKey) || !plans.get(to.key)?.steps.some(step => step.stepKey === binding.toStepKey)) throw new Error('mission_composite_binding_step_missing')
    const identity = `${binding.fromPack}:${binding.artifactKey}:${binding.toPack}:${binding.inputKey}`
    if (seen.has(identity)) throw new Error('mission_composite_binding_duplicate')
    seen.add(identity)
  }
  for (const selection of selections) for (const requirement of selection.consumesArtifacts.filter(item => !item.optional)) {
    if (!bindings.some(binding => binding.toPack === selection.key && binding.artifactKey === requirement.key && binding.schemaVersion === requirement.schemaVersion)) throw new Error('mission_pack_artifact_requirement_unsatisfied')
  }
}

function assertPackGraphAcyclic(packKeys: string[], bindings: CompositeArtifactBinding[]) {
  const graph = new Map(packKeys.map(key => [key, bindings.filter(binding => binding.toPack === key).map(binding => binding.fromPack)]))
  const visiting = new Set<string>(); const visited = new Set<string>()
  const visit = (key: string) => { if (visiting.has(key)) throw new Error('mission_composite_pack_cycle'); if (visited.has(key)) return; visiting.add(key); for (const dependency of graph.get(key) ?? []) visit(dependency); visiting.delete(key); visited.add(key) }
  for (const key of packKeys) visit(key)
}

function aggregate(values: Array<Record<string, unknown>>) {
  const sum = (key: string) => values.reduce((total, value) => total + scaled(String(value[key] ?? '0')), 0n)
  return { currency: 'BRL' as const, aiAndProviderCost: decimal(sum('aiAndProviderCost')), mediaCost: decimal(sum('mediaCost')), humanHours: decimal(sum('humanHours')), humanCost: decimal(sum('humanCost')), totalExecutionCost: decimal(sum('totalExecutionCost')) }
}
function scaled(value: string) { const [whole, fraction = ''] = value.split('.'); return BigInt(whole || '0') * 1_000_000n + BigInt(fraction.slice(0, 6).padEnd(6, '0') || '0') }
function decimal(value: bigint) { const sign=value<0n?'-':'';const absolute=value<0n?-value:value;const whole=absolute/1_000_000n;const fraction=(absolute%1_000_000n).toString().padStart(6,'0').replace(/0+$/,'');return `${sign}${whole}${fraction?`.${fraction}`:''}` }
function namespaced(packKey: string, stepKey: string) { return `${packKey}.${stepKey}` }
function bindingOrder(a: CompositeArtifactBinding,b: CompositeArtifactBinding){return `${a.fromPack}:${a.artifactKey}:${a.toPack}:${a.inputKey}`.localeCompare(`${b.fromPack}:${b.artifactKey}:${b.toPack}:${b.inputKey}`)}
function stable(value: unknown): string { if(Array.isArray(value))return`[${value.map(stable).join(',')}]`;if(value&&typeof value==='object')return`{${Object.entries(value as Record<string,unknown>).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>`${JSON.stringify(key)}:${stable(item)}`).join(',')}}`;return JSON.stringify(value) }
