import React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it } from 'vitest'
import { EmailTemplateWorkspace } from './EmailTemplateWorkspace'
import { EmailTemplateEditor } from './EmailTemplateEditor'
import { render, click, byText } from '@/components/portal-ui/__tests__/render'
import type { EmailTemplate } from '@/types/emailTemplate'

const template: EmailTemplate = {
  id: 'tpl-1',
  scope: 'organization',
  organizationId: 'org-1',
  blueprintKey: null,
  name: 'Boas-vindas',
  description: null,
  category: 'general',
  emailKind: 'marketing',
  moduleKey: 'email',
  triggerKey: null,
  status: 'draft',
  subject: 'Olá',
  preheader: null,
  bodyHtml: '<p>Bem-vindo</p>',
  bodyText: null,
  variablesSchema: {},
  requiredVariables: ['contact_name'],
  editableByClient: true,
  publishedVersionId: null,
  createdAt: '2026-06-01T12:00:00.000Z',
  updatedAt: '2026-06-01T12:00:00.000Z',
}

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

  it('renders portal mode with accents and without internal vocabulary', async () => {
    const { container, unmount } = await render(
      <EmailTemplateWorkspace mode="portal" templates={[]} onReload={() => Promise.resolve()} />,
    )

    expect(container.querySelector('h1')?.textContent).toBe('Modelos de e-mail')
    expect(container.textContent).toContain('Você ainda não tem modelos próprios.')
    expect(container.textContent).not.toContain('Meus modelos de email')
    await unmount()
  })

  it('offers friendly variable buttons and validation messages without {{ }} syntax in portal mode', async () => {
    const { container, unmount } = await render(
      <EmailTemplateWorkspace mode="portal" templates={[{ ...template, requiredVariables: [] }]} onReload={() => Promise.resolve()} />,
    )
    const text = container.textContent ?? ''

    expect(byText(container, 'button', 'Nome do contato')).not.toBeNull()
    expect(byText(container, 'button', 'Link de descadastro')).not.toBeNull()
    expect(text).not.toContain('{{')
    expect(text).toContain("Inclua o link de descadastro (botão 'Link de descadastro').")
    expect(text).not.toContain('unsubscribe_url')
    expect(text).not.toContain('Trigger')
    expect(text).not.toContain('Corpo HTML')
    await unmount()
  })

  it('explains missing required variables by their friendly name', async () => {
    const { container, unmount } = await render(
      <EmailTemplateWorkspace mode="portal" templates={[template]} onReload={() => Promise.resolve()} />,
    )

    expect(container.textContent).toContain("Inclua no e-mail: 'Nome do contato'.")
    expect(container.textContent).not.toContain('contact_name')
    await unmount()
  })

  it('keeps raw {{variable}} buttons in admin mode', async () => {
    const { container, unmount } = await render(
      <EmailTemplateWorkspace mode="admin" templates={[template]} onReload={() => Promise.resolve()} />,
    )

    expect(container.textContent).toContain('{{contact_name}}')
    await unmount()
  })
})

describe('EmailTemplateEditor friendly variables', () => {
  it('inserts the token at the cursor when a friendly button is clicked (HTML mode)', async () => {
    const changes: string[] = []
    const { container, unmount } = await render(
      <EmailTemplateEditor
        value="<p>Olá , bem-vindo</p>"
        variables={['contact_name']}
        variableLabel={() => 'Nome do contato'}
        onChange={html => changes.push(html)}
      />,
    )

    expect(container.textContent).not.toContain('{{contact_name}}')
    await click(byText(container, 'button', 'HTML'))
    const textarea = container.querySelector('textarea') as HTMLTextAreaElement
    textarea.focus()
    textarea.setSelectionRange(7, 7)

    await click(byText(container, 'button', 'Nome do contato'))

    expect(changes.at(-1)).toBe('<p>Olá {{contact_name}}, bem-vindo</p>')
    await unmount()
  })
})
