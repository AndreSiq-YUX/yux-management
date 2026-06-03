import { act } from 'react-dom/test-utils'
import { createRoot } from 'react-dom/client'
import type { ComponentProps } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { OmnichannelWorkspace } from './OmnichannelWorkspace'
import type { OmnichannelAiRunView, OmnichannelConversationSummary, OmnichannelMessageView } from '@/services/omnichannelService'

const conversation: OmnichannelConversationSummary = {
  id: 'conversation-1',
  organizationId: 'org-1',
  contactId: 'contact-1',
  connectionId: 'connection-1',
  channel: 'whatsapp',
  status: 'waiting_human',
  responseMode: 'assisted',
  queueId: 'queue-1',
  teamId: 'team-1',
  assignedUserId: 'user-1',
  leadId: 'lead-1',
  subject: 'Compra enterprise',
  summary: 'Lead pediu preco e agenda para implantacao.',
  classification: 'lead_qualificado',
  sentiment: 'positive',
  commercialIntent: 'purchase',
  schedulingIntent: 'requested',
  lastMessageAt: '2026-05-30T12:00:00.000Z',
  slaDeadlineAt: '2026-05-30T13:00:00.000Z',
  createdAt: '2026-05-30T11:00:00.000Z',
  updatedAt: '2026-05-30T12:00:00.000Z',
  contact: {
    id: 'contact-1',
    displayName: 'Maria Cliente',
    email: 'maria@example.com',
    phone: '+5511999999999',
    leadId: 'lead-1',
  },
  connection: {
    id: 'connection-1',
    channel: 'whatsapp',
    name: 'WhatsApp Comercial',
    adapterKey: 'meta-whatsapp',
    isActive: true,
    phoneNumberId: 'phone-number-1',
    providerVerifyState: 'verified',
    tokenState: 'connected',
    lastProviderSyncAt: '2026-05-30T12:03:00.000Z',
    health: { state: 'healthy', label: 'WhatsApp conectado' },
  },
  queue: { id: 'queue-1', name: 'Comercial' },
  team: { id: 'team-1', name: 'Vendas' },
  assignedUser: { id: 'user-1', name: 'Ana YUX' },
  tags: ['urgente', 'handoff'],
}

const messages: OmnichannelMessageView[] = [
  {
    id: 'message-1',
    conversationId: 'conversation-1',
    direction: 'inbound',
    authorType: 'contact',
    contentType: 'text',
    body: 'Quero falar com uma pessoa e ver proposta.',
    deliveryStatus: 'delivered',
    metadata: {},
    createdAt: '2026-05-30T12:01:00.000Z',
    updatedAt: '2026-05-30T12:01:00.000Z',
    attachments: [
      {
        id: 'attachment-1',
        messageId: 'message-1',
        storagePath: 'org-1/conversation-1/brief.pdf',
        filename: 'brief.pdf',
        mimeType: 'application/pdf',
        byteSize: 1024,
        createdAt: '2026-05-30T12:01:00.000Z',
        updatedAt: '2026-05-30T12:01:00.000Z',
      },
    ],
  },
  {
    id: 'message-2',
    conversationId: 'conversation-1',
    direction: 'outbound',
    authorType: 'ai',
    contentType: 'text',
    body: 'Sugestao assistida pronta para aprovacao.',
    deliveryStatus: 'queued',
    metadata: { suggestion: true },
    createdAt: '2026-05-30T12:02:00.000Z',
    updatedAt: '2026-05-30T12:02:00.000Z',
    attachments: [],
  },
]

const aiRuns: OmnichannelAiRunView[] = [
  {
    id: 'run-1',
    organizationId: 'org-1',
    conversationId: 'conversation-1',
    outboundMessageId: 'message-2',
    logicalProvider: 'n8n',
    model: 'logical-support',
    status: 'completed',
    inputTokens: 1200,
    outputTokens: 260,
    estimatedCost: 0.034,
    latencyMs: 870,
    fallbackUsed: false,
    metadata: { confidence: 0.82 },
    createdAt: '2026-05-30T12:02:00.000Z',
    updatedAt: '2026-05-30T12:02:00.000Z',
  },
]

