import { describe, expect, it, vi } from 'vitest'
import {
  ProviderEffectResolverRegistry,
  reconcileUnknownEffect,
  type ExternalEffectReconciliationStore,
} from '../src/modules/action-engine/provider-reconciliation.js'
import type { ExternalEffect } from '../src/modules/action-engine/external-effects.js'

const effect: ExternalEffect = {
  id: 'effect-1', organizationId: 'org-1', missionId: 'mission-1', runId: 'run-1',
  capabilityKey: 'campaign.create_paused', capabilityVersion: 1, providerKey: 'meta',
  providerIdempotencyKey: 'provider-key', requestHash: 'a'.repeat(64), requestMetadata: { account: 'masked' },
  status: 'reconciling', outcomeEvidence: {}, reconciliationDeadlineAt: '2026-08-22T12:15:00.000Z',
  createdAt: '2026-08-22T12:00:00.000Z', updatedAt: '2026-08-22T12:00:00.000Z',
}

function store() {
  return {
    claim: vi.fn(async () => effect),
    resolve: vi.fn(async (input: Parameters<ExternalEffectReconciliationStore['resolve']>[0]): Promise<ExternalEffect> => ({
      ...effect, status: input.outcome === 'created' ? 'confirmed_created' : 'confirmed_failed',
    })),
    defer: vi.fn(async (): Promise<ExternalEffect> => ({ ...effect, status: 'unknown' })),
    manualReview: vi.fn(async (): Promise<ExternalEffect> => ({ ...effect, status: 'manual_review' })),
  } satisfies ExternalEffectReconciliationStore
}

describe('Provider effect reconciliation', () => {
  it('resolves unknown to created using the stable provider key', async () => {
    const persistence = store()
    const resolver = vi.fn(async () => ({ outcome: 'created' as const, providerReference: 'campaign-42', evidence: { state: 'PAUSED' } }))
    const registry = new ProviderEffectResolverRegistry().register({ providerKey: 'meta', resolve: resolver })

    const result = await reconcileUnknownEffect(persistence, registry, {
      effectId: effect.id, organizationId: effect.organizationId, now: new Date('2026-08-22T12:01:00.000Z'),
    })

    expect(result.outcome).toBe('created')
    expect(resolver).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: 'provider-key', requestHash: 'a'.repeat(64) }))
    expect(persistence.resolve).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'created', providerReference: 'campaign-42' }))
  })

  it('defers still-unknown effects without fabricating failure', async () => {
    const persistence = store()
    const registry = new ProviderEffectResolverRegistry().register({
      providerKey: 'meta',
      async resolve() { return { outcome: 'still_unknown', retryAfterSeconds: 30, evidence: { lookup: 'empty' } } },
    })
    const result = await reconcileUnknownEffect(persistence, registry, {
      effectId: effect.id, organizationId: effect.organizationId, now: new Date('2026-08-22T12:01:00.000Z'),
    })
    expect(result.outcome).toBe('deferred')
    expect(persistence.defer).toHaveBeenCalledWith(expect.objectContaining({
      errorCode: 'provider_effect_still_unknown', nextReconcileAt: '2026-08-22T12:01:30.000Z',
    }))
  })

  it('opens manual review after the deadline or without a resolver', async () => {
    const expiredStore = store()
    const registry = new ProviderEffectResolverRegistry().register({
      providerKey: 'meta',
      async resolve() { return { outcome: 'still_unknown', retryAfterSeconds: 60, evidence: {} } },
    })
    const expired = await reconcileUnknownEffect(expiredStore, registry, {
      effectId: effect.id, organizationId: effect.organizationId, now: new Date('2026-08-22T12:14:30.000Z'),
    })
    expect(expired.outcome).toBe('manual_review')
    expect(expiredStore.manualReview).toHaveBeenCalledWith(expect.objectContaining({ incidentType: 'provider_effect_reconciliation_slo_exceeded' }))

    const missingStore = store()
    const missing = await reconcileUnknownEffect(missingStore, new ProviderEffectResolverRegistry(), {
      effectId: effect.id, organizationId: effect.organizationId,
    })
    expect(missing.outcome).toBe('manual_review')
    expect(missingStore.manualReview).toHaveBeenCalledWith(expect.objectContaining({ incidentType: 'provider_effect_resolver_unavailable' }))
  })
})
