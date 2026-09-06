import { StudioJourney } from '@/components/marketing-studio/StudioJourney'
import { usePlatformStore } from '@/stores/platformStore'

export function PortalMarketingStudioPage() {
  const { error, isLoading, workspaceContext } = usePlatformStore(state => ({
    error: state.error,
    isLoading: state.isLoading,
    workspaceContext: state.workspaceContext,
  }))

  if (isLoading) return <p className="text-sm text-slate-600">Carregando Marketing Studio...</p>
  if (!workspaceContext) {
    return <div><h1 className="text-2xl font-semibold text-slate-950">Marketing Studio</h1><p className="mt-2 text-slate-600">{error || 'O contexto deste workspace não está disponível.'}</p></div>
  }
  if (!workspaceContext.moduleKeys.includes('marketing_studio')) {
    return <div><h1 className="text-2xl font-semibold text-slate-950">Marketing Studio</h1><p className="mt-2 text-slate-600">Módulo não disponível para este acesso.</p></div>
  }
  return <StudioJourney
    key={`${workspaceContext.organizationId}:${workspaceContext.contractId ?? 'no-contract'}`}
    workspaceContext={workspaceContext}
  />
}
