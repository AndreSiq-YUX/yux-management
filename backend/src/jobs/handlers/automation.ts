import type { AppEnv } from '../../config/env.js'
import { dispatchAutomationEvent, executeAutomationRun } from '../../modules/automation/runtime.js'
import type { AutomationJobQueue, RawAutomationEvent } from '../../modules/automation/types.js'

type AutomationJobData = Record<string, unknown> & {
  event?: RawAutomationEvent
  runId?: string
  eventId?: string
  flowId?: string
}

export async function handleAutomationDispatch(
  pool: { query: <T = any>(...args: any[]) => Promise<{ rows: T[]; rowCount?: number | null }> },
  env: AppEnv,
  data: AutomationJobData,
  queue?: AutomationJobQueue,
) {
  const rawEvent = data.event ?? data
  return dispatchAutomationEvent(pool, rawEvent, { env, queue })
}

export async function handleAutomationRun(
  pool: { query: <T = any>(...args: any[]) => Promise<{ rows: T[]; rowCount?: number | null }> },
  env: AppEnv,
  data: AutomationJobData,
) {
  const runId = typeof data.runId === 'string' ? data.runId : ''
  if (!runId) throw new Error('automation_run_id_required')
  return executeAutomationRun(pool, {
    runId,
    eventId: typeof data.eventId === 'string' ? data.eventId : undefined,
    flowId: typeof data.flowId === 'string' ? data.flowId : undefined,
  }, { env })
}
