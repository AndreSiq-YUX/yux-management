import type { ReactElement } from 'react'
import { act } from 'react-dom/test-utils'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/** Renderiza dentro de um MemoryRouter e devolve o contêiner + helpers de interação. */
export async function render(node: ReactElement) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(<MemoryRouter>{node}</MemoryRouter>)
  })
  return {
    container,
    rerender: async (next: ReactElement) => {
      await act(async () => {
        root.render(<MemoryRouter>{next}</MemoryRouter>)
      })
    },
    unmount: async () => {
      await act(async () => {
        root.unmount()
      })
      container.remove()
    },
  }
}

export async function click(el: Element | null) {
  if (!el) throw new Error('elemento não encontrado')
  await act(async () => {
    (el as HTMLElement).click()
  })
}

export function byText(root: ParentNode, selector: string, text: string): HTMLElement | null {
  return (Array.from(root.querySelectorAll(selector)) as HTMLElement[]).find(el => el.textContent?.trim() === text) ?? null
}

export const flush = () => act(async () => { await Promise.resolve() })
