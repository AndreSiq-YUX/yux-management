import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { MissionIntake } from './MissionIntake'
import { MissionDashboard } from './MissionDashboard'
import { actionEngineService } from '@/services/actionEngineService'
import type { ActionMission, MissionEconomics } from '@/types/actionEngine'

export function MissionsWorkspace({ organizationId, contractId, canWrite, detailHref }: { organizationId: string; contractId?: string; canWrite: boolean; detailHref: (id: string) => string }) {
  const [missions, setMissions] = useState<ActionMission[]>([])
  const [economics, setEconomics] = useState<Record<string, MissionEconomics>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [intakeOpen, setIntakeOpen] = useState(false)

  useEffect(() => {
    let active = true
    setLoading(true); setError(null)
    actionEngineService.listMissions(organizationId).then(async data => {
      if (!active) return
      setMissions(data)
      const results = await Promise.allSettled(data.map(mission => actionEngineService.getEconomics(mission.id, organizationId)))
      if (!active) return
      setEconomics(Object.fromEntries(results.flatMap((result, index) => result.status === 'fulfilled' ? [[data[index].id, result.value]] : [])))
    }).catch(cause => { if (active) setError(cause instanceof Error ? cause.message : 'Não foi possível carregar as missões.') }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [organizationId])

  if (loading) return <div className="grid min-h-72 place-items-center"><Loader2 className="h-6 w-6 animate-spin text-[#2563EB]" /></div>
  if (error) return <div className="border border-red-200 bg-red-50 p-5 text-sm text-red-700">{error}</div>
  return <><MissionDashboard missions={missions} economicsByMission={economics} detailHref={detailHref} canCreate={canWrite} onCreate={() => setIntakeOpen(true)} /><MissionIntake open={intakeOpen} organizationId={organizationId} contractId={contractId} canWrite={canWrite} onOpenChange={setIntakeOpen} onCreated={mission => setMissions(current => [mission, ...current])} /></>
}
