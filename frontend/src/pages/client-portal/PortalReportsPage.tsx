import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { BarChart3 } from 'lucide-react'
import { EmptyState, ErrorState, PageHeader, SkeletonCard, SkeletonKpiGrid } from '@/components/portal-ui'
import { PortalReportsWorkspace } from '@/components/reports/PortalReportsWorkspace'
import { reportService } from '@/services/reportService'
import { usePlatformStore } from '@/stores/platformStore'
import type { PortalOperationalReport } from '@/types/reports'

function ReportsLoading() {
  return (
    <div className="w-full space-y-6" aria-busy="true">
      <PageHeader title="Relatórios" lead="Carregando seus resultados…" />
      <SkeletonKpiGrid count={6} />
      <SkeletonCard lines={5} />
    </div>
  )
}

export function PortalReportsPage() {
  const organization = usePlatformStore(state => state.organization)
  const activeContract = usePlatformStore(state => state.activeContract)
  const isPlatformLoading = usePlatformStore(state => state.isLoading)
  const organizationId = activeContract && organization?.kind === 'client' ? organization.id : undefined
  const [report, setReport] = useState<PortalOperationalReport>()
  const [error, setError] = useState(false)

  const load = useCallback(async () => {
    if (isPlatformLoading || !organizationId) return

    setError(false)
    try {
      setReport(await reportService.getPortalReport(organizationId))
    } catch (cause) {
      console.error('Erro ao carregar relatorios do portal:', cause)
      setError(true)
      toast.error('Erro ao carregar relatórios')
    }
  }, [isPlatformLoading, organizationId])

  useEffect(() => { void load() }, [load])

  if (isPlatformLoading) return <ReportsLoading />

  if (!activeContract || !organizationId) {
    return (
      <div className="w-full space-y-6">
        <PageHeader title="Relatórios" />
        <EmptyState
          icon={BarChart3}
          title="Nenhum contrato ativo"
          description="Não encontramos um contrato ativo para a sua conta. Quando ele estiver ativo, os relatórios aparecem aqui."
        />
      </div>
    )
  }

  if (error) {
    return (
      <div className="w-full space-y-6">
        <PageHeader title="Relatórios" />
        <ErrorState title="Não foi possível carregar os relatórios." description="Verifique sua conexão e tente de novo." onRetry={() => void load()} />
      </div>
    )
  }

  if (!report) return <ReportsLoading />
  return <PortalReportsWorkspace report={report} />
}
