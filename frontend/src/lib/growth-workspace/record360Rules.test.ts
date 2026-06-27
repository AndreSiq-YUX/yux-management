import { describe, expect, it } from 'vitest'
import {
  buildRecord360Tabs,
  pickNextBestAction,
  summarizeAssociations,
  summarizeMissingRecordData,
} from './record360Rules'
import type { Record360Input } from '@/types/growthWorkspace'

const completeRecord: Record360Input = {
  type: 'lead',
  recordId: 'lead-1',
  name: 'Ana Lead',
  email: 'ana@example.com',
  phone: '+55 11 99999-0000',
  ownerId: 'owner-1',
  companyName: 'Clinica Alpha',
  source: 'Meta Ads',
  nextActionLabel: 'Ligar para Ana',
}

describe('record360Rules', () => {
  it('builds core tabs and marks optional tabs from loaded module signals', () => {
    const tabs = buildRecord360Tabs({
      ...completeRecord,
      conversationCount: 0,
      proposalCount: 0,
      revenueValue: 0,
      aiInsightCount: 0,
    })

    expect(tabs.map(tab => tab.label)).toEqual([
      'Resumo',
      'Sobre',
      'Atividades',
      'Conversas',
      'Propostas & Receita',
      'Inteligencia',
    ])
    expect(tabs.filter(tab => tab.isAvailable).map(tab => tab.key)).toEqual(['summary', 'about', 'activities'])
  })

  it('enables optional tabs when conversations, revenue or intelligence are available', () => {
    const tabs = buildRecord360Tabs({
      ...completeRecord,
      conversationCount: 2,
      revenueValue: 25000,
      aiSummary: 'Lead com alta intencao de compra.',
    })

    expect(tabs.filter(tab => tab.isAvailable).map(tab => tab.key)).toEqual([
      'summary',
      'about',
      'activities',
      'conversations',
      'proposals_revenue',
      'intelligence',
    ])
  })

  it('summarizes missing record data for required 360 fields', () => {
    const missing = summarizeMissingRecordData({
      type: 'lead',
      name: 'Lead incompleto',
      email: '',
      phone: undefined,
      ownerId: null,
      companyName: '',
      source: null,
      tasks: [],
    })

    expect(missing.map(item => item.key)).toEqual([
      'email',
      'phone',
      'owner',
      'company',
      'source',
      'nextAction',
    ])
    expect(summarizeMissingRecordData(completeRecord)).toEqual([])
  })

  it('prioritizes overdue task, open proposal, unanswered conversation, missing owner, AI and fallback actions', () => {
    expect(pickNextBestAction({
      ...completeRecord,
      currentDate: '2026-06-08T15:00:00.000Z',
      tasks: [{
        id: 'task-1',
        title: 'Retornar ligacao',
        dueAt: '2026-06-08T10:00:00.000Z',
        status: 'pending',
      }],
      openProposalCount: 1,
    })).toMatchObject({
      kind: 'overdue_task',
      label: 'Retornar ligacao',
      priority: 1,
      sourceId: 'task-1',
    })

    expect(pickNextBestAction({
      ...completeRecord,
      proposals: [{ id: 'proposal-1', title: 'Proposta Enterprise', status: 'sent' }],
      hasRecentUnansweredConversation: true,
    })).toMatchObject({
      kind: 'open_proposal',
      label: 'Proposta Enterprise',
      priority: 2,
      sourceId: 'proposal-1',
    })

    expect(pickNextBestAction({
      ...completeRecord,
      recentUnansweredConversationAt: '2026-06-08T12:00:00.000Z',
    })).toMatchObject({
      kind: 'unanswered_conversation',
      priority: 3,
    })

    expect(pickNextBestAction({
      ...completeRecord,
      ownerId: undefined,
      ownerName: undefined,
      assignedTo: undefined,
    })).toMatchObject({
      kind: 'missing_owner',
      priority: 4,
    })

    expect(pickNextBestAction({
      ...completeRecord,
      aiSuggestedAction: 'Enviar comparativo de planos',
    })).toMatchObject({
      kind: 'ai_suggestion',
      label: 'Enviar comparativo de planos',
      priority: 5,
    })

    expect(pickNextBestAction(completeRecord)).toMatchObject({
      kind: 'review',
      priority: 6,
    })
  })

  it('summarizes association counts for all record association kinds', () => {
    const associations = summarizeAssociations({
      ...completeRecord,
      associationCounts: {
        campaigns: 3,
        documents: 2,
      },
      contactCount: 4,
      opportunityCount: 1,
      ticketCount: 5,
      contractCount: 1,
      invoiceCount: 7,
      automationCount: 2,
    })

    expect(associations).toEqual([
      { kind: 'company', label: 'Empresa', count: 1 },
      { kind: 'contacts', label: 'Contatos', count: 4 },
      { kind: 'opportunities', label: 'Oportunidades', count: 1 },
      { kind: 'campaigns', label: 'Campanhas', count: 3 },
      { kind: 'tickets', label: 'Tickets', count: 5 },
      { kind: 'documents', label: 'Documentos', count: 2 },
      { kind: 'contracts', label: 'Contratos', count: 1 },
      { kind: 'invoices', label: 'Faturas', count: 7 },
      { kind: 'automations', label: 'Automacoes', count: 2 },
    ])
  })
})
