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
    return <p className="text-sm text-gray-600">Carregando automacoes...</p>
  }

  if (!workspaceContext) {
    return (
      <div className="space-y-3">
        <h1 className="text-2xl font-bold text-gray-900">Automacoes</h1>
        <p className="text-gray-600">{error || 'O contexto deste workspace nao esta disponivel.'}</p>
      </div>
    )
  }

  if (!workspaceContext.moduleKeys.includes('automations')) {
    return (
      <div className="space-y-3">
        <h1 className="text-2xl font-bold text-gray-900">Automacoes</h1>
        <p className="text-gray-600">Modulo nao disponivel para este acesso.</p>
      </div>
    )
  }

  return <AutomationsPage workspaceContext={workspaceContext} initialSection={section} />
}
