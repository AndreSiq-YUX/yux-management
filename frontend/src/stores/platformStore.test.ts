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
  })
})
