import type { AuthUser } from '../../auth/routes.js'
import type { ProfileDb } from './record-profile.js'

export async function loadProfileSummaries(
  db: ProfileDb,
  user: AuthUser,
  leadIds: string[],
) {
  if (!leadIds.length) return new Map<string, unknown>()
  const result = await db.query<{
    id: string
    record_type_name: string | null
    fields: unknown[]
  }>(
    `
    SELECT l.id, rt.name AS record_type_name, COALESCE(jsonb_agg(jsonb_build_object(
      'key', d.stable_key, 'label', d.label, 'fieldType', d.field_type,
      'value', v.value, 'isHighlighted', d.is_highlighted
    ) ORDER BY d.order_index, d.label) FILTER (WHERE d.id IS NOT NULL), '[]'::jsonb) AS fields
    FROM public.leads l
    LEFT JOIN public.crm_record_types rt ON rt.id=l.record_type_id AND rt.crm_instance_id=l.crm_instance_id
    LEFT JOIN LATERAL (
      SELECT * FROM (SELECT DISTINCT ON (stable_key) * FROM public.crm_custom_field_definitions
        WHERE crm_instance_id=l.crm_instance_id ORDER BY stable_key, version_number DESC) current_field
      WHERE is_active AND (record_type_id IS NULL OR record_type_id=l.record_type_id)
    ) d ON TRUE
    LEFT JOIN public.lead_custom_field_values v ON v.lead_id=l.id AND v.organization_id=l.organization_id
      AND v.field_key=d.stable_key AND jsonb_typeof(v.value) IN ('string','number','boolean','null')
    WHERE l.id=ANY($1::uuid[]) AND ($3::boolean OR EXISTS (
      SELECT 1 FROM public.crm_instance_members m JOIN public.memberships membership
        ON membership.user_id=m.user_id AND membership.organization_id=l.organization_id
      WHERE m.crm_instance_id=l.crm_instance_id AND m.user_id=$2 AND m.status='active'
        AND (m.role IN ('client_admin','yux_admin') OR l.owner_member_id=m.id
          OR l.owner_id=$2 OR l.assigned_to=$2 OR (m.role='manager' AND EXISTS (
            SELECT 1 FROM public.crm_team_members tm WHERE tm.team_id=l.team_id AND tm.member_id=m.id AND tm.role='manager')))
    )) GROUP BY l.id, rt.name`,
    [leadIds, user.id, ['yux_admin', 'yux_operator'].includes(user.role)],
  )
  return new Map(
    result.rows.map((row) => [
      row.id,
      { recordTypeName: row.record_type_name, fields: row.fields },
    ]),
  )
}
