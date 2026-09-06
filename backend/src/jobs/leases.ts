import { randomUUID } from 'node:crypto'

export const JOB_LEASE_DURATION_MS = 120_000
export const JOB_LEASE_HEARTBEAT_MS = 30_000

export type LeaseClaim = {
  owner: string
  leaseUntil: string
  attempt: number
  stage: string
}

export function createLeaseOwner(scope: string, processId = process.pid) {
  return `${scope}:${processId}:${randomUUID()}`
}

export function startLeaseHeartbeat(
  renew: () => Promise<boolean>,
  intervalMs = JOB_LEASE_HEARTBEAT_MS,
) {
  let stopped = false
  let renewal = Promise.resolve()
  const timer = setInterval(() => {
    if (stopped) return
    renewal = renewal.then(async () => {
      if (!(await renew())) stopped = true
    }).catch(() => {
      stopped = true
    })
  }, intervalMs)
  timer.unref?.()

  return async () => {
    stopped = true
    clearInterval(timer)
    await renewal
  }
}

export function classifyLeaseFailure(error: unknown): 'recoverable' | 'configuration' | 'terminal' {
  const message = error instanceof Error ? error.message : String(error)
  if (/(configuration|required|not_configured|unavailable)/i.test(message)) return 'configuration'
  if (/(invalid|forbidden|unauthorized|schema|payload)/i.test(message)) return 'terminal'
  return 'recoverable'
}
