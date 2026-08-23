import { describe, expect, it } from 'vitest'
import { assertDecisionFeedback, DECISION_REASON_KEYS, exportDecisionFeedbackLearningEvidence, recordDecisionFeedback } from '../src/modules/action-engine/decision-feedback.js'
import { decideActionApproval } from '../src/modules/action-engine/repository.js'

const ids = {
  organization: '00000000-0000-4000-8000-000000000001', mission: '00000000-0000-4000-8000-000000000002',
  approval: '00000000-0000-4000-8000-000000000003', reviewer: '00000000-0000-4000-8000-000000000004',
}
const subjectHash = 'a'.repeat(64)

describe('Action Engine decision feedback', () => {
  it('accepts every stable reason and records multiple reviewers as separate append-only evidence', async () => {
    const db = new FeedbackDatabase()
    for (const reasonKey of DECISION_REASON_KEYS) {
      await recordDecisionFeedback(db as never, {
        organizationId: ids.organization, missionId: ids.mission, approvalId: ids.approval,
        reviewerType: 'external', decision: 'changes_requested', reasonKey,
        comment: reasonKey === 'other' ? 'Outra razão válida' : undefined, subjectHash,
      })
    }
    await recordDecisionFeedback(db as never, {
      organizationId: ids.organization, missionId: ids.mission, approvalId: ids.approval,
      reviewerType: 'authenticated', reviewerUserId: ids.reviewer, decision: 'rejected',
      reasonKey: 'wrong_tone', subjectHash,
    })
    expect(db.inserts).toHaveLength(11)
    expect(db.inserts.filter(params => params[7] === 'wrong_tone')).toHaveLength(2)
  })

  it('enforces the taxonomy, exact subject and explanation for other', () => {
    expect(() => assertDecisionFeedback({ decision: 'rejected', subjectHash })).toThrow('decision_feedback_reason_required')
    expect(() => assertDecisionFeedback({ decision: 'rejected', reasonKey: 'invented', subjectHash })).toThrow('decision_feedback_reason_invalid')
    expect(() => assertDecisionFeedback({ decision: 'rejected', reasonKey: 'other', comment: 'x', subjectHash })).toThrow('decision_feedback_comment_required')
    expect(() => assertDecisionFeedback({ decision: 'support', reasonKey: 'wrong_icp', subjectHash })).toThrow('decision_feedback_reason_not_allowed')
    expect(() => assertDecisionFeedback({ decision: 'rejected', reasonKey: 'wrong_icp', subjectHash: 'b'.repeat(63) })).toThrow('approval_subject_changed')
  })

  it('exports redacted learning themes without reviewer identity', async () => {
    const db = new FeedbackDatabase()
    await recordDecisionFeedback(db as never, {
      organizationId: ids.organization, missionId: ids.mission, approvalId: ids.approval,
      reviewerType: 'authenticated', reviewerUserId: ids.reviewer, decision: 'rejected', reasonKey: 'wrong_tone',
      comment: 'Falar com ana@example.com ou +55 43 99999-9999 usando Bearer secret-token', subjectHash,
    })
    expect(String(db.inserts[0]?.[8])).toContain('[email removido]')
    expect(String(db.inserts[0]?.[8])).toContain('[telefone removido]')
    expect(String(db.inserts[0]?.[8])).toContain('[segredo removido]')
    db.learningRows = [{ id: 'evidence-1', reason_key: 'wrong_tone', comment_redacted: db.inserts[0]?.[8], subject_hash: subjectHash, created_at: '2026-08-22T12:00:00Z' }]
    const evidence = await exportDecisionFeedbackLearningEvidence(db as never, ids.organization)
    expect(evidence.reasonCounts.wrong_tone).toBe(1)
    expect(JSON.stringify(evidence)).not.toContain(ids.reviewer)
    expect(JSON.stringify(evidence)).not.toContain('ana@example.com')
  })

  it('rejects stale plan hashes and prevents plan approval through the generic action endpoint', async () => {
    const stale = new ApprovalDatabase({ subject_hash: subjectHash })
    await expect(decideActionApproval(stale as never, input({ subjectHash: 'b'.repeat(64), decision: 'rejected', reasonKey: 'wrong_icp' }))).rejects.toThrow('approval_subject_changed')
    expect(stale.mutations).toBe(0)
    const generic = new ApprovalDatabase({ subject_hash: subjectHash })
    await expect(decideActionApproval(generic as never, input({ subjectHash, decision: 'approved' }))).rejects.toThrow('plan_approval_requires_version_context')
    expect(generic.mutations).toBe(0)
  })
})

function input(overrides: Record<string, unknown>) { return { approvalId: ids.approval, organizationId: ids.organization, subjectHash, decision: 'rejected' as const, reason: 'Motivo', reasonKey: 'wrong_icp' as const, decidedBy: ids.reviewer, ...overrides } }

class FeedbackDatabase {
  inserts: unknown[][] = []
  learningRows: any[] = []
  async query(sql: string, params: unknown[] = []) {
    if (sql.includes('INSERT INTO public.action_decision_feedback')) { this.inserts.push(params); return { rows: [{ id: `evidence-${this.inserts.length}`, created_at: '2026-08-22T12:00:00Z' }] } }
    if (sql.includes('FROM public.action_decision_feedback')) return { rows: this.learningRows }
    return { rows: [] }
  }
}

class ApprovalDatabase {
  mutations = 0
  private row
  constructor(overrides: Record<string, unknown>) { this.row = { id: ids.approval, run_id: null, plan_id: '00000000-0000-4000-8000-000000000005', mission_id: ids.mission, approval_type: 'plan', status: 'pending', subject_hash: subjectHash, mission_status: 'pending_plan_approval', mission_version: 2, ...overrides } }
  async connect() { return { query: this.query.bind(this), release: () => undefined } }
  async query(sql: string) {
    if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(sql)) return { rows: [] }
    if (sql.includes('FROM public.action_approvals approval')) return { rows: [this.row] }
    if (/UPDATE|INSERT/.test(sql)) this.mutations += 1
    return { rows: [] }
  }
}
