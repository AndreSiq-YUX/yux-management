import { describe, expect, it, vi } from 'vitest'
import {
  calculateAutonomyRemaining,
  estimateAutonomousEffectUsage,
  evaluateAutonomousPreflight,
  type AutonomyUsageSnapshot,
} from '../src/modules/action-engine/autonomous-preflight.js'
import { resolveCapabilityDecision } from '../src/modules/action-engine/capability-policy.js'
import { collectAutonomyUsage, releaseAutonomyUsageReservations, reserveAutonomyUsage } from '../src/modules/action-engine/economics.js'
import type { AutonomyGrant } from '../src/modules/action-engine/types.js'

const now = new Date('2026-08-31T12:00:00.000Z')
const activeGrant: AutonomyGrant = {
  id: 'grant-1', organizationId: 'org-1', missionId: 'mission-1', grantVersion: 1, missionVersion: 3,
  envelopeHash: 'a'.repeat(64), status: 'active', startsAt: '2026-08-31T11:00:00.000Z',
  expiresAt: '2026-09-01T12:00:00.000Z', requestedBy: 'user-1', approvedBy: 'user-2',
  approvedAt: '2026-08-31T11:05:00.000Z', createdAt: '2026-08-31T11:00:00.000Z',
  envelope: {
    mode: 'autonomous', allowedModules: ['crm', 'omnichannel'],
    allowedCapabilityKeys: ['crm.pipeline.create_draft', 'email.message.queue'],
    maxTotalCostBrl: '100.00', maxHumanHours: '1.50', maxExternalContacts: 10,
    expiresAt: '2026-09-01T12:00:00.000Z', alwaysRequireApprovalFor: ['destructive'],
  },
}
const emptyUsage: AutonomyUsageSnapshot = {
  costBrl: '0', humanMinutes: '0', externalContacts: 0,
  capabilityCounts: {}, unresolvedExternalEffects: 0,
}

