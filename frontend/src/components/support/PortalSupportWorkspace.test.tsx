import { act } from 'react-dom/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { byText, click, render } from '@/components/portal-ui/__tests__/render'
import { PortalSupportWorkspace } from './PortalSupportWorkspace'
import type { ContractDetails } from '@/types/platform'
import type { SupportTicket } from '@/types/support'

const ticket: SupportTicket = {
  id: 'ticket-1',
  organizationId: 'org-1',
  clientId: 'client-1',
  contractId: 'contract-1',
  projectId: 'project-1',
  subject: 'Ajuste no dashboard',
  category: 'billing',
  priority: 'high',
  status: 'waiting_client',
  slaDueAt: '2099-06-03T18:00:00.000Z',
  lastMessageAt: '2026-06-03T12:00:00.000Z',
  internalNotes: 'Conta estrategica',
  clientName: 'Cliente YUX',
  contractName: 'Contrato principal',
  createdAt: '2026-06-03T10:00:00.000Z',
  updatedAt: '2026-06-03T12:00:00.000Z',
  messages: [
    {
      id: 'message-1',
      ticketId: 'ticket-1',
      authorType: 'client',
      authorName: 'Ana',
      body: 'Não consigo ver o relatório.',
      isInternal: false,
      createdAt: '2026-06-03T10:00:00.000Z',
      updatedAt: '2026-06-03T10:00:00.000Z',
    },
    {
      id: 'message-2',
      ticketId: 'ticket-1',
      authorType: 'internal',
      authorName: 'Bruno (YUX)',
      body: 'Vamos verificar e retornamos.',
      isInternal: false,
      createdAt: '2026-06-03T11:00:00.000Z',
      updatedAt: '2026-06-03T11:00:00.000Z',
    },
    {
      id: 'message-3',
      ticketId: 'ticket-1',
      authorType: 'internal',
      body: 'Investigar permissão interna.',
      isInternal: true,
      createdAt: '2026-06-03T11:30:00.000Z',
      updatedAt: '2026-06-03T11:30:00.000Z',
    },
  ],
}

const contract: ContractDetails = {
  id: 'contract-1',
  clientId: 'client-1',
  packageId: 'package-1',
  name: 'Contrato principal',
  status: 'active',
  value: 1500,
  billingCycle: 'monthly',
  startsAt: '2026-06-01',
  createdAt: '2026-06-01T12:00:00.000Z',
  updatedAt: '2026-06-01T12:00:00.000Z',
  package: null,
  modules: [],
}

afterEach(() => {
  document.body.innerHTML = ''
})

const setup = (overrides: Partial<Parameters<typeof PortalSupportWorkspace>[0]> = {}) => {
  const handlers = {
    onCreateTicket: vi.fn().mockResolvedValue(undefined),
    onAddMessage: vi.fn().mockResolvedValue(undefined),
    onRefresh: vi.fn(),
  }
  return { handlers, view: render(<PortalSupportWorkspace contract={contract} tickets={[ticket]} currentUserName="Ana" {...handlers} {...overrides} />) }
}

