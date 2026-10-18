import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ActionMission, MissionActionRun, MissionPlan } from '@/types/actionEngine'
import { HumanTaskResolutionDialog } from './HumanTaskResolutionDialog'
import { MissionSimulationShareDialog } from './MissionSimulationShareDialog'

const wait = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 20)) })
const escape = () => act(async () => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) })

describe('Diálogos de missão (Radix Dialog)', () => {
  let container: HTMLDivElement
  let root: Root
  let trigger: HTMLButtonElement

  beforeEach(() => {
    Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true)
    container = document.createElement('div')
    document.body.appendChild(container)
    trigger = document.createElement('button')
    trigger.textContent = 'Abrir'
    document.body.appendChild(trigger)
    trigger.focus()
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    trigger.remove()
    document.body.innerHTML = ''
  })

  it('HumanTaskResolutionDialog tem nome acessível, fecha com Esc e devolve o foco', async () => {
    const onCancel = vi.fn()
    const action = { id: 'action-1' } as MissionActionRun
    await act(async () => root.render(<HumanTaskResolutionDialog action={action} busy={false} onCancel={onCancel} onConfirm={vi.fn()} />))
    const dialog = document.querySelector('[role="dialog"]')
    expect(dialog).not.toBeNull()
    const titleId = dialog!.getAttribute('aria-labelledby')
    expect(document.getElementById(titleId!)?.textContent).toBe('Concluir tarefa humana')
    expect(dialog!.contains(document.activeElement)).toBe(true)

    await escape()
    expect(onCancel).toHaveBeenCalledOnce()

    await act(async () => root.render(<HumanTaskResolutionDialog action={null} busy={false} onCancel={onCancel} onConfirm={vi.fn()} />))
    await wait()
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })

  it('MissionSimulationShareDialog tem nome acessível, fecha com Esc e devolve o foco', async () => {
    const onOpenChange = vi.fn()
    const mission = { id: 'mission-1', organizationId: 'org-1', mode: 'shadow' } as ActionMission
    const plan = { id: 'plan-1' } as MissionPlan
    await act(async () => root.render(<MissionSimulationShareDialog open mission={mission} plan={plan} onOpenChange={onOpenChange} />))
    const dialog = document.querySelector('[role="dialog"]')
    expect(dialog).not.toBeNull()
    expect(document.getElementById(dialog!.getAttribute('aria-labelledby')!)?.textContent).toBe('Compartilhar relatório de simulação')
    expect(dialog!.contains(document.activeElement)).toBe(true)

    await escape()
    expect(onOpenChange).toHaveBeenCalledWith(false)

    await act(async () => root.render(<MissionSimulationShareDialog open={false} mission={mission} plan={plan} onOpenChange={onOpenChange} />))
    await wait()
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })
})