describe('autonomous final preflight', () => {
  it('fails closed when a queued or retried action no longer has an active grant', () => {
    expect(decide({ grant: null })).toMatchObject({ outcome: 'pause', reason: 'autonomy_grant_inactive' })
    expect(decide({ grant: { ...activeGrant, status: 'revoked' } })).toMatchObject({ outcome: 'pause' })
    expect(decide({ grant: { ...activeGrant, expiresAt: now.toISOString() } })).toMatchObject({
      outcome: 'pause', reason: 'autonomy_grant_expired',
    })
  })

  it('allows an exactly consumed limit only for a zero-increment effect and contains the next increment', () => {
    const atLimit = { ...emptyUsage, costBrl: '100', humanMinutes: '90', externalContacts: 10 }
    expect(decide({ usage: atLimit })).toMatchObject({ outcome: 'allow' })
    expect(decide({ usage: atLimit, projected: { costBrl: '0.01' } })).toMatchObject({
      outcome: 'pause', reason: 'autonomy_cost_limit_would_exceed',
    })
    expect(decide({ usage: atLimit, projected: { humanMinutes: '0.01' } })).toMatchObject({
      outcome: 'pause', reason: 'autonomy_human_limit_would_exceed',
    })
    expect(decide({ usage: atLimit, projected: { externalContacts: 1 } })).toMatchObject({
      outcome: 'pause', reason: 'autonomy_contact_limit_would_exceed',
    })
  })

  it('reports the remaining approved allowance without negative values', () => {
    expect(calculateAutonomyRemaining(activeGrant, {
      ...emptyUsage, costBrl: '40', humanMinutes: '30', externalContacts: 3,
    })).toEqual({ costBrl: '60.000000', humanMinutes: '60.00', externalContacts: 7 })
    expect(calculateAutonomyRemaining(activeGrant, {
      ...emptyUsage, costBrl: '101', humanMinutes: '100', externalContacts: 11,
    })).toEqual({ costBrl: '0.000000', humanMinutes: '0.00', externalContacts: 0 })
  })

  it('pauses on an already exceeded ledger and on another unresolved provider effect', () => {
    expect(decide({ usage: { ...emptyUsage, costBrl: '100.000001' } })).toMatchObject({
      outcome: 'pause', reason: 'autonomy_cost_limit_exceeded',
    })
    expect(decide({
      usage: { ...emptyUsage, unresolvedExternalEffects: 1 },
      capability: { key: 'email.message.queue', effect: 'external', requiredModules: ['omnichannel'] },
    })).toMatchObject({ outcome: 'pause', reason: 'autonomy_external_effect_unresolved' })
  })

  it('turns noncritical scope expansion into a one-off exact approval', () => {
    const capability = { key: 'crm.pipeline.publish', effect: 'internal' as const, requiredModules: ['crm'] }
    expect(decide({ capability })).toMatchObject({ outcome: 'approval' })
    expect(decide({ capability, scopeExpansionApproved: true })).toMatchObject({ outcome: 'allow' })
  })

  it('estimates contact and human increments conservatively at the boundary', () => {
    expect(estimateAutonomousEffectUsage('email.message.queue', {})).toEqual({
      costBrl: '0', humanMinutes: '0', externalContacts: 1,
    })
    expect(estimateAutonomousEffectUsage('human.task.create', { estimatedHumanMinutes: '30', estimatedCostBrl: '25.50' })).toEqual({
      costBrl: '25.50', humanMinutes: '30', externalContacts: 0,
    })
  })

  it('keeps grant expiry as defense in depth in capability policy', () => {
    const policy = resolveCapabilityDecision({
      capability: { key: 'crm.pipeline.create_draft', approval: 'never', effect: 'internal' },
      globalKillSwitch: false, requiredConnectionsHealthy: true, legalOrConsentAllowed: true,
      budgetAvailable: true, missionMode: 'autonomous', missionActive: true,
      autonomyGrantRequired: true, autonomyGrantActive: true, autonomyGrantExpiresAt: now.toISOString(), now,
    })
    expect(policy).toMatchObject({ outcome: 'deny', reason: 'autonomy_grant_expired' })
  })

  it('reads cost reservations, human time, contacts, capability counts and unresolved effects together', async () => {
    const query = vi.fn(async (sql: string, params?: unknown[]) => {
      if (sql.includes('action_cost_entries')) return { rows: [{ cost_brl: '42.5', human_minutes: '15' }] }
      if (sql.includes('action_observations')) return { rows: [{ count: 7 }] }
      if (sql.includes("run.status = 'succeeded'")) return { rows: [{ capability_key: 'crm.pipeline.create_draft', count: 2 }] }
      if (sql.includes('action_external_effects')) {
        expect(params).toEqual(['mission-1', 'org-1', 'run-1'])
        return { rows: [{ count: 1 }] }
      }
      throw new Error('unexpected_query')
    })
    await expect(collectAutonomyUsage({ query } as never, 'mission-1', 'org-1', 'run-1')).resolves.toEqual({
      costBrl: '42.5', humanMinutes: '15', externalContacts: 7,
      capabilityCounts: { 'crm.pipeline.create_draft': 2 }, unresolvedExternalEffects: 1,
    })
  })

  it('writes a per-attempt reservation before execution and reverses it exactly once on settlement', async () => {
    const calls: Array<{ sql: string; params?: unknown[] }> = []
    const query = vi.fn(async (sql: string, params?: unknown[]) => {
      calls.push({ sql, params })
      if (sql.includes('INSERT INTO public.action_cost_entries')) return { rows: [{ id: calls.length === 1 ? 'reservation-1' : 'reversal-1' }] }
      if (sql.includes('FROM public.action_cost_entries entry')) return { rows: [{
        id: 'reservation-1', organization_id: 'org-1', mission_id: 'mission-1', run_id: 'run-1', attempt_id: 'attempt-1',
        category: 'external_service', source_type: 'autonomy_preflight', source_record_id: 'attempt-1',
        source_event_key: 'attempt-1:autonomy-usage:reserved', amount_original: '12.5', currency_original: 'BRL',
        exchange_rate_to_brl: '1', amount_brl: '12.5', human_minutes: '0', human_hourly_rate_brl: null,
        metadata: { finalPreflight: true },
      }] }
      throw new Error('unexpected_query')
    })
    const client = { query } as never
    await reserveAutonomyUsage(client, {
      organizationId: 'org-1', missionId: 'mission-1', runId: 'run-1', attemptId: 'attempt-1',
      capabilityKey: 'crm.pipeline.create_draft', costBrl: '12.5', humanMinutes: '0',
    })
    await expect(releaseAutonomyUsageReservations(client, {
      organizationId: 'org-1', runId: 'run-1', reason: 'capability_completed',
    })).resolves.toMatchObject({ released: 1 })
    const inserts = calls.filter(call => call.sql.includes('INSERT INTO public.action_cost_entries'))
    expect(inserts).toHaveLength(2)
    expect(inserts[0]?.params).toContain('reserved')
    expect(inserts[1]?.params).toContain('reversal')
    expect(inserts[1]?.params).toContain('reservation-1')
  })
})

function decide(overrides: Partial<Parameters<typeof evaluateAutonomousPreflight>[0]> = {}) {
  return evaluateAutonomousPreflight({
    missionMode: 'autonomous', grant: activeGrant, usage: emptyUsage,
    capability: { key: 'crm.pipeline.create_draft', effect: 'internal', requiredModules: ['crm'] },
    now, ...overrides,
  })
}
