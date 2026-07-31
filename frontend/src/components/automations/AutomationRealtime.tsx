import { useEffect } from 'react'
import { automationService } from '@/services/automationService'
import type { AutomationExecutionRun } from '@/types/automation'

interface AutomationRealtimeProps {
  flowId?: string
  onNewExecution?: (run: AutomationExecutionRun) => void
}

export function AutomationRealtime({ flowId, onNewExecution }: AutomationRealtimeProps) {
  useEffect(() => {
    if (!flowId || !onNewExecution) return

    let cancelled = false
    let initialized = false
    const seenRunIds = new Set<string>()

    const poll = async () => {
      try {
        const runs = await automationService.getFlowExecutionRuns(flowId)
        if (cancelled) return

        const newRuns = runs.filter(run => !seenRunIds.has(run.id))
        runs.forEach(run => seenRunIds.add(run.id))

        if (initialized) {
          newRuns.reverse().forEach(run => onNewExecution(run as AutomationExecutionRun))
        }
        initialized = true
      } catch (error) {
        console.warn('Nao foi possivel atualizar execucoes de automacao:', error)
      }
    }

    void poll()
    const intervalId = window.setInterval(() => void poll(), 5000)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [flowId, onNewExecution])

  return null
}
