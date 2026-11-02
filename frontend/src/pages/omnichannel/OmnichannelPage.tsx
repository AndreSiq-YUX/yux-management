import {useSearchParams} from 'react-router-dom'
import { OmnichannelWorkspace } from '@/components/omnichannel/OmnichannelWorkspace'
import { usePlatformStore } from '@/stores/platformStore'

export function OmnichannelPage() {
  const [params]=useSearchParams()
  const organization = usePlatformStore(state => state.organization)

  return (
    <OmnichannelWorkspace initialConversationId={params.get('conversation')||undefined} organizationId={organization?.id || 'local-yux'} />
  )
}
