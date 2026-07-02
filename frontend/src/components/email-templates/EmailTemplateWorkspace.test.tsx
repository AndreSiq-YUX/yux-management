import React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it } from 'vitest'
import { EmailTemplateWorkspace } from './EmailTemplateWorkspace'

describe('EmailTemplateWorkspace', () => {
  it('renders system mode without client blueprint actions', () => {
    const container = document.createElement('div')
    const root = createRoot(container)

    act(() => {
      root.render(<EmailTemplateWorkspace mode="admin" templates={[]} onReload={() => Promise.resolve()} />)
    })

    expect(container.textContent).toContain('Modelos de email do sistema')
    expect(container.textContent).not.toContain('Clonar blueprint')

    act(() => root.unmount())
  })

  it('renders portal mode for client-owned templates', () => {
    const container = document.createElement('div')
    const root = createRoot(container)

    act(() => {
      root.render(<EmailTemplateWorkspace mode="portal" templates={[]} onReload={() => Promise.resolve()} />)
    })

    expect(container.textContent).toContain('Meus modelos de email')

    act(() => root.unmount())
  })
})
