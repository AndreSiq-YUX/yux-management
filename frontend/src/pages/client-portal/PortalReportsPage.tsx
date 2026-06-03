import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { PortalReportsWorkspace } from '@/components/reports/PortalReportsWorkspace'
import { reportService } from '@/services/reportService'
import { usePlatformStore } from '@/stores/platformStore'
import type { PortalOperationalReport } from '@/types/reports'

export function PortalReportsPage() {
  const organization = usePlatformStore(state => state.organization)
  const organizationId = organization?.id || 'local-yux'
  const [report, setReport] = useState<PortalOperationalReport>()

  const load = useCallback(async () => {
    try {
      setReport(await reportService.getPortalReport(organizationId))
    } catch (error) {
      console.error('Erro ao carregar relatorios do portal:', error)
      toast.error('Erro ao carregar relatorios')
    }
  }, [organizationId])

  useEffect(() => { load() }, [load])

  if (!report) return <p className="text-sm text-slate-600">Carregando relatorios...</p>
  return <PortalReportsWorkspace report={report} />
}
