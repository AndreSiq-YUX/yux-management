import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ActionMission } from '@/types/actionEngine'
import { useMissionDetailRefresh } from './useMissionDetailRefresh'

let root: Root

beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
  const container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  document.body.innerHTML = ''
  vi.useRealTimers()
  vi.restoreAllMocks()
})

function Harness({ load, status = 'pending_plan_approval', paused = false }: { load: () => Promise<void>; status?: ActionMission['status']; paused?: boolean }) {
  const error = useMissionDetailRefresh(load, status, paused)
  return <div>{error ?? 'Dados da missão preservados'}</div>
}

async function advance(ms: number) {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms) })
}

describe('mission detail refresh', () => {
  it('polls pending decisions less often, skips hidden tabs and pauses during a user command', async () => {
    const load = vi.fn().mockResolvedValue(undefined)
    act(() => root.render(<Harness load={load} />))
    await advance(14999)
    expect(load).not.toHaveBeenCalled()
    await advance(1)
    expect(load).toHaveBeenCalledTimes(1)
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    await advance(30000)
    expect(load).toHaveBeenCalledTimes(1)
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    act(() => root.render(<Harness load={load} paused />))
    await advance(30000)
    expect(load).toHaveBeenCalledTimes(1)
    act(() => root.render(<Harness load={load} />))
    await advance(15000)
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('never overlaps slow refreshes and keeps the five second cadence while processing', async () => {
    let finish!: () => void
    const load = vi.fn().mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve })).mockResolvedValue(undefined)
    act(() => root.render(<Harness load={load} status="active" />))
    await advance(5000)
    await advance(30000)
    expect(load).toHaveBeenCalledTimes(1)
    await act(async () => { finish(); await Promise.resolve() })
    await advance(4999)
    expect(load).toHaveBeenCalledTimes(1)
    await advance(1)
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('handles a background failure without discarding data and clears the notice after recovery', async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error('Rate limit exceeded')).mockResolvedValue(undefined)
    act(() => root.render(<Harness load={load} />))
    await advance(15000)
    expect(document.body.textContent).toContain('As informações anteriores foram mantidas')
    expect(document.body.textContent).not.toContain('Rate limit exceeded')
    await advance(15000)
    expect(document.body.textContent).toBe('Dados da missão preservados')
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('does not restart a pending request after unmount or poll a finished mission', async () => {
    let finish!: () => void
    const load = vi.fn().mockImplementation(() => new Promise<void>(resolve => { finish = resolve }))
    act(() => root.render(<Harness load={load} />))
    await advance(15000)
    act(() => root.render(<Harness load={load} status="cancelled" />))
    await act(async () => { finish(); await Promise.resolve() })
    await advance(60000)
    expect(load).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })
})
