import type { Queryable } from '../repository.js'

export async function collectCrmBaseline(client: Queryable, organizationId: string) {
  const [pipelines, leads] = await Promise.all([
    client.query<{ id: string; name: string; is_default: boolean }>(
      `SELECT id, name, is_default FROM public.crm_pipelines
       WHERE organization_id = $1 AND is_active = TRUE ORDER BY name, id`, [organizationId]),
    client.query<{ total: number | string; inactive: number | string }>(
      `SELECT COUNT(*)::INT AS total,
              COUNT(*) FILTER (WHERE COALESCE(last_activity_at, updated_at, created_at) < NOW() - INTERVAL '30 days')::INT AS inactive
       FROM public.leads WHERE organization_id = $1`, [organizationId]),
  ])
  return {
    available: true,
    pipelineIds: pipelines.rows.map((row) => row.id).sort(),
    pipelineCount: pipelines.rows.length,
    leadCount: Number(leads.rows[0]?.total ?? 0),
    inactiveLeadCount: Number(leads.rows[0]?.inactive ?? 0),
  }
}
