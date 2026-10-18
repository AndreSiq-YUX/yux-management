import { useParams } from 'react-router-dom'
import { MissionDetailWorkspace } from '@/components/action-engine/MissionDetailWorkspace'
import { ErrorState } from '@/components/portal-ui'
import { usePortalWorkspacePath } from '@/hooks/usePortalWorkspacePath'
import { canManageMissionsInWorkspace } from '@/lib/platform/accessControl'
import { useAuthStore } from '@/stores/authStore'
import { usePlatformStore } from '@/stores/platformStore'

export function PortalMissionDetailPage() {
  const { missionId } = useParams()
  const organization = usePlatformStore(state => state.organization)
  const role = usePlatformStore(state => state.role)
  const authenticatedRole = useAuthStore(state => state.user?.role)
  const portalPath = usePortalWorkspacePath()
  if (!organization || !missionId) return <ErrorState title="Missão indisponível." description="Volte para a lista de missões e abra o item novamente." />
  return <MissionDetailWorkspace missionId={missionId} organizationId={organization.id} backHref={portalPath('/portal/missoes')} canWrite={canManageMissionsInWorkspace(authenticatedRole, role)} />
}
