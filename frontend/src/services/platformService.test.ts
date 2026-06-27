import { afterEach, describe, expect, it, vi } from 'vitest'
import { platformService } from './platformService'

vi.mock('@/services/crmGovernanceService', () => ({
  crmGovernanceService: {},
}))

vi.mock('@/services/growthWorkspaceService', () => ({
  growthWorkspaceService: {},
}))

const fetchMock = vi.fn()

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
}

describe('platformService backend reads', () => {
  afterEach(() => {
    fetchMock.mockReset()
    vi.unstubAllGlobals()
  })

  it('loads platform modules from the backend API', async () => {
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockResolvedValueOnce(jsonResponse([{ key: 'crm', name: 'CRM', base: false }]))

    await expect(platformService.getModules()).resolves.toEqual([{ key: 'crm', name: 'CRM', base: false }])
    expect(fetchMock).toHaveBeenCalledWith('/api/platform/modules', {
      headers: expect.any(Headers),
      credentials: 'include',
    })
  })

  it('loads contracts from the backend API', async () => {
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockResolvedValueOnce(jsonResponse([{ id: 'contract-1', modules: [] }]))

    await expect(platformService.getContracts()).resolves.toEqual([{ id: 'contract-1', modules: [] }])
    expect(fetchMock).toHaveBeenCalledWith('/api/platform/contracts', {
      headers: expect.any(Headers),
      credentials: 'include',
    })
  })

  it('loads blueprints from the backend API', async () => {
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockResolvedValueOnce(jsonResponse([{ id: 'blueprint-1', moduleKeys: ['crm'] }]))

    await expect(platformService.getBlueprints()).resolves.toEqual([{ id: 'blueprint-1', moduleKeys: ['crm'] }])
    expect(fetchMock).toHaveBeenCalledWith('/api/platform/blueprints', {
      headers: expect.any(Headers),
      credentials: 'include',
    })
  })
})
