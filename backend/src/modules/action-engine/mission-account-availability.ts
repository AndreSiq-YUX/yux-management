import type { AppEnv } from '../../config/env.js'
import type { UserRole } from '../../http/request-context.js'
import { resolveWorkspaceContext } from '../workspace/context.js'
import type { CapabilityRegistry } from './capability-registry.js'
import { buildPlatformToolCatalog } from './platform-tool-catalog.js'
import type { Queryable } from './repository.js'

export type MissionAccountAccess = {
  organizationId: string
  contractId: string | null
  role: UserRole
  enabledModules: string[]
  permissions: string[]
}

export type MissionAccountAvailability = {
  authority: 'server'
  organizationId: string
  contractId: string | null
  enabledModules: string[]
  actionAuthorization: 'not_granted_by_snapshot'
  tools: Array<{ key: string; title: string; enabled: boolean; planningAvailable: boolean; blockers: string[] }>
  connections?: Array<{ key: string; status: 'connected' | 'not_connected' | 'unverified' }>
}

export async function resolveMissionAccountAccess(pool: Queryable, config: Pick<AppEnv, 'MISSION_CONVERSATIONS_ENABLED' | 'MISSION_CONVERSATIONS_TENANT_ALLOWLIST'>, input: {
  organizationId: string; actorId: string; contractId?: string | null
}): Promise<MissionAccountAccess> {
  const actor = (await pool.query<{ role: UserRole; is_active: boolean }>(
    'SELECT role,is_active FROM public.app_users WHERE id=$1', [input.actorId],
  )).rows[0]
  if (!actor?.is_active) throw new Error('mission_account_actor_unavailable')
  const workspace = await resolveWorkspaceContext(pool, config, {
    userId: input.actorId, role: actor.role, organizationIds: [input.organizationId], enabledModuleKeys: [],
  }, input.organizationId)
  if (!workspace) throw new Error('mission_account_access_unavailable')
  if (input.contractId && workspace.kind === 'client' && input.contractId !== workspace.contractId) {
    throw new Error('mission_account_contract_unavailable')
  }
  const permissions = await pool.query<{ permission_key: string }>(
    'SELECT permission_key FROM public.role_permissions WHERE role_key = $1 ORDER BY permission_key',
    [workspace.role === 'yux_operator' ? 'yux_manager' : workspace.role],
  )
  return {
    organizationId: input.organizationId, contractId: workspace.contractId, role: workspace.role,
    enabledModules: [...new Set(workspace.moduleKeys.map(normalizeMissionModule))].sort(),
    permissions: permissions.rows.map(row => row.permission_key),
  }
}

export function buildMissionAccountAvailability(registry: CapabilityRegistry, access: MissionAccountAccess, radar: {
  available: boolean; blockers: string[]; moduleEnabled?: boolean
}) {
  const metadata = registry.listMetadata()
  const moduleAllowed = (item: typeof metadata[number]) => item.requiredModules.every(key => access.enabledModules.includes(normalizeMissionModule(key)))
  const permissionAllowed = (item: typeof metadata[number]) => access.role === 'yux_admin' || access.permissions.includes('platform.manage')
    || item.requiredPermissions.every(key => access.permissions.includes(key))
  const capabilities = metadata.filter(item => moduleAllowed(item) && permissionAllowed(item) && (!item.key.startsWith('radar.') || radar.available))
  const catalog = buildPlatformToolCatalog(registry, capabilities.map(item => item.key))
  const snapshot: MissionAccountAvailability = {
    authority: 'server', organizationId: access.organizationId, contractId: access.contractId,
    enabledModules: access.enabledModules, actionAuthorization: 'not_granted_by_snapshot',
    tools: catalog.tools.map(tool => {
      const candidates = metadata.filter(item => item.key.startsWith(`${tool.key}.`))
      const enabled = tool.key === 'radar' && radar.moduleEnabled !== undefined ? radar.moduleEnabled : candidates.some(moduleAllowed)
      const blockers = !enabled ? ['module_not_enabled'] : !candidates.some(item => moduleAllowed(item) && permissionAllowed(item)) ? ['user_not_permitted']
        : tool.key === 'radar' ? radar.blockers : []
      return { key: tool.key, title: tool.title, enabled, planningAvailable: tool.planningAvailable, blockers }
    }),
  }
  return { capabilities, snapshot, catalog }
}

export function normalizeMissionModule(value: string): string {
  return ({ automation: 'automations', marketing_studio: 'campaigns', ads: 'campaigns' } as Record<string, string>)[value] ?? value
}
