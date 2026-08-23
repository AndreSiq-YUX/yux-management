import type { Connectable } from './repository.js'
import {
  claimExternalEffectForReconciliation,
  markExternalEffectUnknown,
  moveExternalEffectToManualReview,
  resolveExternalEffect,
  type ExternalEffect,
} from './external-effects.js'

export type ProviderEffectResolution =
  | { outcome: 'created'; providerReference: string; evidence: Record<string, unknown> }
  | { outcome: 'failed'; evidence: Record<string, unknown> }
  | { outcome: 'still_unknown'; retryAfterSeconds: number; evidence: Record<string, unknown> }

export type ProviderEffectResolver = {
  providerKey: string
  resolve(input: {
    idempotencyKey: string
    providerReference?: string
    requestHash: string
    requestMetadata: Record<string, unknown>
  }): Promise<ProviderEffectResolution>
}

export class ProviderEffectResolverRegistry {
  private readonly resolvers = new Map<string, ProviderEffectResolver>()

  register(resolver: ProviderEffectResolver): this {
    if (!resolver.providerKey.trim()) throw new Error('provider_effect_resolver_key_required')
    if (this.resolvers.has(resolver.providerKey)) throw new Error('provider_effect_resolver_duplicate')
    this.resolvers.set(resolver.providerKey, resolver)
    return this
  }

  get(providerKey: string): ProviderEffectResolver | undefined {
    return this.resolvers.get(providerKey)
  }
}

export type ExternalEffectReconciliationStore = {
  claim(input: { effectId: string; organizationId: string; now: string }): Promise<ExternalEffect | null>
  resolve(input: {
    effectId: string
    organizationId: string
    outcome: 'created' | 'failed'
    providerReference?: string
    evidence: Record<string, unknown>
  }): Promise<ExternalEffect>
  defer(input: {
    effectId: string
    organizationId: string
    errorCode: string
    nextReconcileAt: string
    evidence: Record<string, unknown>
  }): Promise<ExternalEffect>
  manualReview(input: {
    effectId: string
    organizationId: string
    incidentType: string
    summary: string
    evidence: Record<string, unknown>
  }): Promise<ExternalEffect>
}

export function createPostgresExternalEffectReconciliationStore(pool: Connectable): ExternalEffectReconciliationStore {
  return {
    claim: (input) => claimExternalEffectForReconciliation(pool, input),
    resolve: (input) => resolveExternalEffect(pool, input),
    defer: (input) => markExternalEffectUnknown(pool, input),
    manualReview: (input) => moveExternalEffectToManualReview(pool, input),
  }
}

export async function reconcileUnknownEffect(
  store: ExternalEffectReconciliationStore,
  registry: ProviderEffectResolverRegistry,
  input: { effectId: string; organizationId: string; now?: Date },
): Promise<{ outcome: 'skipped' | 'created' | 'failed' | 'deferred' | 'manual_review'; effect?: ExternalEffect }> {
  const now = input.now ?? new Date()
  const effect = await store.claim({ effectId: input.effectId, organizationId: input.organizationId, now: now.toISOString() })
  if (!effect) return { outcome: 'skipped' }

  const resolver = registry.get(effect.providerKey)
  if (!resolver) {
    return {
      outcome: 'manual_review',
      effect: await store.manualReview({
        effectId: effect.id,
        organizationId: effect.organizationId,
        incidentType: 'provider_effect_resolver_unavailable',
        summary: `No reconciliation resolver is registered for ${effect.providerKey}.`,
        evidence: { providerKey: effect.providerKey, requestHash: effect.requestHash },
      }),
    }
  }

  let resolution: ProviderEffectResolution
  try {
    resolution = await resolver.resolve({
      idempotencyKey: effect.providerIdempotencyKey,
      ...(effect.providerReference ? { providerReference: effect.providerReference } : {}),
      requestHash: effect.requestHash,
      requestMetadata: effect.requestMetadata,
    })
  } catch (error) {
    resolution = {
      outcome: 'still_unknown',
      retryAfterSeconds: 60,
      evidence: { resolverError: safeErrorCode(error) },
    }
  }

  if (resolution.outcome === 'created') {
    return {
      outcome: 'created',
      effect: await store.resolve({
        effectId: effect.id,
        organizationId: effect.organizationId,
        outcome: 'created',
        providerReference: resolution.providerReference,
        evidence: resolution.evidence,
      }),
    }
  }
  if (resolution.outcome === 'failed') {
    return {
      outcome: 'failed',
      effect: await store.resolve({
        effectId: effect.id,
        organizationId: effect.organizationId,
        outcome: 'failed',
        evidence: resolution.evidence,
      }),
    }
  }

  const nextReconcileAt = new Date(now.getTime() + clampRetrySeconds(resolution.retryAfterSeconds) * 1_000)
  if (nextReconcileAt.getTime() >= new Date(effect.reconciliationDeadlineAt).getTime()) {
    return {
      outcome: 'manual_review',
      effect: await store.manualReview({
        effectId: effect.id,
        organizationId: effect.organizationId,
        incidentType: 'provider_effect_reconciliation_slo_exceeded',
        summary: `Provider effect remained unknown past ${effect.reconciliationDeadlineAt}.`,
        evidence: resolution.evidence,
      }),
    }
  }
  return {
    outcome: 'deferred',
    effect: await store.defer({
      effectId: effect.id,
      organizationId: effect.organizationId,
      errorCode: 'provider_effect_still_unknown',
      nextReconcileAt: nextReconcileAt.toISOString(),
      evidence: resolution.evidence,
    }),
  }
}

function clampRetrySeconds(value: number): number {
  if (!Number.isFinite(value)) return 60
  return Math.max(5, Math.min(3_600, Math.floor(value)))
}

function safeErrorCode(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 250).replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
}
