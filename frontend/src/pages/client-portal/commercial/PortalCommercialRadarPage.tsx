import { RadarWorkspace } from '@/components/radar/RadarWorkspace'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { usePortalWorkspacePath } from '@/hooks/usePortalWorkspacePath'

export function PortalCommercialRadarPage() {
  const {campaignId}=useParams(),location=useLocation(),navigate=useNavigate(),workspacePath=usePortalWorkspacePath()
  const screen=location.pathname.endsWith('/nova')?'new':!campaignId?'list':location.pathname.endsWith('/configuracoes')?'configuration':location.pathname.endsWith('/historico')?'history':'results'
  return <RadarWorkspace key={`${campaignId??'list'}-${screen}`} screen={screen} campaignId={campaignId}
    onNavigate={path=>navigate(workspacePath(`/portal/comercial/radar${path?`/${path}`:''}`))}/>
}
