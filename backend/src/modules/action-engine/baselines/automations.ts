import type { Queryable } from '../repository.js'

export async function collectAutomationsBaseline(client: Queryable, organizationId: string) {
  const result = await client.query<{ id: string; status: string; is_enabled: boolean }>(
    `SELECT id, status, is_enabled FROM public.automation_flows
     WHERE organization_id = $1 AND status <> 'archived' ORDER BY id`, [organizationId],
  )
  return {
    available: true,
    flowIds: result.rows.map((row) => row.id).sort(),
    total: result.rows.length,
    enabled: result.rows.filter((row) => row.is_enabled && row.status === 'published').length,
  }
}
