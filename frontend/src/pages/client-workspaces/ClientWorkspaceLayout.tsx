import { useEffect, useState } from 'react'
import { Link, Navigate, Outlet, useParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { usePlatformStore } from '@/stores/platformStore'

export function ClientWorkspaceLayout() {
  const { organizationId } = useParams()
  const [requestedOrganizationId, setRequestedOrganizationId] = useState<string | null>(null)
  const initializeClientWorkspace = usePlatformStore(state => state.initializeClientWorkspace)
  const {
    activeContract,
    error,
    isLoading,
    organization,
  } = usePlatformStore(state => ({
    activeContract: state.activeContract,
    error: state.error,
    isLoading: state.isLoading,
    organization: state.organization,
  }))

  useEffect(() => {
    if (organizationId) {
      setRequestedOrganizationId(organizationId)
      initializeClientWorkspace(organizationId)
    }
  }, [initializeClientWorkspace, organizationId])

  if (!organizationId) {
    return <Navigate to="/client-workspaces" replace />
  }

  const waitingForWorkspaceContext = !error && organization?.id !== organizationId

  if (isLoading || requestedOrganizationId !== organizationId || waitingForWorkspaceContext) {
    return <p className="text-sm text-gray-600">Carregando workspace do cliente...</p>
  }

  if (error || !organization || organization.id !== organizationId) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-gray-900">Workspace indisponivel</h1>
        <p className="text-sm text-gray-600">{error || 'Cliente nao encontrado para esta URL.'}</p>
        <Button variant="outline" asChild>
          <Link to="/client-workspaces">Selecionar outro cliente</Link>
        </Button>
      </div>
    )
  }

  if (!activeContract && organization.isInternalGrowthWorkspace !== true) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-gray-900">Cliente sem contrato ativo</h1>
        <p className="text-sm text-gray-600">
          {organization.name} precisa de um contrato ativo antes de abrir o workspace operacional.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <Link to="/client-workspaces">Selecionar outro cliente</Link>
          </Button>
          <Button asChild>
            <Link to="/contracts">Revisar contratos</Link>
          </Button>
        </div>
      </div>
    )
  }

  return <Outlet />
}
