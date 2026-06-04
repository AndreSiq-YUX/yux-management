import { act } from 'react-dom/test-utils'
import { createRoot } from 'react-dom/client'
import { describe, expect, it } from 'vitest'
import { LeadAiInsightPanel } from './LeadAiInsightPanel'
import { LeadConversationPanel } from './LeadConversationPanel'
import { LeadResponseComposer } from './LeadResponseComposer'
import type { CrmLead } from '@/types/crm'

const lead: CrmLead = {
  id: 'lead-1',
  organizationId: 'org-1',
  crmInstanceId: 'crm-1',
  pipelineId: 'pipeline-1',
  stageId: 'stage-1',
  name: 'Ana Lead',
  email: 'ana@example.com',
  phone: '+55 11 99999-0000',
  source: 'WhatsApp',
  status: 'open',
  score: 70,
  whatsappOptIn: true,
  createdAt: '2026-06-04T12:00:00Z',
  updatedAt: '2026-06-04T12:00:00Z',
}

describe('CRM WhatsApp AI panels', () => {
  it('renders conversation, insight and response panels', async () => {
    const container = document.createElement('div')
    const root = createRoot(container)

    await act(async () => {
      root.render(
        <div>
          <LeadConversationPanel
            conversations={[{
              id: 'link-1',
              organizationId: 'org-1',
              crmInstanceId: 'crm-1',
              leadId: 'lead-1',
              conversationId: 'conversation-1',
              channel: 'whatsapp',
              status: 'linked',
              matchMethod: 'phone',
              matchScore: 95,
              createdAt: '2026-06-04T12:00:00Z',
              updatedAt: '2026-06-04T12:00:00Z',
              conversation: { id: 'conversation-1', status: 'open', summary: 'Quer agendar consulta' },
            }]}
          />
          <LeadAiInsightPanel
            lead={lead}
            insights={[{
              id: 'insight-1',
              organizationId: 'org-1',
              crmInstanceId: 'crm-1',
              leadId: 'lead-1',
              summary: 'Lead quer uma agenda ainda hoje',
              intent: 'agendamento',
              sentiment: 'positive',
              urgency: 'high',
              objections: ['preco'],
              risks: [],
              nextBestAction: 'Responder com horarios',
              confidence: 0.91,
              createdAt: '2026-06-04T12:00:00Z',
            }]}
          />
          <LeadResponseComposer
            lead={lead}
            suggestions={[{
              id: 'response-1',
              organizationId: 'org-1',
              crmInstanceId: 'crm-1',
              leadId: 'lead-1',
              conversationId: 'conversation-1',
              channel: 'whatsapp',
              body: 'Posso te passar os horarios.',
              status: 'draft',
              requiresApproval: true,
              createdAt: '2026-06-04T12:00:00Z',
              updatedAt: '2026-06-04T12:00:00Z',
            }]}
          />
        </div>,
      )
    })

    expect(container.innerHTML).toContain('Conversas vinculadas')
    expect(container.innerHTML).toContain('Inteligencia do lead')
    expect(container.innerHTML).toContain('Resposta assistida')

    act(() => root.unmount())
  })
})
