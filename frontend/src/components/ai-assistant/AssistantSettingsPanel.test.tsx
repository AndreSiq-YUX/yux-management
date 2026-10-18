import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usePlatformStore } from '@/stores/platformStore'

vi.mock('@/lib/aiAssistantDataClient', () => {
  const chain: Record<string, unknown> = {}
  const result = Promise.resolve({ data: [], error: null })
  for (const method of ['select', 'eq', 'insert', 'update', 'delete', 'single']) chain[method] = () => chain
  chain.then = result.then.bind(result)
  return { aiAssistantDataClient: { from: () => chain } }
})

import { AssistantSettingsPanel } from './AssistantSettingsPanel'

const setRole = (scope: 'client' | 'internal') =>
  usePlatformStore.setState({ role: { key: scope === 'internal' ? 'yux_admin' : 'client_admin', name: 'Papel', scope, permissions: [] } as never })

describe('AssistantSettingsPanel', () => {
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
    usePlatformStore.setState({ role: null })
  })

  const render = (variant: 'portal' | 'internal') =>
    act(async () => root.render(<AssistantSettingsPanel organizationId="org-1" variant={variant} />))

  it('usa o glossário e não mostra campos técnicos ao cliente', async () => {
    setRole('client')
    await render('portal')
    const text = container.textContent ?? ''
    expect(text).toContain('Instruções do agente')
    expect(text).toContain('Gatilhos e transferência')
    expect(text).not.toMatch(/System Prompt|Handoff|Strategy Profile|Lock de Papel|Perfil estratégico|Prioridade de roteamento/)
    expect(container.querySelector('details')).toBeNull()
    expect(container.firstElementChild?.className).not.toContain('max-w-4xl')
  })

  it('papéis internos veem os campos técnicos recolhidos em "Detalhes técnicos"', async () => {
    setRole('internal')
    await render('portal')
    const details = container.querySelector('details')
    expect(details?.querySelector('summary')?.textContent).toBe('Detalhes técnicos')
    expect(details?.open).toBe(false)
    expect(details?.textContent).toContain('Perfil estratégico (ID)')
    expect(details?.textContent).toContain('Tempo para manter o mesmo papel')
  })

  it('o Hub interno continua com todos os campos à vista', async () => {
    setRole('internal')
    await render('internal')
    expect(container.querySelector('details')).toBeNull()
    expect(container.textContent).toContain('Perfil estratégico (ID)')
    expect(container.textContent).toContain('Prioridade de roteamento')
  })

  it('toda caixa de texto tem rótulo', async () => {
    setRole('client')
    await render('portal')
    const fields = Array.from(container.querySelectorAll('input:not([type="checkbox"]), select, textarea'))
    expect(fields.length).toBeGreaterThan(4)
    for (const field of fields) {
      const labelled = field.closest('label') || (field.id && container.querySelector(`label[for="${field.id}"]`)) || field.getAttribute('aria-label')
      expect(labelled, field.outerHTML.slice(0, 80)).toBeTruthy()
    }
  })
})
