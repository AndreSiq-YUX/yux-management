import type pg from 'pg'

type Queryable = Pick<pg.Pool, 'query'>

const channelLabel: Record<string, string> = { whatsapp: 'WhatsApp', email: 'e-mail' }

/**
 * A reply ends automated follow-up: active enrollments of sequences configured
 * with `exit_on_reply` move to `manual` so a person (or, later, the agent)
 * continues the conversation. Returns how many enrollments were stopped.
 */
export async function stopSequencesOnReply(db: Queryable, input: { leadId: string; channel: 'whatsapp' | 'email' }) {
  const result = await db.query(
    `UPDATE public.crm_sequence_enrollments enrollment
        SET status = 'manual', next_execution_at = NULL, exit_reason = 'lead_replied',
            manual_note = $2, updated_at = NOW()
       FROM public.crm_sequences sequence
      WHERE enrollment.sequence_id = sequence.id
        AND enrollment.lead_id = $1 AND enrollment.status = 'active'
        AND sequence.exit_on_reply = TRUE
      RETURNING enrollment.id`,
    [input.leadId, `Lead respondeu pelo ${channelLabel[input.channel] ?? input.channel}: sequência encerrada para atendimento.`],
  )
  if (result.rows.length) {
    // Executions already scheduled but not started must not go out after the reply.
    await db.query(
      `UPDATE public.automation_executions SET status = 'cancelled', last_error = 'lead_replied'
        WHERE enrollment_id = ANY($1::uuid[]) AND status = 'pending'`,
      [result.rows.map((row: { id: string }) => row.id)],
    )
  }
  return result.rows.length
}
