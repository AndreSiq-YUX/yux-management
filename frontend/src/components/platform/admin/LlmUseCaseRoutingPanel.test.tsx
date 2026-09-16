import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AdminLlmRoute, AdminLlmUseCaseDefinition } from '@/services/adminPlatformService'
import { LlmUseCaseRoutingPanel } from './LlmUseCaseRoutingPanel'

const useCases: AdminLlmUseCaseDefinition[] = [
  { key: 'global_llm', title: 'Global de texto', description: 'Reserva geral.', kind: 'chat', group: 'Globais' },
  { key: 'global_embeddings', title: 'Global de embeddings', description: 'Reserva vetorial.', kind: 'embedding', group: 'Globais' },
  { key: 'support_assistant', title: 'Suporte WhatsApp', description: 'Perfil de suporte.', kind: 'chat', group: 'Atendimento' },
  { key: 'knowledge_curator', title: 'Curadoria de conhecimento', description: 'Analisa arquivos.', kind: 'chat', group: 'Conhecimento' },
]
const base: AdminLlmRoute = { id: 'route-global', agentType: 'global_llm', routingTier: 'default', provider: 'openrouter',
  modelName: 'main:free', fallbackModelName: 'old:free', maxInputTokens: 8000, maxOutputTokens: 1000, temperature: 0.2, maxCostPerRun: 0, status: 'active' }

describe('central model editor', () => {
  let container: HTMLDivElement
  let root: Root
  const onSave = vi.fn(async input => ({ ...input, id: input.id || 'new' }))
  const onTest = vi.fn(async () => ({ ok: true, message: 'OK', model: 'main:free', provider: 'openrouter', checkedAt: '' }))
  beforeEach(() => { vi.clearAllMocks(); container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container) })
  afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks() })
  async function render(routes: AdminLlmRoute[] = [base]) {
    await act(async () => root.render(<LlmUseCaseRoutingPanel providers={[]} routes={routes} useCases={useCases} onSave={onSave} onTest={onTest} />))
  }
  function button(text: string) { return [...container.querySelectorAll('button')].find(item => item.textContent?.includes(text))! }
  function input(label: string) { return [...container.querySelectorAll('label')].find(item => item.textContent?.includes(label))!.querySelector('input')! }
  it('shows all service groups, global settings and preserves legacy fallback', async () => {
    await render()
    expect(container.textContent).toContain('Suporte WhatsApp')
    expect(container.textContent).toContain('Curadoria de conhecimento')
    expect(input('Modelo do fallback 1').value).toBe('old:free')
    await act(async () => button('Adicionar fallback').click())
    expect(container.textContent).toContain('Modelo do fallback 2')
    await act(async () => button('Global de embeddings').click())
    expect(container.textContent).toContain('Trocar de modelo exige reindexação')
    expect(container.textContent).toContain('fallback de texto não se aplica')
  })
  it('loads scoped premium route without erasing its identity', async () => {
    await render([base, { ...base, id: 'route-support', agentType: 'support_assistant', routingTier: 'premium', organizationId: 'org-a', fallbackModelName: null }])
    await act(async () => button('Suporte WhatsApp').click())
    const selector = [...container.querySelectorAll('label')].find(item => item.textContent?.includes('Rota e escopo'))!.querySelector('select')!
    await act(async () => { selector.value = 'route-support'; selector.dispatchEvent(new Event('change', { bubbles: true })) })
    expect(input('Organização (ID opcional)').value).toBe('org-a')
    expect(input('Organização (ID opcional)').disabled).toBe(true)
    await act(async () => container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
    expect(onSave.mock.calls[0][0]).toMatchObject({ id: 'route-support', agentType: 'support_assistant', organizationId: 'org-a', routingTier: 'premium' })
  })
  it('requires explicit confirmation before a provider test and never calls on render', async () => {
    await render([{ ...base, fallbackModelName: null }])
    expect(onTest).not.toHaveBeenCalled()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    await act(async () => button('Testar modelo').click())
    expect(confirm).toHaveBeenCalled()
    expect(onTest).not.toHaveBeenCalled()
    confirm.mockReturnValue(true)
    await act(async () => button('Testar modelo').click())
    expect(onTest).toHaveBeenCalledWith('route-global')
  })

  it('preserves manual provider choices and saves fallbacks in the order chosen by Admin', async () => {
    await render([{ ...base, fallbackModelName: null, fallbackRoutes: [{ provider: 'openrouter', modelName: 'first:free' }, { provider: 'openai_direct', modelName: 'second' }] }])
    await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="Subir fallback 2"]')!.click())
    expect(input('Modelo do fallback 1').value).toBe('second')
    await act(async () => container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
    expect(onSave.mock.calls[0][0].fallbackRoutes).toEqual([{ provider: 'openai_direct', modelName: 'second' }, { provider: 'openrouter', modelName: 'first:free' }])
    expect(onSave.mock.calls[0][0].fallbackModelName).toBeNull()
  })

  it('warns when the effective legacy configuration cannot be checked', async () => {
    await act(async () => root.render(<LlmUseCaseRoutingPanel providers={[]} routes={[]} useCases={useCases} legacyStatus="unavailable" onSave={onSave} onTest={onTest} />))
    expect(container.textContent).toContain('campos sem rota não confirmam qual modelo legado está ativo')
    expect(onTest).not.toHaveBeenCalled()
  })
})
