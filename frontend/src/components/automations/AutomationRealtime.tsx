import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type { AutomationExecutionRun } from '@/types/automation'

interface AutomationRealtimeProps {
  flowId?: string
  onNewExecution?: (run: AutomationExecutionRun) => void
}

export function AutomationRealtime({ flowId, onNewExecution }: AutomationRealtimeProps) {
  useEffect(() => {
    if (!flowId || !onNewExecution) return

    const channel = supabase
      .channel(`automation-executions-${flowId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'automation_execution_runs',
          filter: `flow_id=eq.${flowId}`,
        },
        payload => {
          const run: AutomationExecutionRun = {
            id: payload.new.id,
            status: payload.new.status,
            eventType: payload.new.event_type || undefined,
            leadId: payload.new.lead_id || undefined,
            lastError: payload.new.last_error || undefined,
            startedAt: payload.new.started_at || undefined,
            completedAt: payload.new.completed_at || undefined,
          }
          onNewExecution(run)
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [flowId, onNewExecution])

  return null
}
