import { act } from 'react-dom/test-utils'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MissionRecipePicker } from './MissionRecipePicker'
import { actionEngineService } from '@/services/actionEngineService'
import type { MissionRecipe } from '@/types/actionEngine'

const recipe: MissionRecipe = {
  id: 'recipe-id', key: 'funnel_nurture_real_estate', version: 1, title: 'Funil + nutrição para imobiliária', sector: 'real_estate',
  packSelections: [{ key: 'funnel_nurture', version: '1.0.0', contentHash: 'a'.repeat(64) }],
  defaultGoal: {}, editableKeys: ['objective'], contentHash: 'b'.repeat(64),
}
const flush = () => new Promise(resolve => setTimeout(resolve, 0))

afterEach(() => { document.body.innerHTML = ''; vi.restoreAllMocks() })

describe('MissionRecipePicker', () => {
  it('selects a versioned recipe and requires explicit consent before sandbox seeding', async () => {
    vi.spyOn(actionEngineService, 'listRecipes').mockResolvedValue([recipe])
    const seed = vi.spyOn(actionEngineService, 'seedRecipeSandbox').mockResolvedValue({ id: 'manifest', organizationId: 'org', recipeKey: recipe.key, recipeVersion: 1, status: 'active', manifestHash: 'c'.repeat(64), itemCount: 17 })
    const onSelect = vi.fn()
    const root = createRoot(document.body.appendChild(document.createElement('div')))
    await act(async () => { root.render(<MissionRecipePicker organizationId="org" canWrite selectedKey={undefined} onSelect={onSelect} />); await flush() })
    const recipeButton = [...document.body.querySelectorAll('button')].find(item => item.textContent?.includes(recipe.title))
    await act(async () => { recipeButton?.click(); await flush() })
    expect(onSelect).toHaveBeenCalledWith(recipe)
    const seedButton = [...document.body.querySelectorAll('button')].find(item => item.textContent?.includes('Criar ambiente demo')) as HTMLButtonElement
    expect(seedButton.disabled).toBe(true)
    const consent = document.body.querySelector('input[type="checkbox"]') as HTMLInputElement
    await act(async () => { consent.click(); await flush(); seedButton.click(); await flush() })
    expect(seed).toHaveBeenCalledWith('org', recipe)
    expect(document.body.textContent).toContain('17 registros')
    act(() => root.unmount())
  })
})