const type = async (element: Element | null, value: string) => {
  const input = element as HTMLInputElement | HTMLTextAreaElement
  const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  await act(async () => {
    Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

const select = async (element: Element | null, value: string) => {
  await act(async () => {
    const input = element as HTMLSelectElement
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(input, value)
    input.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

const submit = async (form: Element | null) => {
  await act(async () => {
    form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  })
}

const openForm = async (container: HTMLElement) => {
  await click(byText(container, 'button', 'Abrir chamado'))
  return container.querySelector('form')!
}

describe('PortalSupportWorkspace', () => {
  it('lists tickets in Portuguese and hides internal notes', async () => {
    const { view } = setup()
    const { container, unmount } = await view
    const text = container.textContent ?? ''

    expect(container.querySelector('h1')?.textContent).toBe('Ajuda e suporte')
    expect(text).toContain('Ajuda e suporte')
    expect(text).toContain('Ajuste no dashboard')
    expect(text).toContain('Aguardando você')
    expect(text).toContain('Financeiro')
    expect(text).toContain('Prioridade alta')
    expect(text).not.toContain('waiting_client')
    expect(text).not.toContain('Conta estrategica')
    expect(text).not.toContain('Investigar permissão interna')
    await unmount()
  })

  it('shows the thread as chat bubbles with author, date and the real response deadline', async () => {
    const { view } = setup()
    const { container, unmount } = await view

    await click(container.querySelector('[data-testid="master-list"] li button'))
    const thread = container.querySelector('[data-testid="master-detail"]')!
    expect(thread.textContent).toContain('Você')
    expect(thread.textContent).toContain('Bruno (YUX)')
    expect(thread.textContent).toContain('Não consigo ver o relatório.')
    expect(thread.textContent).toContain('Vamos verificar e retornamos.')
    expect(thread.textContent).not.toContain('Investigar permissão interna')
    expect(thread.querySelectorAll('time')).toHaveLength(2)
    expect(thread.textContent).toContain('Prazo de resposta previsto')
    expect(byText(container, 'button', 'Voltar')).not.toBeNull()
    await unmount()
  })

  it('does not show a response deadline when the ticket has no SLA data', async () => {
    const { view } = setup({ tickets: [{ ...ticket, slaDueAt: undefined }] })
    const { container, unmount } = await view

    await click(container.querySelector('[data-testid="master-list"] li button'))
    expect(container.textContent).not.toContain('Prazo de resposta previsto')
    await unmount()
  })

  it('starts the new ticket form empty with placeholders and validates before sending', async () => {
    const { handlers, view } = setup()
    const { container, unmount } = await view
    const form = await openForm(container)

    const inputs = form.querySelectorAll('input, textarea')
    inputs.forEach(input => {
      expect((input as HTMLInputElement).value).toBe('')
      expect((input as HTMLInputElement).placeholder).not.toBe('')
    })
    expect(form.querySelector('select')!.value).toBe('')
    expect(form.textContent).toContain('Técnico')
    expect(form.textContent).toContain('Urgente')

    await submit(form)
    expect(form.textContent).toContain('O assunto precisa ter pelo menos 5 caracteres.')
    expect(form.textContent).toContain('Escolha uma categoria.')
    expect(form.textContent).toContain('pelo menos 10 caracteres')
    expect(handlers.onCreateTicket).not.toHaveBeenCalled()
    await unmount()
  })

  it('sends the ticket, disables the button while sending and clears the form on success', async () => {
    let finish!: () => void
    const onCreateTicket = vi.fn(() => new Promise<void>(resolve => { finish = resolve }))
    const { view } = setup({ onCreateTicket })
    const { container, unmount } = await view
    const form = await openForm(container)

    await type(form.querySelector('input'), 'Não consigo entrar')
    await select(form.querySelectorAll('select')[0], 'access')
    await select(form.querySelectorAll('select')[1], 'urgent')
    await type(form.querySelector('textarea'), 'Aparece erro ao fazer login desde ontem.')
    await submit(form)

    expect(onCreateTicket).toHaveBeenCalledWith({
      contractId: 'contract-1',
      clientId: 'client-1',
      subject: 'Não consigo entrar',
      category: 'access',
      priority: 'urgent',
      body: 'Aparece erro ao fazer login desde ontem.',
    })
    expect((byText(container, 'button', 'Enviando…') as HTMLButtonElement).disabled).toBe(true)

    await act(async () => finish())
    expect(container.querySelector('form')).toBeNull()

    const reopened = await openForm(container)
    expect((reopened.querySelector('input') as HTMLInputElement).value).toBe('')
    expect((reopened.querySelector('textarea') as HTMLTextAreaElement).value).toBe('')
    expect(reopened.querySelectorAll('select')[0].value).toBe('')
    await unmount()
  })

  it('keeps the typed text and shows an error when opening the ticket fails', async () => {
    const onCreateTicket = vi.fn().mockRejectedValue(new Error('offline'))
    const { view } = setup({ onCreateTicket })
    const { container, unmount } = await view
    const form = await openForm(container)

    await type(form.querySelector('input'), 'Não consigo entrar')
    await select(form.querySelectorAll('select')[0], 'access')
    await type(form.querySelector('textarea'), 'Aparece erro ao fazer login desde ontem.')
    await submit(form)

    expect(form.querySelector('[role="alert"]')?.textContent).toContain('foi mantido')
    expect((form.querySelector('input') as HTMLInputElement).value).toBe('Não consigo entrar')
    expect((form.querySelector('textarea') as HTMLTextAreaElement).value).toBe('Aparece erro ao fazer login desde ontem.')
    expect((byText(container, 'button', 'Enviar chamado') as HTMLButtonElement).disabled).toBe(false)
    await unmount()
  })

  it('replies with an empty box, clears it after sending and keeps the text on failure', async () => {
    const onAddMessage = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined)
    const { view } = setup({ onAddMessage })
    const { container, unmount } = await view
    await click(container.querySelector('[data-testid="master-list"] li button'))

    const reply = container.querySelector('[data-testid="master-detail"] form textarea') as HTMLTextAreaElement
    expect(reply.value).toBe('')
    expect(reply.placeholder).not.toBe('')
    expect((byText(container, 'button', 'Enviar resposta') as HTMLButtonElement).disabled).toBe(true)

    await type(reply, 'Enviei um print por e-mail.')
    await submit(reply.closest('form'))
    expect(reply.value).toBe('Enviei um print por e-mail.')
    expect(container.textContent).toContain('Seu texto foi mantido')

    await submit(reply.closest('form'))
    expect(onAddMessage).toHaveBeenLastCalledWith({
      ticketId: 'ticket-1',
      authorType: 'client',
      body: 'Enviei um print por e-mail.',
      isInternal: false,
    })
    expect(reply.value).toBe('')
    await unmount()
  })

  it('shows an empty state with the main action when there are no tickets', async () => {
    const { view } = setup({ tickets: [] })
    const { container, unmount } = await view

    expect(container.textContent).toContain('Nenhum chamado ainda')
    await unmount()
  })
})
