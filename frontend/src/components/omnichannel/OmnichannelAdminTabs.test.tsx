import { act } from 'react-dom/test-utils'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import { OmnichannelAdminTabs } from './OmnichannelAdminTabs'

function renderTabs(portal = false) {
  const container = document.createElement('div')
  const root = createRoot(container)
  const handlers = {
    onSaveTeam: vi.fn(),
    onSaveQueue: vi.fn(),
    onSaveRule: vi.fn(),
    onSaveSettings: vi.fn(),
    onSaveAssistant: vi.fn(),
    onCreateKnowledgeDraft: vi.fn(),
    onSubmitKnowledgeReview: vi.fn(),
    onPublishKnowledge: vi.fn(),
    onSaveWidget: vi.fn(),
    onRotateWidgetToken: vi.fn(),
  }

  act(() => {
    root.render(
      <OmnichannelAdminTabs
        organizationId="org-1"
        profile={portal ? 'portal' : 'internal'}
        teams={[{ id: 'team-1', name: 'Vendas', availabilityMode: 'business_hours', isActive: true, members: [{ id: 'member-1', name: 'Ana', available: true }] }]}
        queues={[{ id: 'queue-1', name: 'Comercial', strategy: 'round_robin', teamName: 'Vendas', isActive: true }]}
        rules={[{ id: 'rule-1', name: 'Lead urgente', priority: 10, combinator: 'any', conditions: ['purchase_intent'], outcome: 'route:Comercial', isEnabled: true }]}
        settings={{
          responseMode: 'assisted',
          businessHours: '09:00-18:00',
          retentionMonths: 12,
          attachmentRetentionMonths: 3,
          anonymizeOnRetention: true,
          crmFilters: 'qualified,webchat',
          aiLogicalProvider: 'n8n',
          aiModel: 'logical-support',
          tokenPrices: 'input=1;output=2',
        }}
        assistant={{
          id: 'assistant-1',
          organizationId: 'org-1',
          name: 'SDR Comercial',
          tone: 'consultivo',
          status: 'active',
          summaryEnabled: true,
          classificationEnabled: true,
          objectives: [{ id: 'objective-1', label: 'Qualificar lead', objectiveType: 'lead_qualification' }],
          requiredFields: [{ id: 'field-1', fieldKey: 'phone', label: 'Telefone' }],
          handoffRules: [{ id: 'handoff-1', name: 'Reclamacao negativa', ruleType: 'sentiment_intent', conditions: {}, isEnabled: true }],
          safetyRules: [{ id: 'safety-1', name: 'LGPD', ruleType: 'privacy', instructions: 'Nao expor dados.', severity: 'high', isEnabled: true }],
          knowledgeLinks: [{ id: 'knowledge-1', title: 'FAQ publicada', status: 'published' }],
          createdAt: '2026-06-03T12:00:00.000Z',
          updatedAt: '2026-06-03T12:00:00.000Z',
        }}
        whatsappProvider={{
          providerAccountId: 'waba-1',
          phoneNumberId: 'phone-number-1',
          providerVerifyState: 'verified',
          tokenState: 'connected',
          lastProviderSyncAt: '2026-06-01T12:15:00Z',
          protectedReferences: ['accessTokenEnv'],
        }}
        knowledge={{
          drafts: [{ id: 'draft-1', title: 'FAQ preco', status: 'draft' }],
          publications: [{ id: 'pub-1', title: 'FAQ publicada', bodySnapshot: 'Snapshot imutavel' }],
        }}
        widget={{
          name: 'Widget site',
          isActive: true,
          branding: 'YUX verde',
          consentText: 'Aceito contato',
          initialForm: 'nome,email',
          allowedOrigins: ['https://cliente.example.com'],
          embedSnippet: '<script src="/yux-webchat.js"></script>',
        }}
        metrics={{
          volume: 42,
          slaRate: 0.95,
          handoffCount: 7,
          channelMix: { webchat: 30, whatsapp: 12 },
          aiCost: 19.45,
          latencyMs: 810,
        }}
        {...handlers}
      />,
    )
  })

  return { container, root, handlers }
}

