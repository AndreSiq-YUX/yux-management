import { Megaphone } from 'lucide-react'
import { PortalPage } from '@/components/client-portal/PortalPage'
import { EmptyState, SkeletonCard } from '@/components/portal-ui'
import { StudioJourney } from '@/components/marketing-studio/StudioJourney'
import { usePlatformStore } from '@/stores/platformStore'

export function PortalMarketingStudioPage() {
  const { error, isLoading, workspaceContext } = usePlatformStore(state => ({
    error: state.error,
    isLoading: state.isLoading,
    workspaceContext: state.workspaceContext,
  }))

  if (isLoading) {
    return (
      <PortalPage eyebrow="Marketing" title="Marketing Studio">
        <SkeletonCard lines={5} />
      </PortalPage>
    )
  }
  if (!workspaceContext) {
    return (
      <PortalPage eyebrow="Marketing" title="Marketing Studio">
        <EmptyState icon={Megaphone} title="Marketing Studio indisponível" description={error || 'O contexto deste workspace não está disponível.'} />
      </PortalPage>
    )
  }
  if (!workspaceContext.moduleKeys.includes('marketing_studio')) {
    return (
      <PortalPage eyebrow="Marketing" title="Marketing Studio">
        <EmptyState icon={Megaphone} title="Módulo não disponível" description="Este módulo não está incluído neste acesso." />
      </PortalPage>
    )
  }
  return <StudioJourney
    key={`${workspaceContext.organizationId}:${workspaceContext.contractId ?? 'no-contract'}`}
    workspaceContext={workspaceContext}
  />
}
