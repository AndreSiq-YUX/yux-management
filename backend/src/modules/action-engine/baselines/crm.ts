import type { Queryable } from '../repository.js'

export async function collectCrmBaseline(client: Queryable, organizationId: string) {
  const [pipelines, leads] = await Promise.all([
    client.query<{ id: string; name: string; is_default: boolean; is_demo: boolean }>(
      `SELECT id, name, is_default, is_demo FROM public.crm_pipelines
       WHERE organization_id = $1 AND is_active = TRUE ORDER BY name, id`, [organizationId]),
    client.query<{ total: number | string; demo: number | string; inactive: number | string }>(
      `SELECT COUNT(*) FILTER (WHERE is_demo=FALSE)::INT AS total,
              COUNT(*) FILTER (WHERE is_demo=TRUE)::INT AS demo,
              COUNT(*) FILTER (WHERE is_demo=FALSE AND COALESCE(last_activity_at, updated_at, created_at) < NOW() - INTERVAL '30 days')::INT AS inactive
       FROM public.leads WHERE organization_id = $1`, [organizationId]),
  ])
  return {
    available: true,
    pipelineIds: pipelines.rows.filter(row => !row.is_demo).map((row) => row.id).sort(),
    demoPipelineIds: pipelines.rows.filter(row => row.is_demo).map((row) => row.id).sort(),
    pipelineCount: pipelines.rows.filter(row => !row.is_demo).length,
    demoPipelineCount: pipelines.rows.filter(row => row.is_demo).length,
    leadCount: Number(leads.rows[0]?.total ?? 0),
    demoLeadCount: Number(leads.rows[0]?.demo ?? 0),
    inactiveLeadCount: Number(leads.rows[0]?.inactive ?? 0),
  }
}
