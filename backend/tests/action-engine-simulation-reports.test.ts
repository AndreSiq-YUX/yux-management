import { describe, expect, it } from 'vitest'
import {
  createSimulationReport,
  getPublicSimulationReport,
  getPublicSimulationReportPdf,
  recordSimulationFeedback,
  revokeSimulationReport,
} from '../src/modules/action-engine/simulation-reports.js'

const organizationId = '00000000-0000-4000-8000-000000000001'
const missionId = '00000000-0000-4000-8000-000000000002'
const planId = '00000000-0000-4000-8000-000000000003'
const userId = '00000000-0000-4000-8000-000000000004'

describe('Shadow simulation reports', () => {
  it('creates a redacted immutable PDF and returns the same revision on repeated downloads', async () => {
    const database = new SimulationDatabase(source())
    const created = await createSimulationReport(database as never, {
      organizationId, missionId, planId, createdBy: userId, expiresInDays: 7,
      now: new Date('2026-08-22T12:00:00Z'),
    })
    expect(created.url).toBe(`/mission-simulation/review/${created.token}`)
    expect(created.expiresAt).toBe('2026-08-29T12:00:00.000Z')
    expect(created.snapshot.disclaimer).toContain('nenhum efeito executado')
    expect(JSON.stringify(created.snapshot)).not.toContain('ana@example.com')
    expect(JSON.stringify(created.snapshot)).not.toContain('+5543999999999')
    expect(JSON.stringify(created.snapshot)).not.toContain('wamid.provider-secret')

    const first = await getPublicSimulationReportPdf(database as never, created.token)
    const second = await getPublicSimulationReportPdf(database as never, created.token)
    expect(first.pdf.equals(second.pdf)).toBe(true)
    expect(first.pdf.subarray(0, 4).toString()).toBe('%PDF')
    expect(first.reportHash).toBe(created.reportHash)
  })

  it('permits only a shadow plan owned by the requested tenant', async () => {
    await expect(createSimulationReport(new SimulationDatabase(source({ mode: 'assisted' })) as never, {
      organizationId, missionId, planId, createdBy: userId,
    })).rejects.toThrow('simulation_report_requires_shadow_mode')
    await expect(createSimulationReport(new SimulationDatabase(source(), 'another-org') as never, {
      organizationId, missionId, planId, createdBy: userId,
    })).rejects.toThrow('simulation_plan_not_found')
  })

  it('expires and revokes bearer links without exposing another report by ID alone', async () => {
    const database = new SimulationDatabase(source())
    const created = await createSimulationReport(database as never, { organizationId, missionId, planId, createdBy: userId })
    await expect(getPublicSimulationReport(database as never, `${created.id}.wrong-secret`)).rejects.toThrow('simulation_report_token_invalid')
    database.report!.expires_at = '2020-01-01T00:00:00Z'
    await expect(getPublicSimulationReport(database as never, created.token)).rejects.toThrow('simulation_report_expired')
    database.report!.expires_at = '2099-01-01T00:00:00Z'
    await revokeSimulationReport(database as never, { reportId: created.id, organizationId })
    await expect(getPublicSimulationReport(database as never, created.token)).rejects.toThrow('simulation_report_revoked')
  })

  it('stores external feedback as non-authoritative review evidence', async () => {
    const database = new SimulationDatabase(source())
    const created = await createSimulationReport(database as never, { organizationId, missionId, planId, createdBy: userId })
    const feedback = await recordSimulationFeedback(database as never, created.token, {
      reviewerName: 'Stakeholder externo', decision: 'request_changes', reasonKey: 'cost_too_high',
      comment: 'Revisar o teto antes de avançar.',
    })
    expect(feedback).toMatchObject({ decision: 'request_changes', executionApproved: false })
    expect(database.approvalMutations).toBe(0)
  })
})

function source(overrides: Record<string, unknown> = {}) {
  return {
    mission_title: 'Recuperar ana@example.com', objective: 'Contatar +5543999999999', mode: 'shadow', revision: 1,
    plan_hash: 'a'.repeat(64), pack_content_hash: 'b'.repeat(64), capability_manifest_hash: 'c'.repeat(64),
    requested_payload: {
      decisionSummary: {
        headline: 'Criar funil para ana@example.com e providerReference=wamid.provider-secret',
        changes: [{ quantity: 1, label: '1 funil' }, { quantity: 4, label: '4 e-mails' }],
        contactImpact: { existingContacts: 0, futureEligibleContacts: true, channels: ['email'] },
        economics: { estimatedCostBrl: '340', maximumCostBrl: '500', estimatedHumanMinutes: 45 },
        irreversibleEffects: [{ description: 'E-mails enviados nao podem ser desfeitos.' }],
        assumptions: [{ key: 'tone', value: 'consultivo', source: 'company_context' }],
        technicalProof: { planHash: 'a'.repeat(64), manifestHash: 'c'.repeat(64), sourceCount: 3 },
      },
    },
    ...overrides,
  }
}

class SimulationDatabase {
  report: Record<string, any> | null = null
  approvalMutations = 0
  constructor(private sourceRow: ReturnType<typeof source>, private requiredOrganization = organizationId) {}

  async query(sql: string, params: any[] = []) {
    if (sql.includes('FROM public.action_missions mission')) {
      return { rows: params[1] === this.requiredOrganization ? [this.sourceRow] : [] }
    }
    if (sql.includes('INSERT INTO public.action_simulation_reports (')) {
      this.report = {
        id: params[0], organization_id: params[1], mission_id: params[2], plan_id: params[3],
        token_hash: params[5], report_hash: params[6], snapshot: params[7], pdf_data: params[8],
        expires_at: params[9], revoked_at: null,
      }
      return { rows: [] }
    }
    if (sql.includes('FROM public.action_simulation_reports WHERE id')) {
      return { rows: this.report && this.report.id === params[0] ? [this.report] : [] }
    }
    if (sql.includes('UPDATE public.action_simulation_reports SET revoked_at')) {
      if (!this.report || this.report.id !== params[0] || this.report.organization_id !== params[1]) return { rows: [] }
      this.report.revoked_at = new Date().toISOString()
      return { rows: [{ id: this.report.id }] }
    }
    if (sql.includes('INSERT INTO public.action_simulation_report_feedback')) {
      return { rows: [{ id: 'feedback-1', created_at: '2026-08-22T13:00:00Z' }] }
    }
    if (sql.includes('action_approvals') && /UPDATE|INSERT/.test(sql)) this.approvalMutations += 1
    return { rows: [] }
  }
}
