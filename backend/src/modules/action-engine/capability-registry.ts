import type { ZodType } from 'zod'
import type { DomainEventActor } from '../events/types.js'

export type CapabilityRisk = 'read_only' | 'low' | 'medium' | 'high'
export type CapabilityEffect = 'none' | 'internal' | 'external'
export type CapabilityIdempotency = 'none' | 'supported' | 'required'

export type CapabilityContext = {
  organizationId: string
  missionId: string
  actor: DomainEventActor
  idempotencyKey: string
  dryRun: boolean
  query: <TRow = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<{ rows: TRow[]; rowCount?: number | null }>
  commands?: {
    createTask?: (input: Record<string, unknown>) => Promise<unknown>
    assignLeadOwner?: (input: Record<string, unknown>) => Promise<unknown>
    executeAutomation?: (input: Record<string, unknown>) => Promise<unknown>
    enrollSequence?: (input: Record<string, unknown>) => Promise<unknown>
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
  execute(context: CapabilityContext, input: TInput): Promise<CapabilityResult<TOutput>>
}

export type CapabilityMetadata = Omit<CapabilityDefinition, 'inputSchema' | 'outputSchema' | 'execute'> & {
  inputSchema: Record<string, unknown>
  outputSchema: Record<string, unknown>
}

export class CapabilityRegistry {
  private readonly definitions = new Map<string, CapabilityDefinition>()

  register<TInput, TOutput>(definition: CapabilityDefinition<TInput, TOutput>): this {
    if (!definition.key.trim() || !Number.isInteger(definition.version) || definition.version < 1) {
      throw new Error('capability_identity_invalid')
    }
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
