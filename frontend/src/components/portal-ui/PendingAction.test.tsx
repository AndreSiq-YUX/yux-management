import type { ReactElement } from 'react'
import { act } from 'react-dom/test-utils'
import { createRoot } from 'react-dom/client'
import { describe, expect, it } from 'vitest'
import { getPendingFeature } from '@/lib/client-portal/pendingFeatures'
import { PendingAction } from './PendingAction'
import { PendingBadge } from './PendingBadge'
import { PendingSection } from './PendingSection'

const render = async (node: ReactElement) => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(node)
  })
  return {
    container,
    unmount: async () => {
      await act(async () => {
        root.unmount()
      })
      container.remove()
    },
  }
}

describe('PendingAction', () => {
  it('renders a focusable, aria-disabled button with the Pendente badge', async () => {
    const { container, unmount } = await render(<PendingAction code="B1">Pagar fatura</PendingAction>)
    const button = container.querySelector('button')!
    expect(button.getAttribute('type')).toBe('button')
    expect(button.disabled).toBe(false)
    expect(button.getAttribute('aria-disabled')).toBe('true')
    expect(button.textContent).toContain('Pagar fatura')
    expect(button.textContent).toContain('Pendente')
    expect(container.querySelector(`[aria-label="Pendente: ${getPendingFeature('B1').title}"]`)).not.toBeNull()
    expect(container.querySelector('[role="status"]')).toBeNull()
    await unmount()
  })

  it('shows the client message on click and hides it on a second click', async () => {
    const { container, unmount } = await render(<PendingAction code="B2">Importar CSV</PendingAction>)
    const button = container.querySelector('button')!
    await act(async () => {
      button.click()
    })
    const status = container.querySelector('[role="status"]')
    expect(status?.textContent).toBe(getPendingFeature('B2').clientMessage)
    expect(button.getAttribute('aria-describedby')).toBe(status?.id)
    await act(async () => {
      button.click()
    })
    expect(container.querySelector('[role="status"]')).toBeNull()
    await unmount()
  })

  it('does not accept an onClick prop', () => {
    // @ts-expect-error PendingAction never runs actions, so onClick is not part of its props
    const element = <PendingAction code="B1" onClick={() => undefined}>Pagar</PendingAction>
    expect(element).toBeTruthy()
  })
})

describe('PendingBadge', () => {
  it('exposes the explanation via aria-label and title', async () => {
    const { container, unmount } = await render(<PendingBadge code="B11" />)
    const badge = container.firstElementChild!
    expect(badge.textContent).toBe('Pendente')
    expect(badge.getAttribute('aria-label')).toBe(`Pendente: ${getPendingFeature('B11').title}`)
    expect(badge.getAttribute('title')).toBe(getPendingFeature('B11').clientMessage)
    await unmount()
  })
})

describe('PendingSection', () => {
  it('renders title, badge, explanation and children', async () => {
    const { container, unmount } = await render(
      <PendingSection code="B5" title="Prazo de resposta" description="Tempo médio até a primeira resposta.">
        <p>conteúdo extra</p>
      </PendingSection>,
    )
    expect(container.querySelector('h3')?.textContent).toBe('Prazo de resposta')
    expect(container.textContent).toContain('Pendente')
    expect(container.textContent).toContain('Tempo médio até a primeira resposta.')
    expect(container.textContent).toContain(getPendingFeature('B5').clientMessage)
    expect(container.textContent).toContain('conteúdo extra')
    await unmount()
  })
})
