import { MissionsWorkspace } from '@/components/action-engine/MissionsWorkspace'
import { usePlatformStore } from '@/stores/platformStore'

export function MissionsPage() {
  const organization = usePlatformStore(state => state.organization)
  if (!organization) return <p className="text-sm text-slate-500">Carregando organização YUX...</p>
  return <MissionsWorkspace organizationId={organization.id} canWrite detailHref={id => `/missions/${id}`} conversationHref={id => `/missions/conversations/${id}`} />
}
