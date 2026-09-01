import { useParams } from 'react-router-dom'
import { MissionConversationWorkspace } from '@/components/action-engine/MissionConversationWorkspace'
import { usePlatformStore } from '@/stores/platformStore'

export function MissionConversationPage() {
  const { conversationId } = useParams()
  const organization = usePlatformStore(state => state.organization)
  if (!organization || !conversationId) return <p className="text-sm text-slate-500">Conversa indisponível.</p>
  return <MissionConversationWorkspace conversationId={conversationId} organizationId={organization.id} canWrite backHref="/missions" missionHref={id => `/missions/${id}`} />
}
