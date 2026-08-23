import type { Queryable } from '../repository.js'

export async function collectCampaignsBaseline(client: Queryable, organizationId: string) {
  const result = await client.query<{ id: string; provider: string; lifecycle_status: string }>(
    `SELECT id, provider, lifecycle_status FROM public.campaigns
     WHERE organization_id = $1 AND lifecycle_status <> 'archived' ORDER BY id`, [organizationId],
  )
  return {
    available: true,
    campaignIds: result.rows.map((row) => row.id).sort(),
    total: result.rows.length,
    active: result.rows.filter((row) => row.lifecycle_status === 'active').length,
    providers: [...new Set(result.rows.map((row) => row.provider).filter(Boolean))].sort(),
  }
}
