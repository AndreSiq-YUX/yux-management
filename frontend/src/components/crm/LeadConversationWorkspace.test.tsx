import { act } from 'react-dom/test-utils'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import type {LeadConversationView} from './LeadConversationPanel'
import { LeadConversationWorkspace } from './LeadConversationWorkspace'
import { omnichannelService } from '@/services/omnichannelService'
vi.mock('@/services/omnichannelService', () => ({
  omnichannelService: { sendHumanReply: vi.fn() },
}))
let cleanup = () => {}
afterEach(() => {
  cleanup()
  vi.resetAllMocks()
})
it('sends the edited draft to the linked conversation and surfaces delivery rejection', async () => {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  cleanup = () => {
    act(() => root.unmount())
    host.remove()
  }
  const changed = vi.fn()
  vi.mocked(omnichannelService.sendHumanReply).mockRejectedValue(
    new Error('Canal indisponível.'),
  )
  await act(async () =>
    root.render(
      <LeadConversationWorkspace
        conversations={[
          {
            id: 'link',
            conversationId: 'conversation',
            status: 'linked',
            channel: 'webchat',
            conversation: { id: 'conversation', status: 'open' },
          } as LeadConversationView,
        ]}
        templates={[]}
        quickReplies={[]}
        suggestions={[]}
        slaEvents={[]}
        onOpen={() => {}}
        onChanged={changed}
      />,
    ),
  )
  const text = host.querySelector('textarea')!
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      'value',
    )!.set!.call(text, 'Texto revisado pelo usuário')
    text.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await act(async () =>
    host
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
  )
  expect(omnichannelService.sendHumanReply).toHaveBeenCalledWith({
    conversationId: 'conversation',
    body: 'Texto revisado pelo usuário',
  })
  expect(host.textContent).toContain('Canal indisponível.')
  expect(changed).not.toHaveBeenCalled()
  vi.mocked(omnichannelService.sendHumanReply).mockResolvedValue({
    id: 'message',
    deliveryStatus: 'queued',
  } as Awaited<ReturnType<typeof omnichannelService.sendHumanReply>>)
  await act(async () =>
    host
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
  )
  expect(host.textContent).toContain('Mensagem registrada no atendimento.')
  expect(changed).toHaveBeenCalledOnce()
})
