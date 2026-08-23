import type { ZodType } from 'zod'
import type { DomainEventActor } from '../events/types.js'
import type { MissionMode } from './types.js'

export type CapabilityRisk = 'read_only' | 'low' | 'medium' | 'high'
export type CapabilityEffect = 'none' | 'draft' | 'internal' | 'external' | 'destructive'
export type CapabilityIdempotency = 'none' | 'supported' | 'required'

export type CapabilityContext = {
  organizationId: string
  missionId: string
  actor: DomainEventActor
  idempotencyKey: string
  dryRun: boolean
  mutationLease?: string
  fencingToken?: string
  query: <TRow = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<{ rows: TRow[]; rowCount?: number | null }>
  commands?: {
    createTask?: (input: Record<string, unknown>) => Promise<unknown>
    cancelTask?: (input: Record<string, unknown>) => Promise<unknown>
    assignLeadOwner?: (input: Record<string, unknown>) => Promise<unknown>
    executeAutomation?: (input: Record<string, unknown>) => Promise<unknown>
    pauseAutomation?: (input: Record<string, unknown>) => Promise<unknown>
    enrollSequence?: (input: Record<string, unknown>) => Promise<unknown>
    pauseSequenceEnrollment?: (input: Record<string, unknown>) => Promise<unknown>
    queueEmail?: (input: Record<string, unknown>) => Promise<unknown>
    queueWhatsapp?: (input: Record<string, unknown>) => Promise<unknown>
  }
}

export type CapabilityResult<TOutput = unknown> = {
  output: TOutput
  effectProduced: boolean
  sourceRecords?: Array<{ type: string; id: string }>
  costHints?: Array<{ category: string; amount: string; currency: string }>
}

export type CapabilityRecovery<TOutput = unknown> =
  | { kind: 'compensatable'; compensate: (context: CapabilityContext, result: TOutput) => Promise<CapabilityResult> }
  | { kind: 'pausable'; contain: (context: CapabilityContext, result: TOutput) => Promise<CapabilityResult> }
  | { kind: 'irreversible'; incidentType: string }

export type CapabilityReadinessContext = {
  organizationId: string
  missionId: string
  mode: MissionMode
  allowedModules: string[]
}

export type CapabilityReadiness = {
  ready: boolean
  blockers: Array<{ code: string; message: string; fixHref?: string }>
}

export type CapabilityDefinition<TInput = unknown, TOutput = unknown> = {
  key: string
  version: number
  title: string
  description: string
  risk: CapabilityRisk
  effect: CapabilityEffect
  approval: 'never' | 'risk_based' | 'always'
  idempotency: CapabilityIdempotency
  inputSchema: ZodType<TInput>
  outputSchema: ZodType<TOutput>
  requiredModules: string[]
  requiredConnections: string[]
  domain?: string
  requiredPermissions?: string[]
  supportsModes?: readonly MissionMode[]
  readiness?: (context: CapabilityReadinessContext, input: TInput) => Promise<CapabilityReadiness>
  recovery: CapabilityRecovery<TOutput>
  execute(context: CapabilityContext, input: TInput): Promise<CapabilityResult<TOutput>>
}

export type CapabilityDefinitionV2<TInput = unknown, TOutput = unknown> = CapabilityDefinition<TInput, TOutput> & {
  domain: string
  requiredPermissions: string[]
  supportsModes: readonly MissionMode[]
  readiness: (context: CapabilityReadinessContext, input: TInput) => Promise<CapabilityReadiness>
}

export type CapabilityMetadata = Omit<CapabilityDefinition, 'inputSchema' | 'outputSchema' | 'execute' | 'recovery'> & {
  domain: string
  requiredPermissions: string[]
  supportsModes: readonly MissionMode[]
  inputSchema: Record<string, unknown>
  outputSchema: Record<string, unknown>
  recoveryKind: CapabilityRecovery['kind']
  incidentType?: string
}

export class CapabilityRegistry {
  private readonly definitions = new Map<string, CapabilityDefinition>()

  register<TInput, TOutput>(definition: CapabilityDefinition<TInput, TOutput>): this {
    if (!definition.key.trim() || !Number.isInteger(definition.version) || definition.version < 1) {
      throw new Error('capability_identity_invalid')
    }
    assertRecovery(definition.recovery)
    const identity = capabilityIdentity(definition.key, definition.version)
    if (this.definitions.has(identity)) throw new Error('capability_duplicate')
    this.definitions.set(identity, definition as CapabilityDefinition)
    return this
  }

