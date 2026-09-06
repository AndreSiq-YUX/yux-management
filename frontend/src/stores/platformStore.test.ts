import { beforeEach, describe, expect, it, vi } from 'vitest'
import { platformService } from '@/services/platformService'
import { usePlatformStore } from './platformStore'

const organizationId = '650e8400-e29b-41d4-a716-446655440001'
const clientId = '550e8400-e29b-41d4-a716-44665544a001'
const contractId = '660e8400-e29b-41d4-a716-44665544a001'

describe('platformStore internal growth workspace', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    usePlatformStore.setState({
      mode: 'internal',
      organization: null,
      membership: null,
      role: null,
      enabledModuleKeys: [],
      activeContract: null,
      portalContractContext: { contract: null, enabledModuleKeys: [] },
      isLoading: false,
      error: null,
      roles: [],
      packages: [],
      workspaceContext: null,
    })
  })

  it('keeps the provisioned contract when opening Crescimento YUX', async () => {
    vi.spyOn(platformService, 'getOrganizations').mockResolvedValue([{
      id: organizationId,
      clientId,
      name: 'YUX Solucoes em IA',
      slug: 'yux',
      kind: 'yux',
      isInternalGrowthWorkspace: true,
      workspacePurpose: 'yux_growth',
      strategyPackScope: 'internal',
      createdAt: '',
      updatedAt: '',
    }])
    vi.spyOn(platformService, 'getRoles').mockResolvedValue([{
      key: 'yux_admin',
      name: 'YUX Admin',
      scope: 'internal',
      permissions: ['platform.manage'],
    }])
    vi.spyOn(platformService, 'getWorkspaceContext').mockResolvedValue({
      schemaVersion: 1,
      organizationId,
      kind: 'internal_growth',
      contractId,
      role: 'yux_admin',
      moduleKeys: ['action_engine', 'marketing_studio', 'whatsapp_ai'],
      canConfigure: true,
      missionCreation: { mode: 'conversation', reasonCode: null },
    })
    vi.spyOn(platformService, 'getPortalContractContextForClient').mockResolvedValue({
      contract: {
        id: contractId,
        clientId,
        packageId: '770e8400-e29b-41d4-a716-44665544a001',
        status: 'active',
        startsAt: '2026-07-01',
        billingCycle: 'monthly',
        package: null,
        modules: [],
        createdAt: '',
        updatedAt: '',
      },
      enabledModuleKeys: ['marketing_studio'],
    })

    await usePlatformStore.getState().initializeClientWorkspace(organizationId)

    expect(platformService.getPortalContractContextForClient).toHaveBeenCalledWith(clientId)
    expect(usePlatformStore.getState()).toMatchObject({
      mode: 'client_workspace',
      organization: { id: organizationId, isInternalGrowthWorkspace: true },
      activeContract: { id: contractId, clientId },
    })
    expect(usePlatformStore.getState().enabledModuleKeys).toContain('marketing_studio')
    expect(usePlatformStore.getState().workspaceContext?.missionCreation.mode).toBe('conversation')
  })

  it('resolves the authenticated operator through the platform manager role', async () => {
    vi.spyOn(platformService, 'getOrganizations').mockResolvedValue([{
      id: organizationId,
      name: 'YUX Solucoes em IA',
      slug: 'yux',
      kind: 'yux',
      isInternalGrowthWorkspace: true,
      createdAt: '',
      updatedAt: '',
    }])
    vi.spyOn(platformService, 'getRoles').mockResolvedValue([{
      key: 'yux_manager',
      name: 'YUX Manager',
      scope: 'internal',
      permissions: ['action_engine.write', 'omnichannel.configure'],
    }])
    vi.spyOn(platformService, 'getWorkspaceContext').mockResolvedValue({
      schemaVersion: 1,
      organizationId,
      kind: 'internal_growth',
      contractId: null,
      role: 'yux_operator',
      moduleKeys: ['action_engine', 'whatsapp_ai'],
      canConfigure: true,
      missionCreation: { mode: 'conversation', reasonCode: null },
    })

    await usePlatformStore.getState().initializeClientWorkspace(organizationId)

    expect(usePlatformStore.getState()).toMatchObject({
      role: { key: 'yux_manager' },
      workspaceContext: { role: 'yux_operator' },
      enabledModuleKeys: ['action_engine', 'whatsapp_ai'],
    })
  })

  it('initializes the internal operator session without requiring a nonexistent yux_operator platform role', async () => {
    const organization = {
      id: organizationId, name: 'YUX Solucoes em IA', slug: 'yux', kind: 'yux' as const,
      isInternalGrowthWorkspace: true, createdAt: '', updatedAt: '',
    }
    const managerRole = {
      key: 'yux_manager', name: 'YUX Manager', scope: 'internal' as const,
      permissions: ['action_engine.write' as const, 'omnichannel.configure' as const],
    }
    vi.spyOn(platformService, 'getOrganizations').mockResolvedValue([organization])
    vi.spyOn(platformService, 'getRoles').mockResolvedValue([managerRole])
    vi.spyOn(platformService, 'getMembershipsForUser').mockResolvedValue([])
    vi.spyOn(platformService, 'getPackages').mockResolvedValue([])
    vi.spyOn(platformService, 'getPortalContractContextForUser').mockResolvedValue({ contract: null, enabledModuleKeys: [] })
    vi.spyOn(platformService, 'getWorkspaceContext').mockResolvedValue({
      schemaVersion: 1, organizationId, kind: 'internal_growth', contractId: null,
      role: 'yux_operator', moduleKeys: ['action_engine', 'whatsapp_ai'], canConfigure: true,
      missionCreation: { mode: 'conversation', reasonCode: null },
    })

    await usePlatformStore.getState().initializeForUser('operator-user', 'manager')

    expect(usePlatformStore.getState()).toMatchObject({
      organization: { id: organizationId },
      role: { key: 'yux_manager' },
      workspaceContext: { role: 'yux_operator' },
    })
  })
})
