import React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it } from 'vitest'
import { EmailTemplateEditor } from './EmailTemplateEditor'

describe('EmailTemplateEditor', () => {
  it('renders visual and html mode controls and variables', () => {
    const container = document.createElement('div')
    const root = createRoot(container)

    act(() => {
      root.render(
        <EmailTemplateEditor
          value="<p>Ola {{name}}</p>"
          variables={['name', 'unsubscribe_url']}
          onChange={() => undefined}
        />,
      )
    })

    expect(container.textContent).toContain('Visual')
    expect(container.textContent).toContain('HTML')
    expect(container.textContent).toContain('{{name}}')
    expect(container.textContent).toContain('{{unsubscribe_url}}')

    act(() => root.unmount())
  })
})
