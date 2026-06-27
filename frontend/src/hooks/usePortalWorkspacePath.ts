import { useCallback } from 'react'
import { usePlatformStore } from '@/stores/platformStore'

export function usePortalWorkspacePath() {
  const mode = usePlatformStore(state => state.mode)
  const organizationId = usePlatformStore(state => state.organization?.id)

  return useCallback((href = '/portal') => {
    if (mode !== 'client_workspace' || !organizationId || !href.startsWith('/portal')) {
      return href
    }

    const suffix = href.slice('/portal'.length)
    return `/client-workspaces/${organizationId}${suffix}`
  }, [mode, organizationId])
}
