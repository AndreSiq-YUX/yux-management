import { describe, expect, it } from 'vitest'
import { loadEnv } from '../src/config/env.js'
import { calculateMissionBudgetBurnDown } from '../src/modules/action-engine/budget-alerts.js'
import { buildMissionDecisionSummary } from '../src/modules/action-engine/decision-summary.js'
import { buildSafeDecisionNotificationPayload } from '../src/modules/action-engine/decision-notifications.js'
import { recordDecisionFeedback } from '../src/modules/action-engine/decision-feedback.js'
import { redactSimulationValue } from '../src/modules/action-engine/simulation-reports.js'
import { buildActionEngineNfrSnapshot } from '../src/modules/action-engine/operations-health.js'
import { handleActionEngineDecisionNotification, handleActionEngineDecisionNotificationDispatch } from '../src/jobs/handlers/action-engine.js'

describe('Mission decision experience release boundary', () => {
  it('keeps one exact, understandable and privacy-safe decision subject across review surfaces', async () => {
    const first = summary()
    expect(first.changes.map(change => change.quantity).sort()).toEqual([1, 4])
    expect(first.irreversibleEffects).toHaveLength(1)
    const notification = buildSafeDecisionNotificationPayload({
      mission_title: 'Criar funil e nutrição', recipient_role: 'client_admin', expires_at: '2026-08-24T12:00:00Z',
      mission_id: '00000000-0000-4000-8000-000000000001', requested_payload: { decisionSummary: first },
    })
    expect(notification.href).toContain('/portal/missoes/')
    expect(notification.summary).toContain('custo estimado')
    expect(JSON.stringify(notification)).not.toContain('ana@example.com')
    expect(redactSimulationValue('Contato ana@example.com, +55 43 99999-9999, Bearer secret')).not.toContain('ana@example.com')

    const db = new FeedbackDatabase()
    await recordDecisionFeedback(db as never, {
      organizationId: ids.organization, missionId: ids.mission, approvalId: ids.approval,
      reviewerType: 'external', decision: 'changes_requested', reasonKey: 'cost_too_high',
      comment: 'Revisar com ana@example.com antes de avançar', subjectHash: first.decisionSubjectHash,
    })
    expect(String(db.params?.[8])).toContain('[email removido]')
    expect(db.params?.[9]).toBe(first.decisionSubjectHash)

    const revised = summary({ maximumCostBrl: '400', planRevision: 2 })
    expect(revised.decisionSubjectHash).not.toBe(first.decisionSubjectHash)
    expect(db.params?.[9]).not.toBe(revised.decisionSubjectHash)
  })

  it('reports budget and NFR state without inventing success', () => {
    const budget = calculateMissionBudgetBurnDown({ maximumCostBrl: '500', envelopeVersion: 1, entries: [{ id: 'actual-1', nature: 'actual', amountBrl: '410' }] })
    expect(budget.alertThresholds).toEqual([50, 80])
    expect(budget.remainingCostBrl).toBe('90.000000')
    const health = buildActionEngineNfrSnapshot({ planningLatencyMs: [58_000, 60_000], executionLatencyMs: [20_000, 29_000], executorAvailable: [true, true] })
    expect(health.planningLatencyMs.withinSlo).toBe(true)
    expect(health.executionLatencyMs.withinSlo).toBe(true)
    expect(health.executorAvailableWithinSlo).toBe(true)
  })

  it('supports independent rollback switches without touching persisted history', async () => {
    const env = loadEnv({
      NODE_ENV: 'test', DATABASE_URL: 'postgres://test', SESSION_SECRET: 's'.repeat(32),
      MISSION_DECISIONS_ENABLED: 'false', MISSION_DECISION_NOTIFICATIONS_ENABLED: 'false',
      MISSION_SIMULATION_REPORTS_ENABLED: 'false', MISSION_DECISION_FEEDBACK_ENABLED: 'false',
    })
    expect(env).toMatchObject({
      MISSION_DECISIONS_ENABLED: false, MISSION_DECISION_NOTIFICATIONS_ENABLED: false,
      MISSION_SIMULATION_REPORTS_ENABLED: false, MISSION_DECISION_FEEDBACK_ENABLED: false,
    })
    const failIfTouched = { async query() { throw new Error('history_should_not_be_touched') }, async connect() { throw new Error('history_should_not_be_touched') } }
    const queue = { async add() { throw new Error('queue_should_not_be_touched') } }
    await expect(handleActionEngineDecisionNotification(failIfTouched as never, queue as never, {}, false)).resolves.toEqual({ skipped: 'mission_decision_notifications_disabled' })
    await expect(handleActionEngineDecisionNotificationDispatch(failIfTouched as never, queue as never, {}, false)).resolves.toEqual({ skipped: 'mission_decision_notifications_disabled' })
  })
})

const ids = {
  organization: '00000000-0000-4000-8000-000000000010', mission: '00000000-0000-4000-8000-000000000001', approval: '00000000-0000-4000-8000-000000000020',
}

function summary(overrides: { maximumCostBrl?: string; planRevision?: number } = {}) {
  return buildMissionDecisionSummary({
    headline: 'Criar um funil e uma sequência de nutrição', planRevision: overrides.planRevision ?? 1,
    planHash: (overrides.planRevision === 2 ? 'f' : 'a').repeat(64), manifestHash: 'b'.repeat(64), sourceIds: ['company-context-1'],
    artifacts: [
      { id: 'pipeline', entityType: 'pipeline', operation: 'create', quantity: 1, label: 'funil comercial', version: 1 },
      { id: 'emails', entityType: 'email', operation: 'create', quantity: 4, label: 'e-mails de nutrição', version: 1 },
    ], existingContacts: 0, futureEligibleContacts: true, channels: ['email'], estimatedCostBrl: '340',
    maximumCostBrl: overrides.maximumCostBrl ?? '500', estimatedHumanMinutes: 45,
    capabilityManifest: [
      { key: 'crm.pipeline.create', version: 1, definitionHash: 'c'.repeat(64), effect: 'internal', recoveryKind: 'compensatable' },
      { key: 'email.send', version: 1, definitionHash: 'd'.repeat(64), effect: 'external', recoveryKind: 'irreversible' },
    ], assumptions: [{ key: 'tone', value: 'consultivo', source: 'company_context' }],
  })
}

class FeedbackDatabase {
  params?: unknown[]
  async query(_sql: string, params: unknown[] = []) { this.params = params; return { rows: [{ id: 'evidence-1', created_at: '2026-08-23T00:00:00Z' }] } }
}
