import { useEffect, useState } from 'react'
import type { ActionMission } from '@/types/actionEngine'

export function useMissionDetailRefresh(load: () => Promise<void>, status: ActionMission['status'] | undefined, paused: boolean) {
  const [refreshError, setRefreshError] = useState<string | null>(null)

  useEffect(() => {
    if (paused || !status || !['qualifying', 'planning', 'active', 'evaluating', 'pending_plan_approval', 'pending_replan_approval'].includes(status)) return
    const interval = status === 'pending_plan_approval' || status === 'pending_replan_approval' ? 15000 : 5000
    let cancelled = false
    let timer: number

    async function refresh() {
      try {
        if (document.visibilityState !== 'hidden') {
          await load()
          if (!cancelled) setRefreshError(null)
        }
      } catch {
        if (!cancelled) setRefreshError('Não foi possível atualizar os dados agora. As informações anteriores foram mantidas; tentaremos novamente automaticamente.')
      } finally {
        if (!cancelled) timer = window.setTimeout(() => { void refresh() }, interval)
      }
    }

    timer = window.setTimeout(() => { void refresh() }, interval)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [load, status, paused])

  return refreshError
}
