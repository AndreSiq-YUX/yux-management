import { useParams } from 'react-router-dom'
import { MissionDetailWorkspace } from '@/components/action-engine/MissionDetailWorkspace'
import { usePlatformStore } from '@/stores/platformStore'

export function MissionDetailPage() {
  const { missionId } = useParams()
  const organization = usePlatformStore(state => state.organization)
  if (!organization || !missionId) return <p className="text-sm text-slate-500">Missão indisponível.</p>
  return <MissionDetailWorkspace missionId={missionId} organizationId={organization.id} backHref="/missions" canWrite showTechnicalProof />
}
