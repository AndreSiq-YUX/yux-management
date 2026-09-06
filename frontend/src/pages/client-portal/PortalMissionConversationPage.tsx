import { useParams } from 'react-router-dom'
import { MissionConversationWorkspace } from '@/components/action-engine/MissionConversationWorkspace'
import { usePortalWorkspacePath } from '@/hooks/usePortalWorkspacePath'
import { canManageMissionsInWorkspace } from '@/lib/platform/accessControl'
import { useAuthStore } from '@/stores/authStore'
import { usePlatformStore } from '@/stores/platformStore'
import type { MissionConversationMissingContext } from '@/types/actionEngine'
import { missionMissingCorrectionTarget, resolveCorrectionTarget } from '@/lib/workspace/correctionTargets'

export function PortalMissionConversationPage() {
  const { conversationId } = useParams()
  const organization = usePlatformStore(state => state.organization)
  const role = usePlatformStore(state => state.role)
  const authenticatedRole = useAuthStore(state => state.user?.role)
  const portalPath = usePortalWorkspacePath()
  if (!organization || !conversationId) return <p className="text-sm text-slate-500">Conversa indisponível.</p>
  const correctionTarget = (missing: MissionConversationMissingContext) => {
    const resolved = resolveCorrectionTarget(missionMissingCorrectionTarget({ missing, organizationId: organization.id, conversationId }))
    return resolved.path ? { ...resolved, path: portalPath(resolved.path) } : resolved
  }
  return <MissionConversationWorkspace conversationId={conversationId} organizationId={organization.id} canWrite={canManageMissionsInWorkspace(authenticatedRole, role)} backHref={portalPath('/portal/missoes')} missionHref={id => portalPath(`/portal/missoes/${id}`)} correctionTarget={correctionTarget} />
}
