import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { ReportsWorkspace } from '@/components/reports/ReportsWorkspace'
import { reportService } from '@/services/reportService'
import { usePlatformStore } from '@/stores/platformStore'
import type { OperationalReport } from '@/types/reports'

export function ReportsPage() {
  const organization = usePlatformStore(state => state.organization)
  const organizationId = organization?.id || 'local-yux'
  const [report, setReport] = useState<OperationalReport>()

  const load = useCallback(async () => {
    try {
      setReport(await reportService.getOperationalReport(organizationId))
    } catch (error) {
      console.error('Erro ao carregar relatorios:', error)
      toast.error('Erro ao carregar relatorios')
    }
  }, [organizationId])

  useEffect(() => { load() }, [load])

  if (!report) return <p className="text-sm text-slate-600">Carregando relatorios...</p>
  return <ReportsWorkspace report={report} />
}
