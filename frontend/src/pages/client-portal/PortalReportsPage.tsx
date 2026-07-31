import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { PortalReportsWorkspace } from '@/components/reports/PortalReportsWorkspace'
import { reportService } from '@/services/reportService'
import { usePlatformStore } from '@/stores/platformStore'
import type { PortalOperationalReport } from '@/types/reports'

export function PortalReportsPage() {
  const organization = usePlatformStore(state => state.organization)
  const activeContract = usePlatformStore(state => state.activeContract)
  const isPlatformLoading = usePlatformStore(state => state.isLoading)
  const organizationId = activeContract && organization?.kind === 'client' ? organization.id : undefined
  const [report, setReport] = useState<PortalOperationalReport>()

  const load = useCallback(async () => {
    if (isPlatformLoading || !organizationId) return

    try {
      setReport(await reportService.getPortalReport(organizationId))
    } catch (error) {
      console.error('Erro ao carregar relatorios do portal:', error)
      toast.error('Erro ao carregar relatorios')
    }
  }, [isPlatformLoading, organizationId])

  useEffect(() => { load() }, [load])

  if (isPlatformLoading) return <p className="text-sm text-slate-600">Carregando relatorios...</p>
  if (!activeContract || !organizationId) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-slate-950">Relatorios</h1>
        <p className="mt-2 text-slate-600">Nenhum contrato ativo encontrado para este usuario.</p>
      </div>
    )
  }

  if (!report) return <p className="text-sm text-slate-600">Carregando relatorios...</p>
  return <PortalReportsWorkspace report={report} />
}
