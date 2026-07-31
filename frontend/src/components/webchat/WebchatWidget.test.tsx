import { act } from 'react-dom/test-utils'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import { WebchatWidget } from './WebchatWidget'

function renderWidget(invoke = vi.fn(async (action: string) => {
  if (action === 'load_session') {
    return {
      widget: {
        name: 'YUX Atendimento',
        branding: { primaryColor: '#0f766e' },
        consentText: 'Aceito receber atendimento.',
        initialForm: ['name', 'email'],
      },
      conversation: { id: 'conversation-1' },
      messages: [{ id: 'message-1', authorType: 'agent', body: 'Como posso ajudar?' }],
    }
  }
  if (action === 'send_message') return { message: { id: 'message-2', body: 'Mensagem enviada' } }
  if (action === 'poll_messages') return { messages: [{ id: 'message-3', authorType: 'agent', body: 'Recebido.' }] }
  return {}
})) {
  const container = document.createElement('div')
  const root = createRoot(container)

  act(() => {
    root.render(<WebchatWidget sessionToken="session-token-1" invoke={invoke} />)
  })

  return { container, root, invoke }
}

describe('WebchatWidget', () => {
  it('loads a session without exposing the public widget token', async () => {
    const { container, root, invoke } = renderWidget()

    await act(async () => {
      await Promise.resolve()
    })

    expect(invoke).toHaveBeenCalledWith('load_session', { sessionToken: 'session-token-1' })
    expect(container.innerHTML).toContain('YUX Atendimento')
    expect(container.innerHTML).toContain('Aceito receber atendimento.')
    expect(container.innerHTML).toContain('Como posso ajudar?')
    expect(container.innerHTML).not.toContain('publicToken')

    act(() => root.unmount())
  })

  it('requires consent and initial form before sending a message', async () => {
    const { container, root, invoke } = renderWidget()

    await act(async () => {
      await Promise.resolve()
    })

    act(() => {
      container.querySelector<HTMLInputElement>('input[name="name"]')!.value = 'Maria'
      container.querySelector<HTMLInputElement>('input[name="email"]')!.value = 'maria@example.com'
      container.querySelector<HTMLInputElement>('input[name="consent"]')!.click()
      container.querySelector<HTMLTextAreaElement>('textarea[name="message"]')!.value = 'Quero falar com atendimento.'
      container.querySelector<HTMLButtonElement>('button[title="Enviar mensagem"]')!.click()
    })

    expect(invoke).toHaveBeenCalledWith('send_message', expect.objectContaining({
      sessionToken: 'session-token-1',
      body: 'Quero falar com atendimento.',
      contact: { name: 'Maria', email: 'maria@example.com' },
      consentAccepted: true,
    }))

    act(() => root.unmount())
  })

  it('supports attachment upload, human transfer, polling, and neutral inactive state', async () => {
    const invoke = vi.fn(async (action: string) => {
      if (action === 'load_session') return { notFound: true }
      if (action === 'request_attachment_upload') return { uploadUrl: 'signed-upload-url' }
      if (action === 'request_human') return { status: 'waiting_human' }
      if (action === 'poll_messages') return { messages: [] }
      return {}
    })
    const { container, root } = renderWidget(invoke)

    await act(async () => {
      await Promise.resolve()
    })

    expect(container.innerHTML).toContain('Atendimento indisponivel')

    act(() => {
      container.querySelector<HTMLButtonElement>('button[title="Solicitar anexo"]')!.click()
      container.querySelector<HTMLButtonElement>('button[title="Transferir para humano"]')!.click()
      container.querySelector<HTMLButtonElement>('button[title="Atualizar conversa"]')!.click()
    })

    expect(invoke).toHaveBeenCalledWith('request_attachment_upload', { sessionToken: 'session-token-1' })
    expect(invoke).toHaveBeenCalledWith('request_human', { sessionToken: 'session-token-1' })
    expect(invoke).toHaveBeenCalledWith('poll_messages', { sessionToken: 'session-token-1' })

    act(() => root.unmount())
  })
})
