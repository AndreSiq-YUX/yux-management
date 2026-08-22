import { useParams } from 'react-router-dom'
import { MissionDetailWorkspace } from '@/components/action-engine/MissionDetailWorkspace'
import { usePortalWorkspacePath } from '@/hooks/usePortalWorkspacePath'
import { useAuthStore } from '@/stores/authStore'
import { usePlatformStore } from '@/stores/platformStore'

export function PortalMissionDetailPage() {
  const { missionId } = useParams()
  const organization = usePlatformStore(state => state.organization)
  const role = useAuthStore(state => state.user?.role)
  const portalPath = usePortalWorkspacePath()
  if (!organization || !missionId) return <p className="text-sm text-slate-500">Missão indisponível.</p>
  return <MissionDetailWorkspace missionId={missionId} organizationId={organization.id} backHref={portalPath('/portal/missoes')} canWrite={role !== 'client'} />
}
