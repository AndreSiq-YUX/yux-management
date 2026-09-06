import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  JOB_LEASE_DURATION_MS,
  JOB_LEASE_HEARTBEAT_MS,
  classifyLeaseFailure,
  createLeaseOwner,
  startLeaseHeartbeat,
} from '../src/jobs/leases.js'

afterEach(() => {
  vi.useRealTimers()
})

describe('recoverable job leases', () => {
  it('uses the agreed lease and heartbeat windows and unique owners', () => {
    expect(JOB_LEASE_DURATION_MS).toBe(120_000)
    expect(JOB_LEASE_HEARTBEAT_MS).toBe(30_000)
    expect(createLeaseOwner('worker')).not.toBe(createLeaseOwner('worker'))
  })

  it('renews while ownership is retained and stops after ownership is lost', async () => {
    vi.useFakeTimers()
    const renew = vi.fn()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)
    const stop = startLeaseHeartbeat(renew, 10)

    await vi.advanceTimersByTimeAsync(30)
    await stop()

    expect(renew).toHaveBeenCalledTimes(2)
  })

  it('separates retryable, configuration and terminal failures', () => {
    expect(classifyLeaseFailure(new Error('provider timeout'))).toBe('recoverable')
    expect(classifyLeaseFailure(new Error('provider_configuration_required'))).toBe('configuration')
    expect(classifyLeaseFailure(new Error('invalid_payload'))).toBe('terminal')
  })
})
