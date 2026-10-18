import { PortalPage } from '@/components/client-portal/PortalPage'
import { EmptyState, ErrorState, SkeletonCard, SkeletonKpiGrid } from '@/components/portal-ui'
import { AutomationsPage } from '@/pages/automations/AutomationsPage'
import { usePlatformStore } from '@/stores/platformStore'

type PortalAutomationSection = 'Automacoes' | 'Templates' | 'Execucoes'

export function PortalAutomationsPage({ section }: { section: PortalAutomationSection }) {
  const { error, isLoading, workspaceContext } = usePlatformStore(state => ({
    error: state.error,
    isLoading: state.isLoading,
    workspaceContext: state.workspaceContext,
  }))

  if (isLoading) {
    return (
      <div className="grid gap-6">
        <SkeletonKpiGrid count={3} />
        <SkeletonCard lines={4} />
      </div>
    )
  }

  if (!workspaceContext) {
    return (
      <PortalPage eyebrow="Automações" title="Automações">
        <ErrorState title="Não foi possível abrir as automações" description={error || 'O contexto deste workspace não está disponível.'} />
      </PortalPage>
    )
  }

  if (!workspaceContext.moduleKeys.includes('automations')) {
    return (
      <PortalPage eyebrow="Automações" title="Automações">
        <EmptyState title="Módulo não disponível para este acesso" description="As automações não fazem parte do plano contratado. Fale com a equipe YUX para incluí-las." />
      </PortalPage>
    )
  }

  return <AutomationsPage variant="portal" workspaceContext={workspaceContext} initialSection={section} />
}
