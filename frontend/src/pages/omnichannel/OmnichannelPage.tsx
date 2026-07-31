import { OmnichannelWorkspace } from '@/components/omnichannel/OmnichannelWorkspace'
import { usePlatformStore } from '@/stores/platformStore'

export function OmnichannelPage() {
  const organization = usePlatformStore(state => state.organization)

  return (
    <OmnichannelWorkspace organizationId={organization?.id || 'local-yux'} />
  )
}
