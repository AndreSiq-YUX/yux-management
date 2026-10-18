import { act } from 'react-dom/test-utils'
import { createRoot } from 'react-dom/client'
import type { ComponentProps } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PortalOmnichannelWorkspace } from './PortalOmnichannelWorkspace'
import { omnichannelService } from '@/services/omnichannelService'
import { usePlatformStore } from '@/stores/platformStore'
import type { OmnichannelMessageView, PortalOmnichannelConversationSummary } from '@/services/omnichannelService'

vi.mock('@/services/omnichannelService', () => ({
  omnichannelService: {
    getMessages: vi.fn(),
  },
}))

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

const internalRole = { key: 'yux_admin', name: 'Admin YUX', scope: 'internal' as const, permissions: [] }
const clientRole = { key: 'client_admin', name: 'Admin da conta', scope: 'client' as const, permissions: [] }

afterEach(() => {
  usePlatformStore.setState({ role: null, mode: 'internal', organization: null })
})

function renderWorkspace(overrides: Partial<ComponentProps<typeof PortalOmnichannelWorkspace>> = {}) {
  const container = document.createElement('div')
  const root = createRoot(container)
  const handlers = {
    onSendReply: vi.fn(),
    onApproveSuggestion: vi.fn(),
    onRetry: vi.fn(),
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

const buttonByText = (container: HTMLElement, text: string) =>
  Array.from(container.querySelectorAll('button')).find(button => button.textContent?.trim() === text)

describe('PortalOmnichannelWorkspace', () => {
  it('renders own-organization inbox with the Conversas title and no internal wording', () => {
    const { container, root } = renderWorkspace()
    const html = container.innerHTML

    expect(container.querySelector('h1')?.textContent).toBe('Conversas')
    expect(html).not.toContain('Central Omnichannel IA')
    expect(html).not.toContain('Inbox Omnichannel')
    expect(html).toContain('Conectar canais')
    expect(html).toContain('Cliente Portal')
    expect(html).not.toContain('Organizacao')
    expect(container.textContent).toContain('Aguardando atendente')

    act(() => root.unmount())
  })

  it('renders real metrics with readable channel names and hides protected internal values', () => {
    const { container, root } = renderWorkspace()
    const html = container.innerHTML
    const text = container.textContent || ''

    expect(text).toContain('Aguardando atendente3')
    expect(text).toContain('Em atendimento pela IA0')
    expect(text).toContain('Resolvidas8')
    expect(text).toContain('Chat do site10')
    expect(text).toContain('WhatsApp4')
    expect(text).not.toContain('Volume')
    expect(html).not.toContain('webchat 10')
    expect(html).not.toContain('internal failure')
    expect(html).not.toContain('internalAiCostMargin')
    expect(html).not.toContain('raw_adapter_payload')
    expect(html).not.toContain('Custo R$')

    act(() => root.unmount())
  })

  it('counts conversations handled by the AI from the inbox', () => {
    const { container, root } = renderWorkspace({
      conversations: [
        { ...conversation, id: 'c-ai-1', status: 'waiting_ai', tags: [] },
        { ...conversation, id: 'c-ai-2', status: 'open', responseMode: 'automatic', assignedUser: undefined, tags: [] },
        { ...conversation, id: 'c-human', status: 'assigned', responseMode: 'automatic', tags: [] },
      ],
      messagesByConversation: { 'c-ai-1': [] },
    })
    expect(container.textContent).toContain('Em atendimento pela IA2')
    act(() => root.unmount())
  })

  it('does not render configuration tabs or hidden test-compatibility controls', () => {
    usePlatformStore.setState({ role: internalRole })
    const { container, root } = renderWorkspace()
    const text = container.textContent || ''

    expect(text).not.toContain('Agente IA Setup')
    expect(text).not.toContain('Equipes e Filas')
    expect(text).not.toContain('Regras de Handoff')
    expect(text).not.toContain('Webchat Widget')
    expect(container.querySelector('[role="tablist"]')).toBeNull()
    expect(container.querySelector('[data-testid^="test-compatibility"]')).toBeNull()
    expect(container.querySelector('[aria-hidden="true"][style*="display: none"]')).toBeNull()
    expect(container.querySelector('button[title="Atribuir no portal"]')).toBeNull()
    expect(container.querySelector('button[title="Handoff para YUX"]')).toBeNull()
    expect(text).not.toContain('Handoff')

    act(() => root.unmount())
  })

  it('shows the response time metric as pending and never a made-up percentage', () => {
    const { container, root } = renderWorkspace({ metrics: {
      totalConversations: 1, openConversations: 1, resolvedConversations: 0, byChannel: {}, handoffCount: 0,
    } })
    const text = container.textContent || ''
    expect(text).toContain('Prazo de resposta')
    expect(container.querySelector('[aria-label^="Pendente"]')).toBeTruthy()
    expect(text).toContain('Pendente')
    expect(text).not.toContain('98%')
    expect(text).not.toContain('91%')
    act(() => root.unmount())
  })

  it('links Conectar canais to the portal channels route', () => {
    const { container, root } = renderWorkspace()
    const link = Array.from(container.querySelectorAll('a')).find(item => item.textContent === 'Conectar canais')
    expect(link?.getAttribute('href')).toBe('/portal/atendimento/canais')
    act(() => root.unmount())
  })

  it('uses the client workspace prefix for the channels link in workspace mode', () => {
    usePlatformStore.setState({ mode: 'client_workspace', organization: { id: 'org-9' } as never })
    const { container, root } = renderWorkspace()
    const link = Array.from(container.querySelectorAll('a')).find(item => item.textContent === 'Conectar canais')
    expect(link?.getAttribute('href')).toBe('/client-workspaces/org-9/atendimento/canais')
    act(() => root.unmount())
  })

  it('hides the event simulator from non-internal roles', () => {
    usePlatformStore.setState({ role: clientRole })
    const { container, root } = renderWorkspace()
    expect(container.querySelector('button[title="Simular evento no portal"]')).toBeNull()
    act(() => root.unmount())
  })

  it('operates the conversation through the real buttons', () => {
    usePlatformStore.setState({ role: internalRole })
    const { container, root, handlers } = renderWorkspace()

    act(() => {
      container.querySelector<HTMLTextAreaElement>('textarea[name="portal-reply"]')!.value = 'Resposta do portal'
      buttonByText(container, 'Enviar')!.click()
      buttonByText(container, 'Reatribuir')!.click()
      buttonByText(container, 'Resolver')!.click()
      buttonByText(container, 'Só atendente')!.click()
      container.querySelector<HTMLButtonElement>('button[title="Simular evento no portal"]')!.click()
    })

    expect(handlers.onSendReply).toHaveBeenCalledWith('conversation-portal-1', 'Resposta do portal')
    expect(handlers.onReassign).toHaveBeenCalledWith('conversation-portal-1')
    expect(handlers.onResolve).toHaveBeenCalledWith('conversation-portal-1')
    expect(handlers.onModeChange).toHaveBeenCalledWith('conversation-portal-1', 'manual')
    expect(handlers.onSimulateEvent).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: 'client-org-1',
      channel: 'webchat',
    }))

    act(() => root.unmount())
  })

  it('keeps the attach control visible as a pending action that does nothing', () => {
    const { container, root, handlers } = renderWorkspace()
    const attach = container.querySelector<HTMLButtonElement>('button[aria-label="Anexar arquivo"]')!
    expect(attach).toBeTruthy()
    expect(container.querySelector('[role="status"]')).toBeNull()

    act(() => { attach.click() })
    const status = container.querySelector('[role="status"]')
    expect(status?.textContent).toContain('Pendente')
    expect(status?.textContent).toContain('em implantação')
    expect(container.querySelector('[aria-label^="Pendente: Anexar arquivos"]')).toBeTruthy()
    expect(handlers.onSendReply).not.toHaveBeenCalled()

    act(() => root.unmount())
  })

  it('lets an attendant take over and transfer an open conversation, and reopen a resolved one', () => {
    const open = renderWorkspace({ conversations: [{ ...conversation, status: 'open', assignedUser: undefined, tags: [] }] })
    act(() => {
      buttonByText(open.container, 'Assumir conversa')!.click()
      buttonByText(open.container, 'Transferir para atendente')!.click()
    })
    expect(open.handlers.onAssign).toHaveBeenCalledWith('conversation-portal-1')
    expect(open.handlers.onHandoff).toHaveBeenCalledWith('conversation-portal-1')
    act(() => open.root.unmount())

    const resolved = renderWorkspace({ conversations: [{ ...conversation, status: 'resolved' }] })
    expect(buttonByText(resolved.container, 'Resolver')).toBeUndefined()
    act(() => { buttonByText(resolved.container, 'Reabrir')!.click() })
    expect(resolved.handlers.onReopen).toHaveBeenCalledWith('conversation-portal-1')
    act(() => resolved.root.unmount())
  })

  it('approves an AI suggestion and retries a failed message from the real buttons', () => {
    const suggestion: OmnichannelMessageView = {
      ...messages[0], id: 'message-ai', direction: 'outbound', authorType: 'ai', deliveryStatus: 'queued', body: 'Posso ajudar com o acesso.',
    }
    const failed: OmnichannelMessageView = {
      ...messages[0], id: 'message-failed', direction: 'outbound', authorType: 'agent', deliveryStatus: 'failed', body: 'Enviando...',
    }
    const { container, root, handlers } = renderWorkspace({
      messagesByConversation: { 'conversation-portal-1': [...messages, suggestion, failed] },
    })
    act(() => {
      buttonByText(container, 'Aprovar e enviar')!.click()
      buttonByText(container, 'Reenviar')!.click()
    })
    expect(handlers.onApproveSuggestion).toHaveBeenCalledWith('message-ai')
    expect(handlers.onRetry).toHaveBeenCalledWith('message-failed')
    act(() => root.unmount())
  })

  it('opens the conversation full screen on mobile and goes back to the list with Voltar', () => {
    const { container, root } = renderWorkspace()
    expect(buttonByText(container, 'Voltar')).toBeUndefined()
    expect(container.querySelector('[data-has-detail="false"]')).toBeTruthy()

    act(() => {
      container.querySelector<HTMLButtonElement>('[aria-label="Lista de conversas"] li button')!.click()
    })
    expect(container.querySelector('[data-has-detail="true"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="master-list"]')?.className).toContain('hidden')
    expect(buttonByText(container, 'Voltar')).toBeTruthy()
    expect(container.querySelector('textarea[name="portal-reply"]')).toBeTruthy()

    act(() => { buttonByText(container, 'Voltar')!.click() })
    expect(container.querySelector('[data-has-detail="false"]')).toBeTruthy()
    expect(buttonByText(container, 'Voltar')).toBeUndefined()

    act(() => root.unmount())
  })

  it('loads a conversation timeline only once when messages are not provided', async () => {
    vi.clearAllMocks()
    vi.mocked(omnichannelService.getMessages).mockResolvedValue(messages)
    const { container, root } = renderWorkspace({ messagesByConversation: undefined })

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(omnichannelService.getMessages).toHaveBeenCalledTimes(1)
    expect(omnichannelService.getMessages).toHaveBeenCalledWith('conversation-portal-1')
    expect(container.textContent).toContain('Preciso falar com suporte.')

    act(() => root.unmount())
  })
})
