import { act } from 'react-dom/test-utils'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MissionIntake } from './MissionIntake'
import { actionEngineService } from '@/services/actionEngineService'
import type { ActionMission } from '@/types/actionEngine'
import type { MissionRecipe } from '@/types/actionEngine'

const flush = () => new Promise(resolve => setTimeout(resolve, 0))

afterEach(() => { document.body.innerHTML = ''; vi.restoreAllMocks() })

describe('MissionIntake', () => {
  it('explains the generic request, quick start and autonomy modes', async () => {
    const { root } = await renderIntake(true)
    expect(document.body.textContent).toContain('O que você quer que a YUX realize?')
    expect(document.body.textContent).toContain('Funil + nutrição')
    expect(document.body.textContent).toContain('Revenue Recovery')
    await click('Revenue Recovery')
    await click('Definir limites')
    expect(document.body.textContent).toContain('Simular')
    expect(document.body.textContent).toContain('Preparar')
    expect(document.body.textContent).toContain('Assistido')
    expect(document.body.textContent).toContain('Autônomo')
    act(() => root.unmount())
  })

  it('submits a natural-language objective with an explicit bounded envelope', async () => {
    const create = vi.spyOn(actionEngineService, 'createMissionIntent').mockResolvedValue({ id: 'mission-1' } as ActionMission)
    const onCreated = vi.fn()
    const { root } = await renderIntake(true, onCreated)
    await change('textarea[aria-label="Descreva o resultado desejado"]', 'Crie um funil com quatro etapas e uma sequência de quatro e-mails.')
    await click('Definir limites')
    const autonomous = [...document.body.querySelectorAll('label')].find(item => item.textContent?.includes('Autônomo'))
    await act(async () => { autonomous?.querySelector('input')?.dispatchEvent(new MouseEvent('click', { bubbles: true })); await flush() })
    await click('Criar missão')
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      objective: 'Crie um funil com quatro etapas e uma sequência de quatro e-mails.',
      mode: 'autonomous', allowedModules: ['crm', 'automations', 'funnel_nurture_agent'], maxTotalCostBrl: '1000', maxHumanHours: '10',
    }))
    expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({ id: 'mission-1' }))
    act(() => root.unmount())
  })

  it('submits the Funnel + Nurture shortcut in prepare mode with its explicit areas', async () => {
    const create = vi.spyOn(actionEngineService, 'createMissionIntent').mockResolvedValue({ id: 'mission-funnel' } as ActionMission)
    const { root } = await renderIntake(true)
    await click('Funil + nutrição'); await click('Definir limites'); await click('Criar missão')
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ quickStart: 'funnel_nurture', mode: 'prepare', allowedModules: ['crm', 'automations', 'funnel_nurture_agent'] }))
    act(() => root.unmount())
  })

  it('pins the selected recipe version and keeps its governed modules', async () => {
    const recipe: MissionRecipe = {
      id: 'recipe-id', key: 'funnel_nurture_real_estate', version: 1, title: 'Funil + nutrição para imobiliária', sector: 'real_estate',
      packSelections: [{ key: 'funnel_nurture', version: '1.0.0', contentHash: 'a'.repeat(64) }],
      defaultGoal: { title: 'Funil imobiliário', objective: 'Criar um funil imobiliário completo com três e-mails educativos.', mode: 'shadow', allowedModules: ['crm','automations','funnel_nurture_agent'], maxTotalCostBrl: '500', maxHumanHours: '4', maxExternalContacts: 0, expectedValueBrl: '10000' },
      editableKeys: ['title','objective','mode'], contentHash: 'b'.repeat(64),
    }
    vi.spyOn(actionEngineService, 'listRecipes').mockResolvedValue([recipe])
    const create = vi.spyOn(actionEngineService, 'createMissionIntent').mockResolvedValue({ id: 'mission-recipe' } as ActionMission)
    const { root } = await renderIntake(true)
    await click('Funil + nutrição para imobiliária'); await click('Definir limites'); await click('Criar missão')
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      mode: 'shadow', allowedModules: ['crm','automations','funnel_nurture_agent'],
      recipeSelection: { key: recipe.key, version: 1, contentHash: recipe.contentHash },
    }))
    act(() => root.unmount())
  })

  it('keeps creation unavailable for a read-only role', async () => {
    const { root } = await renderIntake(false)
    expect(document.body.textContent).toContain('pode acompanhar missões, mas não criar')
    expect(findButton('Criar missão')).toBeUndefined()
    act(() => root.unmount())
  })
})

async function renderIntake(canWrite: boolean, onCreated = vi.fn()) {
  const container = document.createElement('div'); document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(<MissionIntake open organizationId="00000000-0000-4000-8000-000000000001" contractId="00000000-0000-4000-8000-000000000002" canWrite={canWrite} onOpenChange={vi.fn()} onCreated={onCreated} />)
    await flush()
  })
  return { root }
}

function findButton(text: string) { return [...document.body.querySelectorAll('button')].find(button => button.textContent?.includes(text)) }
async function click(text: string, expectEnabled = true) {
  const button = findButton(text)
  expect(button).toBeDefined()
  if (expectEnabled) expect(button?.hasAttribute('disabled')).toBe(false)
  await act(async () => { button?.dispatchEvent(new MouseEvent('click', { bubbles: true })); await flush() })
}
async function change(selector: string, value: string) {
  const element = document.body.querySelector(selector) as HTMLTextAreaElement | null
  expect(element).not.toBeNull()
  await act(async () => {
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), 'value')?.set?.call(element, value)
    element?.dispatchEvent(new Event('input', { bubbles: true })); element?.dispatchEvent(new Event('change', { bubbles: true })); await flush()
  })
}
