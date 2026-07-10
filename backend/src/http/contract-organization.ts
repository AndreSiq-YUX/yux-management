import type pg from 'pg'

export async function getContractOrganizationId(pool: pg.Pool, contractId: string) {
  const result = await pool.query<{ organization_id: string }>(
    `SELECT o.id AS organization_id
     FROM public.contracts c
     JOIN public.organizations o ON o.client_id = c.client_id
     WHERE c.id = $1
     LIMIT 1`,
    [contractId],
  )
  return result.rows[0]?.organization_id ?? null
}
