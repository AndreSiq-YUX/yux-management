import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MissionConversation } from '@/types/actionEngine'
import { MissionContextDrawer } from './MissionContextDrawer'

const conversation = {
  id: '00000000-0000-4000-8000-000000000010',
  organizationId: '00000000-0000-4000-8000-000000000001',
  status: 'collecting_context', title: 'Missão', currentBrief: {}, briefHash: 'hash',
  contextReadiness: { status: 'needs_information', missing: [] }, version: 1,
  createdBy: 'user', createdAt: '2026-09-06T00:00:00.000Z', updatedAt: '2026-09-06T00:00:00.000Z', messages: [],
} satisfies MissionConversation

describe('MissionContextDrawer accessibility', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true)
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
  })

  it('leva o foco ao fechamento, aceita Escape e devolve o foco', async () => {
    const trigger = document.createElement('button')
    document.body.appendChild(trigger)
    trigger.focus()
    const onClose = vi.fn()
    await act(async () => root.render(<MissionContextDrawer conversation={conversation} open onClose={onClose} />))
    expect(document.activeElement).toBe(container.querySelector('[aria-label="Fechar contexto"]'))
    await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    expect(onClose).toHaveBeenCalledOnce()
    await act(async () => root.render(<MissionContextDrawer conversation={conversation} open={false} onClose={onClose} />))
    expect(document.activeElement).toBe(trigger)
    trigger.remove()
  })
})
