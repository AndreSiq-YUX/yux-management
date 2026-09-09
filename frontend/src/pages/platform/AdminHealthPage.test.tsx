import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { adminPlatformService } from '@/services/adminPlatformService'
import type { OperationalHealthSnapshot } from '@/types/adminPlatform'
import { AdminHealthPage } from './AdminHealthPage'

const snapshot: OperationalHealthSnapshot = {
  status: 'ok',
  measuredAt: '2026-09-09T12:00:00.000Z',
  windows: { workerHeartbeatSeconds: 30, workerStaleAfterSeconds: 90, interactiveMaxWaitTargetMs: 5_000 },
  workers: [{
    instanceId: 'worker-current', queueClasses: ['interactive'], status: 'ok',
    startedAt: '2026-09-09T11:00:00.000Z', lastSeenAt: '2026-09-09T12:00:00.000Z', metadata: {},
  }],
  workerHistory: { heartbeatRowCount: 2, replacedHeartbeatCount: 1 },
  queues: [{
    queueClass: 'interactive', name: 'yux-interactive', status: 'ok',
    counts: { waiting: 2, active: 1, delayed: 0, failed: 0, prioritized: 0 }, oldestPendingAgeMs: 200, reason: null,
  }],
  outbox: { pendingCount: 3, abandonedLeases: 0, terminalFailures: 0, configurationFailures: 0, oldestPendingAgeSeconds: 4 },
  harness: { status: 'ok', reason: null, checkedAt: '2026-09-09T12:00:00.000Z' },
  providers: [],
  usage: [],
}

afterEach(() => {
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('AdminHealthPage', () => {
  it('loads and renders the operational snapshot together with the existing admin signals', async () => {
    vi.spyOn(adminPlatformService, 'getOperationalHealth').mockResolvedValue(snapshot)
    vi.spyOn(adminPlatformService, 'getProviderConnections').mockResolvedValue([])
    vi.spyOn(adminPlatformService, 'getUsageCounters').mockResolvedValue([])
    vi.spyOn(adminPlatformService, 'getAuditEvents').mockResolvedValue([])
    const root = createRoot(document.body.appendChild(document.createElement('div')))

    await act(async () => {
      root.render(<AdminHealthPage />)
      await new Promise(resolve => setTimeout(resolve, 0))
    })

    expect(adminPlatformService.getOperationalHealth).toHaveBeenCalledOnce()
    expect(document.body.textContent).toContain('Operação em tempo real')
    expect(document.body.textContent).toContain('Workers atuais')
    expect(document.body.textContent).toContain('1 substituído')
    expect(document.body.textContent).toContain('Filas BullMQ')
    expect(document.body.textContent).toContain('Outbox')
    expect(document.body.textContent).toContain('Harness')
    root.unmount()
  })

  it('shows an explicit unavailable state when only the operational endpoint fails', async () => {
    vi.spyOn(adminPlatformService, 'getOperationalHealth').mockRejectedValue(new Error('offline'))
    vi.spyOn(adminPlatformService, 'getProviderConnections').mockResolvedValue([])
    vi.spyOn(adminPlatformService, 'getUsageCounters').mockResolvedValue([])
    vi.spyOn(adminPlatformService, 'getAuditEvents').mockResolvedValue([])
    const root = createRoot(document.body.appendChild(document.createElement('div')))

    await act(async () => {
      root.render(<AdminHealthPage />)
      await new Promise(resolve => setTimeout(resolve, 0))
    })

    expect(document.body.textContent).toContain('Diagnóstico operacional indisponível')
    expect(document.body.textContent).toContain('Nenhum provedor em falha')
    root.unmount()
  })
})