describe('OmnichannelAdminTabs', () => {
  it('renders teams, queues, handoff rules, settings, knowledge, widget, and internal metrics', () => {
    const { container, root } = renderTabs()
    const html = container.innerHTML

    expect(html).toContain('Equipes e filas')
    expect(html).toContain('Ana disponivel')
    expect(html).toContain('round_robin')
    expect(html).toContain('Lead urgente')
    expect(html).toContain('Prioridade 10')
    expect(html).toContain('purchase_intent')
    expect(html).toContain('Modo assisted')
    expect(html).toContain('Provider WhatsApp')
    expect(html).toContain('Assistente IA')
    expect(html).toContain('SDR Comercial')
    expect(html).toContain('Qualificar lead')
    expect(html).toContain('Reclamacao negativa')
    expect(html).toContain('FAQ publicada')
    expect(html).toContain('Telefone ID phone-number-1')
    expect(html).toContain('Token connected')
    expect(html).toContain('Referencias protegidas accessTokenEnv')
    expect(html).toContain('Retencao 12 meses')
    expect(html).toContain('Anonymizacao ativa')
    expect(html).toContain('FAQ preco')
    expect(html).toContain('Snapshot imutavel')
    expect(html).toContain('https://cliente.example.com')
    expect(html).toContain('/yux-webchat.js')
    expect(html).toContain('Custo IA R$ 19,45')
    expect(html).toContain('Latencia 810 ms')
    expect(html).toContain('Logs e simulador')

    act(() => root.unmount())
  })

  it('exposes explicit save and publication actions', () => {
    const { container, root, handlers } = renderTabs()

    act(() => {
      container.querySelector<HTMLButtonElement>('button[title="Salvar equipe"]')!.click()
      container.querySelector<HTMLButtonElement>('button[title="Salvar fila"]')!.click()
      container.querySelector<HTMLButtonElement>('button[title="Salvar regra"]')!.click()
      container.querySelector<HTMLButtonElement>('button[title="Salvar configuracoes"]')!.click()
      container.querySelector<HTMLButtonElement>('button[title="Salvar assistente IA"]')!.click()
      container.querySelector<HTMLButtonElement>('button[title="Criar rascunho de conhecimento"]')!.click()
      container.querySelector<HTMLButtonElement>('button[title="Enviar conhecimento para revisao"]')!.click()
      container.querySelector<HTMLButtonElement>('button[title="Publicar conhecimento"]')!.click()
      container.querySelector<HTMLButtonElement>('button[title="Salvar widget"]')!.click()
      container.querySelector<HTMLButtonElement>('button[title="Regenerar token do widget"]')!.click()
    })

    expect(handlers.onSaveTeam).toHaveBeenCalledWith('team-1')
    expect(handlers.onSaveQueue).toHaveBeenCalledWith('queue-1')
    expect(handlers.onSaveRule).toHaveBeenCalledWith('rule-1')
    expect(handlers.onSaveSettings).toHaveBeenCalledWith('org-1')
    expect(handlers.onSaveAssistant).toHaveBeenCalledWith('org-1')
    expect(handlers.onCreateKnowledgeDraft).toHaveBeenCalledWith('org-1')
    expect(handlers.onSubmitKnowledgeReview).toHaveBeenCalledWith('draft-1')
    expect(handlers.onPublishKnowledge).toHaveBeenCalledWith('draft-1')
    expect(handlers.onSaveWidget).toHaveBeenCalledWith('org-1')
    expect(handlers.onRotateWidgetToken).toHaveBeenCalledWith('org-1')

    act(() => root.unmount())
  })

  it('removes internal-only metrics and logs for portal profile', () => {
    const { container, root } = renderTabs(true)
    const html = container.innerHTML

    expect(html).toContain('Volume 42')
    expect(html).toContain('SLA 95%')
    expect(html).not.toContain('Custo IA')
    expect(html).not.toContain('Latencia 810 ms')
    expect(html).not.toContain('Logs e simulador')

    act(() => root.unmount())
  })
})
