import type pg from 'pg'

type Queryable = Pick<pg.Pool, 'query'>

export const DECISION_REASON_KEYS = [
  'wrong_icp', 'wrong_tone', 'cost_too_high', 'scope_too_broad', 'scope_too_narrow',
  'timing_wrong', 'channel_wrong', 'compliance_risk', 'outcome_wrong', 'other',
] as const

export type DecisionReasonKey = typeof DECISION_REASON_KEYS[number]
export type DecisionFeedbackDecision = 'support' | 'changes_requested' | 'rejected'

export async function recordDecisionFeedback(db: Queryable, input: {
  organizationId: string
  missionId: string
  approvalId: string
  simulationReportId?: string
  reviewerType: 'authenticated' | 'external'
  reviewerUserId?: string
  decision: DecisionFeedbackDecision
  reasonKey?: DecisionReasonKey
  comment?: string
  subjectHash: string
}) {
  assertDecisionFeedback(input)
  const result = await db.query<{ id: string; created_at: string }>(
    `INSERT INTO public.action_decision_feedback (
       organization_id, mission_id, approval_id, simulation_report_id, feedback_version,
       reviewer_type, reviewer_user_id, decision, reason_key, comment_redacted, subject_hash
     ) VALUES ($1,$2,$3,$4,1,$5,$6,$7,$8,$9,$10) RETURNING id, created_at`,
    [input.organizationId, input.missionId, input.approvalId, input.simulationReportId ?? null,
      input.reviewerType, input.reviewerUserId ?? null, input.decision, input.reasonKey ?? null,
      input.comment ? redactLearningComment(input.comment) : null, input.subjectHash],
  )
  if (!result.rows[0]) throw new Error('decision_feedback_not_recorded')
  return { id: result.rows[0].id, version: 1, createdAt: result.rows[0].created_at }
}

export function assertDecisionFeedback(input: { decision?: DecisionFeedbackDecision; reasonKey?: string; comment?: string; subjectHash: string }) {
  if (input.decision !== 'support' && !input.reasonKey) throw new Error('decision_feedback_reason_required')
  if (input.decision === 'support' && input.reasonKey) throw new Error('decision_feedback_reason_not_allowed')
  if (input.reasonKey && !DECISION_REASON_KEYS.includes(input.reasonKey as DecisionReasonKey)) throw new Error('decision_feedback_reason_invalid')
  if (!/^[a-f0-9]{64}$/.test(input.subjectHash)) throw new Error('approval_subject_changed')
  if (input.reasonKey === 'other' && (input.comment?.trim().length ?? 0) < 3) throw new Error('decision_feedback_comment_required')
  if ((input.comment?.length ?? 0) > 2000) throw new Error('decision_feedback_comment_too_long')
}

export async function exportDecisionFeedbackLearningEvidence(db: Queryable, organizationId: string) {
  const result = await db.query<{ id: string; reason_key: DecisionReasonKey | null; comment_redacted: string | null; subject_hash: string; created_at: string }>(
    `SELECT id, reason_key, comment_redacted, subject_hash, created_at
       FROM public.action_decision_feedback WHERE organization_id = $1
      ORDER BY created_at DESC LIMIT 500`,
    [organizationId],
  )
  const reasonCounts = Object.fromEntries(DECISION_REASON_KEYS.map(key => [key, 0])) as Record<DecisionReasonKey, number>
  for (const row of result.rows) if (row.reason_key) reasonCounts[row.reason_key] += 1
  return {
    evidenceVersion: 1, reasonCounts,
    themes: result.rows.filter(row => row.comment_redacted && row.reason_key).map(row => ({
      evidenceId: row.id, reasonKey: row.reason_key, comment: row.comment_redacted,
      subjectHash: row.subject_hash, createdAt: row.created_at,
    })),
  }
}

export function redactLearningComment(value: string) {
  return value.trim().slice(0, 2000)
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email removido]')
    .replace(/\+?\d[\d\s().-]{7,}\d/g, '[telefone removido]')
    .replace(/(?:Bearer\s+|access[_ -]?token[:=]?\s*)[^\s]+/gi, '[segredo removido]')
}
