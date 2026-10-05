import type pg from 'pg'
import type { AuthUser } from '../../auth/routes.js'

type Queryable = Pick<pg.Pool, 'query'>
type RadarScope = {
  organizationId?: string
  campaignId?: string
  candidateId?: string
  duplicateId?: string
  opportunityId?: string
  opportunityIds?: string[]
}

function forbidden() {
  return Object.assign(new Error('radar_forbidden'), { statusCode: 403 })
}

// Resolve every resource before side effects, including every item of a batch.
// The table names are fixed here, never supplied by an HTTP request.
export async function requireRadarScope(
  pool: Queryable, user: AuthUser, scope: RadarScope, write = false, requireCrm = false,
) {
  if (user.role === 'yux_admin' || user.role === 'yux_operator') return
  if (user.role !== 'client_admin' && user.role !== 'client_member') throw forbidden()
  const organizations = new Set<string>()
  if (scope.organizationId) organizations.add(scope.organizationId)
  const resources: Array<[string, string[]]> = [
    ['radar_campaigns', scope.campaignId ? [scope.campaignId] : []],
    ['radar_candidate_records', scope.candidateId ? [scope.candidateId] : []],
    ['radar_duplicate_candidates', scope.duplicateId ? [scope.duplicateId] : []],
    ['radar_opportunities', scope.opportunityId ? [scope.opportunityId] : scope.opportunityIds ?? []],
  ]
  for (const [table, ids] of resources) {
    if (!ids.length) continue
    const uniqueIds = [...new Set(ids)]
    const result = await pool.query<{ id: string; organization_id: string }>(
      `SELECT id, organization_id FROM public.${table} WHERE id = ANY($1::uuid[])`, [uniqueIds],
    )
    if (result.rows.length !== uniqueIds.length) throw forbidden()
    for (const row of result.rows) {
      if (scope.organizationId && row.organization_id !== scope.organizationId) throw forbidden()
      organizations.add(row.organization_id)
    }
  }
  if (!organizations.size) throw forbidden()
  for (const organizationId of organizations) {
    const result = await pool.query<{ allowed: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM public.organizations organization
         JOIN public.memberships membership ON membership.organization_id = organization.id
           AND membership.user_id = $1
         JOIN public.roles role ON role.key = membership.role_key AND role.scope = 'client'
         JOIN LATERAL (
           SELECT candidate.id FROM public.contracts candidate
           WHERE candidate.client_id = organization.client_id AND candidate.status = 'active'
           ORDER BY candidate.starts_at DESC, candidate.id DESC LIMIT 1
         ) contract ON TRUE
         JOIN public.contract_modules module ON module.contract_id = contract.id
           AND module.module_key = 'radar' AND module.enabled = TRUE
         WHERE organization.id = $2 AND organization.kind = 'client'
           AND EXISTS (SELECT 1 FROM public.role_permissions permission
             WHERE permission.role_key = role.key
               AND (permission.permission_key = $3
                 OR ($3 = 'radar.read' AND permission.permission_key = 'radar:manage')))
           AND ($4::boolean = FALSE OR (
             EXISTS (SELECT 1 FROM public.contract_modules crm
               WHERE crm.contract_id = contract.id AND crm.module_key = 'crm' AND crm.enabled = TRUE)
             AND EXISTS (SELECT 1 FROM public.role_permissions permission
               WHERE permission.role_key = role.key AND permission.permission_key = 'leads.write')))
       ) AS allowed`,
      [user.id, organizationId, write ? 'radar:manage' : 'radar.read', requireCrm],
    )
    if (result.rows[0]?.allowed !== true) throw forbidden()
  }
}
