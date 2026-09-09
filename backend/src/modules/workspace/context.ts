import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { AppEnv } from '../../config/env.js'
import type { WorkspaceContextV1 } from '../../contracts/generated/workspace.js'
import { requireMembership } from '../../http/guards.js'
import type { RequestContext, UserRole } from '../../http/request-context.js'
import { isMissionConversationRolloutEnabled } from '../action-engine/mission-conversations.js'

type Queryable = {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>
}

type OrganizationContextRow = {
  id: string
  kind: 'yux' | 'client'
  client_id: string | null
  is_internal_growth_workspace: boolean
}

const paramsSchema = z.object({ organizationId: z.string().uuid() })
const internalRoles = new Set<UserRole>(['yux_admin', 'yux_operator'])

export async function resolveWorkspaceContext(
  pool: Queryable,
  config: Pick<AppEnv, 'MISSION_CONVERSATIONS_ENABLED' | 'MISSION_CONVERSATIONS_TENANT_ALLOWLIST'>,
  requestContext: RequestContext,
  organizationId: string,
): Promise<WorkspaceContextV1 | null> {
  const organization = await pool.query<OrganizationContextRow>(
    `SELECT id, kind, client_id, COALESCE(is_internal_growth_workspace, FALSE) AS is_internal_growth_workspace
     FROM public.organizations WHERE id = $1 LIMIT 1`,
    [organizationId],
  )
  const row = organization.rows[0]
  if (!row) return null

  const role = await resolveRole(pool, requestContext, organizationId)
  if (!role) return null
  const permissionRoleKey = role === 'yux_operator' ? 'yux_manager' : role
  const permissions = await pool.query<{ permission_key: string }>(
    `SELECT permission_key FROM public.role_permissions WHERE role_key = $1 ORDER BY permission_key`,
    [permissionRoleKey],
  )
  const permissionKeys = new Set(permissions.rows.map(item => item.permission_key))
  const internal = row.kind === 'yux' || row.is_internal_growth_workspace
  let contractId: string | null = null
  let moduleKeys: string[]
  if (internal) {
    const modules = await pool.query<{ module_key: string }>(
      `SELECT key AS module_key FROM public.platform_modules ORDER BY key`,
    )
    moduleKeys = modules.rows.map(item => item.module_key)
    if (row.client_id) {
      const technicalContract = await pool.query<{ id: string }>(
        `SELECT id FROM public.contracts WHERE client_id = $1 AND status = 'active'
         ORDER BY starts_at DESC, id DESC LIMIT 1`,
        [row.client_id],
      )
      contractId = technicalContract.rows[0]?.id ?? null
    }
  } else {
    const entitlement = await pool.query<{ contract_id: string | null; module_key: string | null }>(
      `SELECT contract.id AS contract_id, module.module_key
       FROM public.organizations organization
       LEFT JOIN LATERAL (
         SELECT candidate.id FROM public.contracts candidate
         WHERE candidate.client_id = organization.client_id AND candidate.status = 'active'
         ORDER BY candidate.starts_at DESC, candidate.id DESC LIMIT 1
       ) contract ON TRUE
       LEFT JOIN public.contract_modules module ON module.contract_id = contract.id AND module.enabled = TRUE
      WHERE organization.id = $1 ORDER BY module.module_key`,
      [organizationId],
    )
    moduleKeys = [...new Set(entitlement.rows.flatMap(item => item.module_key ? [item.module_key] : []))]
    contractId = entitlement.rows[0]?.contract_id ?? null
  }
  const canWrite = permissionKeys.has('platform.manage') || permissionKeys.has('action_engine.write')
  const actionEngineAvailable = internal || moduleKeys.includes('action_engine')
  const missionCreation = resolveMissionCreation(config, organizationId, canWrite, actionEngineAvailable)

  return {
    schemaVersion: 1,
    organizationId,
    kind: internal ? 'internal_growth' : 'client',
    contractId,
    role,
    moduleKeys,
    canConfigure: permissionKeys.has('platform.manage')
      || permissionKeys.has('marketing_studio.configure')
      || permissionKeys.has('omnichannel.configure')
      || permissionKeys.has('automations.write'),
    missionCreation,
  }
}

export function resolveMissionCreation(
  config: Pick<AppEnv, 'MISSION_SUPERVISOR_ENABLED' | 'MISSION_CONVERSATIONS_ENABLED' | 'MISSION_CONVERSATIONS_TENANT_ALLOWLIST'>,
  organizationId: string,
  canWrite: boolean,
  actionEngineAvailable: boolean,
): WorkspaceContextV1['missionCreation'] {
  if (!actionEngineAvailable) return { mode: 'unavailable', reasonCode: 'action_engine_not_entitled' }
  if (!canWrite) return { mode: 'unavailable', reasonCode: 'mission_write_not_permitted' }
  if (config.MISSION_SUPERVISOR_ENABLED === false) return { mode: 'unavailable', reasonCode: 'mission_supervisor_disabled' }
  if (isMissionConversationRolloutEnabled(config, organizationId)) return { mode: 'conversation', reasonCode: null }
  const allowlist = new Set((config.MISSION_CONVERSATIONS_TENANT_ALLOWLIST ?? '').split(',').map(item => item.trim()).filter(Boolean))
  return {
    mode: 'form',
    reasonCode: config.MISSION_CONVERSATIONS_ENABLED === true && allowlist.size > 0
      ? 'mission_conversation_not_allowlisted'
      : 'mission_conversation_disabled',
  }
}

async function resolveRole(pool: Queryable, context: RequestContext, organizationId: string): Promise<UserRole | null> {
  if (internalRoles.has(context.role)) return context.role
  const membership = await pool.query<{ role_key: UserRole }>(
    `SELECT role_key FROM public.memberships WHERE user_id = $1 AND organization_id = $2 LIMIT 1`,
    [context.userId, organizationId],
  )
  return membership.rows[0]?.role_key ?? null
}

export async function registerWorkspaceContextRoutes(app: FastifyInstance) {
  app.get('/organizations/:organizationId/context', async (request, reply) => {
    const params = paramsSchema.safeParse(request.params)
    if (!params.success) return reply.code(400).send({ error: 'invalid_workspace_context_query' })
    const context = requireMembership(request, params.data.organizationId)
    const resolved = await resolveWorkspaceContext(app.pg, app.config, context, params.data.organizationId)
    if (!resolved) return reply.code(404).send({ error: 'workspace_context_not_found' })
    return resolved
  })
}
