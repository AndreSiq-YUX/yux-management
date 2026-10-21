import { act } from 'react-dom/test-utils'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { WhatsAppTestSendForm } from './WhatsAppTestSendForm'

afterEach(() => { vi.unstubAllGlobals(); document.body.innerHTML = '' })

it('só solicita envio após preencher destinatário e confirmação e distingue aceitação de entrega', async () => {
  const requests: Array<Record<string, unknown>> = []
  vi.stubGlobal('fetch', vi.fn(async (_url: string, options?: RequestInit) => {
    if (options?.method === 'POST') {
      requests.push(JSON.parse(String(options.body)).body)
      return new Response(JSON.stringify({ messageId: 'message-1', conversationId: 'conversation-1', deliveryStatus: 'queued' }), { status: 202 })
    }
    return new Response(JSON.stringify([{ id: 'message-1', deliveryStatus: 'sent', externalMessageId: 'wamid.test', metadata: {} }]), { status: 200 })
  }))
  const root = createRoot(document.body.appendChild(document.createElement('div')))
  await act(async () => { root.render(<WhatsAppTestSendForm connectionId="connection-1" senderNumber="+1 555 123 4567" />) })
  expect(requests).toHaveLength(0)
  const form = document.querySelector('form')!
  const recipient = document.querySelector<HTMLInputElement>('input[name="recipient"]')!
  recipient.value = '+55 (11) 99999-0000'
  await act(async () => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) })
  expect(requests).toHaveLength(0)
  document.querySelector<HTMLInputElement>('input[name="confirmed"]')!.checked = true
  await act(async () => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); await new Promise(resolve => setTimeout(resolve, 0)) })
  expect(requests).toHaveLength(1)
  expect(requests[0]).toMatchObject({ connectionId: 'connection-1', recipient: '+55 (11) 99999-0000', confirmed: true })
  expect(document.body.textContent).toContain('Aceita pela Meta')
  expect(document.body.textContent).not.toContain('Entregue ao destinatário')
  expect(document.body.textContent).toContain('wamid.test')
  act(() => root.unmount())
})

it('reutiliza os dados e a identificação originais quando a resposta da solicitação se perde', async () => {
  const requests: Array<Record<string, unknown>> = []
  vi.stubGlobal('fetch', vi.fn(async (_url: string, options?: RequestInit) => {
    if (options?.method === 'POST') {
      requests.push(JSON.parse(String(options.body)).body)
      if (requests.length === 1) throw new Error('network response lost')
      return new Response(JSON.stringify({ messageId: 'message-1', conversationId: 'conversation-1', deliveryStatus: 'queued' }), { status: 202 })
    }
    return new Response('[]', { status: 200 })
  }))
  const root = createRoot(document.body.appendChild(document.createElement('div')))
  await act(async () => { root.render(<WhatsAppTestSendForm connectionId="connection-1" senderNumber="+1 555 123 4567" />) })
  document.querySelector<HTMLInputElement>('input[name="recipient"]')!.value = '+5511999990000'
  document.querySelector<HTMLInputElement>('input[name="confirmed"]')!.checked = true
  const form = document.querySelector('form')!
  const submit = async () => act(async () => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); await new Promise(resolve => setTimeout(resolve, 0)) })
  await submit()
  expect(document.querySelector('fieldset')?.disabled).toBe(true)
  await submit()
  expect(requests).toHaveLength(2)
  expect(requests[1]).toEqual(requests[0])
  act(() => root.unmount())
})
