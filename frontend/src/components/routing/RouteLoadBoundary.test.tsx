import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RouteErrorBoundary } from './RouteLoadBoundary'

function BrokenRoute(): never {
  throw new Error('Failed to fetch dynamically imported module')
}

describe('RouteErrorBoundary', () => {
  beforeEach(() => window.sessionStorage.clear())

  it('offers a recoverable refresh instead of a blank page', () => {
    const container = document.createElement('div')
    const root = createRoot(container)
    const onReload = vi.fn()
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const preventWindowError = (event: ErrorEvent) => event.preventDefault()
    window.addEventListener('error', preventWindowError)

    act(() => {
      root.render(<RouteErrorBoundary onReload={onReload}><BrokenRoute /></RouteErrorBoundary>)
    })

    expect(container.textContent).toContain('Esta area recebeu uma atualizacao')
    expect(container.textContent).toContain('Rascunhos desta aba permanecem guardados')

    act(() => {
      container.querySelector<HTMLButtonElement>('button')?.click()
    })

    expect(onReload).toHaveBeenCalledOnce()
    expect(window.sessionStorage.getItem('yux:route-recovery')).toContain(window.location.pathname)

    act(() => root.unmount())
    window.removeEventListener('error', preventWindowError)
    consoleError.mockRestore()
  })
})
