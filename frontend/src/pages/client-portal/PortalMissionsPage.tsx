import { MissionsWorkspace } from '@/components/action-engine/MissionsWorkspace'
import { usePortalWorkspacePath } from '@/hooks/usePortalWorkspacePath'
import { useAuthStore } from '@/stores/authStore'
import { usePlatformStore } from '@/stores/platformStore'

export function PortalMissionsPage() {
  const organization = usePlatformStore(state => state.organization)
  const contractId = usePlatformStore(state => state.activeContract?.id)
  const role = useAuthStore(state => state.user?.role)
  const portalPath = usePortalWorkspacePath()
  if (!organization) return <p className="text-sm text-slate-500">Carregando workspace...</p>
  return <MissionsWorkspace organizationId={organization.id} contractId={contractId} canWrite={role !== 'client'} detailHref={id => portalPath(`/portal/missoes/${id}`)} />
}