function renderWorkspace(overrides: Partial<ComponentProps<typeof OmnichannelWorkspace>> = {}) {
  const container = document.createElement('div')
  const root = createRoot(container)
  const handlers = {
    onSendReply: vi.fn(),
    onApproveSuggestion: vi.fn(),
    onAssign: vi.fn(),
    onReassign: vi.fn(),
    onHandoff: vi.fn(),
    onResolve: vi.fn(),
    onReopen: vi.fn(),
    onRetry: vi.fn(),
    onModeChange: vi.fn(),
    onSimulateEvent: vi.fn(),
  }

  act(() => {
    root.render(
      <OmnichannelWorkspace
        organizationId="org-1"
        conversations={[conversation]}
        messagesByConversation={{ 'conversation-1': messages }}
        aiRunsByConversation={{ 'conversation-1': aiRuns }}
        queues={[{ id: 'queue-1', name: 'Comercial' }]}
        teams={[{ id: 'team-1', name: 'Vendas' }]}
        users={[{ id: 'user-1', name: 'Ana YUX' }]}
        {...handlers}
        {...overrides}
      />,
    )
  })

  return { container, root, handlers }
}

describe('OmnichannelWorkspace', () => {
  it('renders operational filters for the internal inbox', () => {
    const { container, root } = renderWorkspace()
    const html = container.innerHTML

    expect(html).toContain('Organizacao')
    expect(html).toContain('Canal')
    expect(html).toContain('Fila')
    expect(html).toContain('Equipe')
    expect(html).toContain('Responsavel')
    expect(html).toContain('Status')
    expect(html).toContain('SLA')
    expect(html).toContain('Tag')
    expect(html).toContain('Handoff')

    act(() => root.unmount())
  })

  it('renders conversation timeline, AI trace, CRM link, assignment, and attachments', () => {
    const { container, root } = renderWorkspace()
    const html = container.innerHTML

    expect(html).toContain('Maria Cliente')
    expect(html).toContain('Quero falar com uma pessoa')
    expect(html).toContain('brief.pdf')
    expect(html).toContain('Lead pediu preco')
    expect(html).toContain('WhatsApp conectado')
    expect(html).toContain('Telefone ID')
    expect(html).toContain('phone-number-1')
    expect(html).toContain('Envio manual')
    expect(html).toContain('Handoff')
    expect(html).toContain('lead_qualificado')
    expect(html).toContain('Confianca 82%')
    expect(html).toContain('Custo R$ 0,0340')
    expect(html).toContain('Latencia 870 ms')
    expect(html).toContain('CRM lead-1')
    expect(html).toContain('Comercial')
    expect(html).toContain('Ana YUX')

    act(() => root.unmount())
  })

  it('exposes agent, assignment, retry, mode, and simulator commands', () => {
    const { container, root, handlers } = renderWorkspace()

    act(() => {
      container.querySelector<HTMLTextAreaElement>('textarea[name="reply"]')!.value = 'Resposta humana'
      container.querySelector<HTMLTextAreaElement>('textarea[name="reply"]')!.dispatchEvent(new Event('input', { bubbles: true }))
      container.querySelector<HTMLButtonElement>('button[title="Enviar resposta"]')!.click()
      container.querySelector<HTMLButtonElement>('button[title="Aprovar resposta assistida"]')!.click()
      container.querySelector<HTMLButtonElement>('button[title="Atribuir conversa"]')!.click()
      container.querySelector<HTMLButtonElement>('button[title="Reatribuir conversa"]')!.click()
      container.querySelector<HTMLButtonElement>('button[title="Handoff manual"]')!.click()
      container.querySelector<HTMLButtonElement>('button[title="Resolver conversa"]')!.click()
      container.querySelector<HTMLButtonElement>('button[title="Reabrir conversa"]')!.click()
      container.querySelector<HTMLButtonElement>('button[title="Tentar novamente"]')!.click()
      container.querySelector<HTMLButtonElement>('button[title="Modo manual"]')!.click()
      container.querySelector<HTMLButtonElement>('button[title="Enviar evento simulado"]')!.click()
    })

    expect(handlers.onSendReply).toHaveBeenCalledWith('conversation-1', 'Resposta humana')
    expect(handlers.onApproveSuggestion).toHaveBeenCalledWith('message-2')
    expect(handlers.onAssign).toHaveBeenCalledWith('conversation-1')
    expect(handlers.onReassign).toHaveBeenCalledWith('conversation-1')
    expect(handlers.onHandoff).toHaveBeenCalledWith('conversation-1')
    expect(handlers.onResolve).toHaveBeenCalledWith('conversation-1')
    expect(handlers.onReopen).toHaveBeenCalledWith('conversation-1')
    expect(handlers.onRetry).toHaveBeenCalledWith('message-2')
    expect(handlers.onModeChange).toHaveBeenCalledWith('conversation-1', 'manual')
    expect(handlers.onSimulateEvent).toHaveBeenCalledWith(expect.objectContaining({
      channel: 'whatsapp',
      organizationId: 'org-1',
    }))

    act(() => root.unmount())
  })
})
