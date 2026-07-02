import { useEffect, useState } from 'react'
import { Link, Navigate, Outlet, useParams } from 'react-router-dom'
import { ArrowLeftRight, Building2, Settings2, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { statusLabel } from '@/lib/client-portal/portalDisplay'
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

  if (!activeContract) {
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

  const isYuxGrowthWorkspace = organization.isInternalGrowthWorkspace

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-yux-100 bg-yux-50 p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="flex items-start gap-3">
            {isYuxGrowthWorkspace
              ? <Sparkles className="mt-0.5 h-5 w-5 text-yux-700" />
              : <Building2 className="mt-0.5 h-5 w-5 text-yux-700" />}
            <div>
              <p className="text-xs font-medium uppercase text-yux-700">
                {isYuxGrowthWorkspace ? 'Operando Crescimento YUX' : 'Operando como cliente'}
              </p>
              <h1 className="mt-1 text-xl font-semibold text-gray-900">
                {isYuxGrowthWorkspace ? 'Crescimento YUX' : organization.name}
              </h1>
              <p className="mt-1 text-sm text-gray-600">
                {activeContract.name || 'Contrato ativo'} - {statusLabel(activeContract.status)}
              </p>
              {isYuxGrowthWorkspace && (
                <p className="mt-1 max-w-3xl text-sm text-gray-700">
                  Workspace operacional interno com CRM, Atendimento & IA, Marketing Studio e relatorios conectados aos Strategy Packs, harness e RAG governados no Admin.
                </p>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {isYuxGrowthWorkspace && (
              <Button variant="outline" asChild>
                <Link to="/admin/strategy-engine">
                  <Settings2 className="mr-2 h-4 w-4" />
                  Governar Strategy Engine
                </Link>
              </Button>
            )}
            <Button variant="outline" asChild>
              <Link to="/client-workspaces">
                <ArrowLeftRight className="mr-2 h-4 w-4" />
                Trocar workspace
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <Outlet />
    </div>
  )
}
