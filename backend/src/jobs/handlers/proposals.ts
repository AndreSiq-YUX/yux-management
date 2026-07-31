import type pg from 'pg'

export async function handleProposalConversion(pool: Pick<pg.Pool, 'query'>, proposalId: unknown) {
  if (typeof proposalId !== 'string' || !proposalId) throw new Error('proposalId is required')
  const result = await pool.query<{ result: Record<string, unknown> }>(
    'SELECT public.convert_approved_proposal_service($1) AS result',
    [proposalId],
  )
  return result.rows[0]?.result ?? { proposalId, converted: false }
}
