import { act } from 'react-dom/test-utils'
import { createRoot } from 'react-dom/client'
import type { ComponentProps } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { PortalOmnichannelWorkspace } from './PortalOmnichannelWorkspace'
import type { OmnichannelMessageView, PortalOmnichannelConversationSummary } from '@/services/omnichannelService'

const conversation: PortalOmnichannelConversationSummary = {
  id: 'conversation-portal-1',
  organizationId: 'client-org-1',
  channel: 'webchat',
  status: 'waiting_human',
  responseMode: 'assisted',
  subject: 'Suporte onboarding',
  summary: 'Cliente pediu ajuda com acesso e agenda.',
  classification: 'support',
  sentiment: 'neutral',
  lastMessageAt: '2026-05-30T12:00:00.000Z',
  slaDeadlineAt: '2026-05-30T13:00:00.000Z',
  createdAt: '2026-05-30T11:00:00.000Z',
  updatedAt: '2026-05-30T12:00:00.000Z',
  contact: {
    id: 'contact-portal-1',
    displayName: 'Cliente Portal',
    email: 'cliente@example.com',
  },
  queue: { id: 'queue-1', name: 'Suporte' },
  team: { id: 'team-1', name: 'CS' },
  assignedUser: { id: 'user-1', name: 'Bia YUX' },
  tags: ['handoff'],
}

const messages: OmnichannelMessageView[] = [
  {
    id: 'message-portal-1',
    conversationId: 'conversation-portal-1',
    direction: 'inbound',
    authorType: 'contact',
    contentType: 'text',
    body: 'Preciso falar com suporte.',
    deliveryStatus: 'delivered',
    metadata: { raw_adapter_payload: 'never show' },
    createdAt: '2026-05-30T12:01:00.000Z',
    updatedAt: '2026-05-30T12:01:00.000Z',
    attachments: [],
  },
]

function renderWorkspace(overrides: Partial<ComponentProps<typeof PortalOmnichannelWorkspace>> = {}) {
  const container = document.createElement('div')
  const root = createRoot(container)
  const handlers = {
    onSendReply: vi.fn(),
    onAssign: vi.fn(),
    onReassign: vi.fn(),
    onResolve: vi.fn(),
    onReopen: vi.fn(),
    onHandoff: vi.fn(),
    onModeChange: vi.fn(),
    onSimulateEvent: vi.fn(),
  }

  act(() => {
    root.render(
      <MemoryRouter>
        <PortalOmnichannelWorkspace
          organizationId="client-org-1"
          conversations={[conversation]}
          messagesByConversation={{ 'conversation-portal-1': messages }}
          metrics={{
            totalConversations: 14,
            openConversations: 6,
            resolvedConversations: 8,
            slaOnTimeRate: 0.91,
            handoffCount: 3,
            byChannel: { webchat: 10, whatsapp: 4 },
            protectedErrorText: 'internal failure',
            internalAiCostMargin: 120,
          }}
          queues={[{ id: 'queue-1', name: 'Suporte' }]}
          users={[{ id: 'user-1', name: 'Bia YUX' }]}
          canConfigure
          {...handlers}
          {...overrides}
        />
      </MemoryRouter>,
    )
  })

  return { container, root, handlers }
}

describe('PortalOmnichannelWorkspace', () => {
  it('renders own-organization inbox without cross-organization filtering', () => {
    const { container, root } = renderWorkspace()
    const html = container.innerHTML

    expect(html).toContain('Central Omnichannel IA')
    expect(html).toContain('Conectar canais')
    expect(html).toContain('Cliente Portal')
    expect(html).not.toContain('Organizacao')

    act(() => root.unmount())
  })

  it('renders sanitized metrics and hides protected internal values', () => {
    const { container, root } = renderWorkspace()
    const html = container.innerHTML

    expect(html).toContain('Volume 14')
    expect(html).toContain('SLA 91%')
    expect(html).toContain('Handoffs 3')
    expect(html).toContain('webchat 10')
    expect(html).not.toContain('internal failure')
    expect(html).not.toContain('internalAiCostMargin')
    expect(html).not.toContain('raw_adapter_payload')
    expect(html).not.toContain('Custo R$')

    act(() => root.unmount())
  })

  it('exposes portal operation controls and simulator for configurators', () => {
    const { container, root, handlers } = renderWorkspace()

    act(() => {
      container.querySelector<HTMLTextAreaElement>('textarea[name="portal-reply"]')!.value = 'Resposta do portal'
      container.querySelector<HTMLButtonElement>('button[title="Responder conversa"]')!.click()
      container.querySelector<HTMLButtonElement>('button[title="Atribuir no portal"]')!.click()
      container.querySelector<HTMLButtonElement>('button[title="Reatribuir no portal"]')!.click()
      container.querySelector<HTMLButtonElement>('button[title="Handoff para YUX"]')!.click()
      container.querySelector<HTMLButtonElement>('button[title="Resolver no portal"]')!.click()
      container.querySelector<HTMLButtonElement>('button[title="Reabrir no portal"]')!.click()
      container.querySelector<HTMLButtonElement>('button[title="Modo manual no portal"]')!.click()
      container.querySelector<HTMLButtonElement>('button[title="Simular evento no portal"]')!.click()
    })

    expect(handlers.onSendReply).toHaveBeenCalledWith('conversation-portal-1', 'Resposta do portal')
    expect(handlers.onAssign).toHaveBeenCalledWith('conversation-portal-1')
    expect(handlers.onReassign).toHaveBeenCalledWith('conversation-portal-1')
    expect(handlers.onHandoff).toHaveBeenCalledWith('conversation-portal-1')
    expect(handlers.onResolve).toHaveBeenCalledWith('conversation-portal-1')
    expect(handlers.onReopen).toHaveBeenCalledWith('conversation-portal-1')
    expect(handlers.onModeChange).toHaveBeenCalledWith('conversation-portal-1', 'manual')
    expect(handlers.onSimulateEvent).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: 'client-org-1',
      channel: 'webchat',
    }))

    act(() => root.unmount())
  })
})