  get(key: string, version: number): CapabilityDefinition {
    const definition = this.definitions.get(capabilityIdentity(key, version))
    if (!definition) throw new Error('capability_not_found')
    return definition
  }

  listMetadata(): CapabilityMetadata[] {
    return [...this.definitions.values()]
      .sort((left, right) => capabilityIdentity(left.key, left.version).localeCompare(capabilityIdentity(right.key, right.version)))
      .map((definition) => ({
        key: definition.key,
        version: definition.version,
        title: definition.title,
        description: definition.description,
        risk: definition.risk,
        effect: definition.effect,
        approval: definition.approval,
        idempotency: definition.idempotency,
        requiredModules: [...definition.requiredModules],
        requiredConnections: [...definition.requiredConnections],
        domain: definition.domain ?? definition.key.split('.')[0] ?? 'system',
        requiredPermissions: [...(definition.requiredPermissions ?? [])].sort(),
        supportsModes: [...(definition.supportsModes ?? ['shadow','prepare','assisted','autonomous'])],
        recoveryKind: definition.recovery.kind,
        ...(definition.recovery.kind === 'irreversible' ? { incidentType: definition.recovery.incidentType } : {}),
        inputSchema: schemaMetadata(definition.inputSchema),
        outputSchema: schemaMetadata(definition.outputSchema),
      }))
  }

  async invoke(key: string, version: number, context: CapabilityContext, rawInput: unknown): Promise<CapabilityResult> {
    const definition = this.get(key, version)
    const input = definition.inputSchema.safeParse(rawInput)
    if (!input.success) throw new Error('capability_input_invalid')
    if (definition.idempotency === 'required' && !context.idempotencyKey.trim()) {
      throw new Error('capability_idempotency_key_required')
    }
    const result = await definition.execute(context, input.data)
    const output = definition.outputSchema.safeParse(result.output)
    if (!output.success) throw new Error('capability_output_invalid')
    return { ...result, output: output.data }
  }

  async recover(key: string, version: number, context: CapabilityContext, rawResult: unknown): Promise<CapabilityResult> {
    const definition = this.get(key, version)
    const output = definition.outputSchema.safeParse(rawResult)
    if (!output.success) throw new Error('capability_recovery_result_invalid')
    if (definition.recovery.kind === 'irreversible') {
      throw new Error(`capability_irreversible:${definition.recovery.incidentType}`)
    }
    if (definition.recovery.kind === 'pausable') return definition.recovery.contain(context, output.data)
    return definition.recovery.compensate(context, output.data)
  }
}

export function registerCapability<TInput, TOutput>(
  registry: CapabilityRegistry,
  definition: CapabilityDefinition<TInput, TOutput>,
): CapabilityRegistry {
  return registry.register(definition)
}

export function getCapability(registry: CapabilityRegistry, key: string, version: number) {
  return registry.get(key, version)
}

export function listCapabilityMetadata(registry: CapabilityRegistry) {
  return registry.listMetadata()
}

function capabilityIdentity(key: string, version: number): string {
  return `${key.trim()}@${version}`
}

function schemaMetadata(schema: ZodType): Record<string, unknown> {
  const candidate = schema as ZodType & { toJSONSchema?: () => Record<string, unknown> }
  return candidate.toJSONSchema?.() ?? { type: 'unknown' }
}

export function noEffectRecovery<TOutput>(): CapabilityRecovery<TOutput> {
  return {
    kind: 'compensatable',
    async compensate() {
      return { output: { recovered: true, effect: 'none' }, effectProduced: false }
    },
  }
}

function assertRecovery<TOutput>(value: CapabilityRecovery<TOutput> | undefined): asserts value is CapabilityRecovery<TOutput> {
  if (!value || typeof value !== 'object') throw new Error('capability_recovery_invalid')
  if (value.kind === 'compensatable' && typeof value.compensate === 'function') return
  if (value.kind === 'pausable' && typeof value.contain === 'function') return
  if (value.kind === 'irreversible' && typeof value.incidentType === 'string' && value.incidentType.trim()) return
  throw new Error('capability_recovery_invalid')
}
