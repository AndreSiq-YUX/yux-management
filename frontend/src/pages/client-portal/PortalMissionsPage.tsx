import { MissionsWorkspace } from '@/components/action-engine/MissionsWorkspace'
import { usePortalWorkspacePath } from '@/hooks/usePortalWorkspacePath'
import { canManageMissions } from '@/lib/platform/accessControl'
import { usePlatformStore } from '@/stores/platformStore'

export function PortalMissionsPage() {
  const organization = usePlatformStore(state => state.organization)
  const contractId = usePlatformStore(state => state.activeContract?.id)
  const role = usePlatformStore(state => state.role)
  const portalPath = usePortalWorkspacePath()
  if (!organization) return <p className="text-sm text-slate-500">Carregando workspace...</p>
  return <MissionsWorkspace organizationId={organization.id} contractId={contractId} canWrite={canManageMissions(role)} detailHref={id => portalPath(`/portal/missoes/${id}`)} />
}
