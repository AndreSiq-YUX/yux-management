import { describe, expect, it, vi } from 'vitest'
import { createActionEngineCapabilityRegistry } from '../src/modules/action-engine/capabilities/index.js'
import { buildMissionAccountAvailability, resolveMissionAccountAccess } from '../src/modules/action-engine/mission-account-availability.js'
import { resolveRadarMissionAvailability } from '../src/modules/action-engine/radar-pack-registration.js'
import type { Queryable } from '../src/modules/action-engine/repository.js'

function database(role = 'client_admin') {
  const state = { modules: ['crm'], activeContract: 'contract-a', role, radarEnabled: false }
  const query = vi.fn(async (sql: string, params?: unknown[]) => {
    if (sql.includes('FROM public.app_users')) return { rows: [{ role: state.role, is_active: true }] }
    if (sql.includes('AS allowed') && sql.includes('FROM public.organizations')) return { rows: [{ allowed: state.radarEnabled }] }
    if (sql.includes('FROM public.organizations') && sql.includes('COALESCE')) return { rows: [{ id: params?.[0], kind: 'client', client_id: 'client-a', is_internal_growth_workspace: false }] }
    if (sql.includes('FROM public.memberships')) return { rows: [{ role_key: state.role }] }
    if (sql.includes('FROM public.role_permissions')) return { rows: (state.role === 'client_member' ? ['crm.read'] : ['crm.read', 'crm.write', 'action_engine.write']).map(permission_key => ({ permission_key })) }
    if (sql.includes('LEFT JOIN LATERAL')) return { rows: state.modules.map(module_key => ({ contract_id: state.activeContract, module_key })) }
    throw new Error(`unexpected availability query: ${sql}`)
  })
  return { state, query: query as unknown as Queryable['query'], queryMock: query }
}

describe('authoritative mission account availability', () => {
  it.each(['yux_admin', 'yux_operator', 'client_admin', 'client_member'])('resolves actual account modules for %s without accepting a module list from the client', async role => {
    const db = database(role)
    const access = await resolveMissionAccountAccess(db, {}, { organizationId: 'org-a', actorId: 'actor', contractId: 'contract-a' })
    const result = buildMissionAccountAvailability(createActionEngineCapabilityRegistry(), access, { available: false, blockers: ['integration_not_enabled'] })
    expect(result.snapshot).toMatchObject({ authority: 'server', organizationId: 'org-a', contractId: 'contract-a', enabledModules: ['crm'] })
    expect(result.snapshot.tools.find(tool => tool.key === 'radar')).toMatchObject({ enabled: false, planningAvailable: false })
    expect(result.capabilities.some(item => item.key.startsWith('campaign.'))).toBe(false)
    expect(result.capabilities.some(item => item.key === 'crm.pipeline.create_draft')).toBe(role !== 'client_member')
  })

  it('rechecks current modules on the next turn and rejects stale or foreign contracts', async () => {
    const db = database()
    expect((await resolveMissionAccountAccess(db, {}, { organizationId: 'org-a', actorId: 'actor' })).enabledModules).toEqual(['crm'])
    db.state.modules = ['crm', 'automations']
    expect((await resolveMissionAccountAccess(db, {}, { organizationId: 'org-a', actorId: 'actor' })).enabledModules).toEqual(['automations', 'crm'])
    await expect(resolveMissionAccountAccess(db, {}, { organizationId: 'org-a', actorId: 'actor', contractId: 'contract-other' })).rejects.toThrow('mission_account_contract_unavailable')
  })

  it('does not substitute client assertions for a failed configuration query', async () => {
    const db = database()
    db.queryMock.mockRejectedValueOnce(new Error('database unavailable'))
    await expect(resolveMissionAccountAccess(db, {}, { organizationId: 'org-a', actorId: 'actor' })).rejects.toThrow('database unavailable')
  })

  it('distinguishes an enabled module from an unavailable Radar integration', async () => {
    const db = database('yux_admin'); db.state.modules = ['crm', 'radar']; db.state.radarEnabled = true
    const access = await resolveMissionAccountAccess(db, {}, { organizationId: 'org-a', actorId: 'actor' })
    const radar = await resolveRadarMissionAvailability(db, { RADAR_ACTION_ENGINE_ENABLED: true, RADAR_ACTION_ENGINE_TENANT_ALLOWLIST: 'org-other' }, 'org-a', 'actor')
    expect(radar).toMatchObject({ available: false, blockers: ['integration_not_enabled_for_account'] })
    const { snapshot, capabilities } = buildMissionAccountAvailability(createActionEngineCapabilityRegistry(), access, radar)
    expect(snapshot.tools.find(tool => tool.key === 'radar')).toMatchObject({ enabled: true, planningAvailable: false, blockers: ['integration_not_enabled_for_account'] })
    expect(capabilities.some(item => item.key.startsWith('radar.'))).toBe(false)
    const enabled = await resolveRadarMissionAvailability(db, { RADAR_ACTION_ENGINE_ENABLED: true, RADAR_ACTION_ENGINE_TENANT_ALLOWLIST: 'org-a' }, 'org-a', 'actor')
    expect(buildMissionAccountAvailability(createActionEngineCapabilityRegistry(), access, enabled).snapshot.tools.find(tool => tool.key === 'radar')?.planningAvailable).toBe(true)
  })
})
