import { afterEach, describe, expect, it, vi } from 'vitest'
import { render } from '@/components/portal-ui/__tests__/render'
import { PortalCompanyUsersPage } from './PortalCompanyUsersPage'
import { usePlatformStore } from '@/stores/platformStore'

afterEach(() => { vi.unstubAllGlobals(); usePlatformStore.setState({ organization: null, isLoading: false, enabledModuleKeys: [] }) })
describe('PortalCompanyUsersPage account access', () => {
  it('loads account members without requiring a CRM contract', async () => {
    usePlatformStore.setState({ organization: { id: 'organization-1', clientId: 'client-1', name: 'Mali Massas', kind: 'client', slug: 'mali', createdAt: '', updatedAt: '' }, isLoading: false, enabledModuleKeys: [] })
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ members: [], canManage: true }))))
    const { container, unmount } = await render(<PortalCompanyUsersPage />)
    try {
      expect(container.textContent).toContain('Convidar usuário')
      expect(fetch).toHaveBeenCalledWith('/api/workspace/client-accounts/client-1/members', expect.anything())
      expect(container.textContent).not.toContain('em implantação')
    } finally { await unmount() }
  })
})
