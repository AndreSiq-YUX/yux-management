import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CompanyKnowledgeDocument, KnowledgeProcessingResult } from '@/types/companyIntelligence'

const service = vi.hoisted(() => ({
  getKnowledgeProcessing: vi.fn(),
  publishKnowledge: vi.fn(),
  updateKnowledge: vi.fn(),
  reviewKnowledgeChunk: vi.fn(),
  archiveKnowledge: vi.fn(),
  getKnowledgeUsage: vi.fn(),
}))

vi.mock('@/services/companyIntelligenceService', () => ({ companyIntelligenceService: service }))

import { KnowledgeLibrary } from './KnowledgeLibrary'

const documentFixture: CompanyKnowledgeDocument = {
  id: '10000000-0000-4000-8000-000000000001', organizationId: '10000000-0000-4000-8000-000000000002',
  clientId: '10000000-0000-4000-8000-000000000003', contractId: '10000000-0000-4000-8000-000000000004',
  sourceId: '10000000-0000-4000-8000-000000000005', entryId: '10000000-0000-4000-8000-000000000006',
  title: 'Conhecimento governado', documentType: 'other', status: 'indexed', sourceType: 'manual', sourceStatus: 'indexed',
  visibility: 'both', allowedAgentProfileKeys: ['growth_strategist'], blockedAgentProfileKeys: [], governanceVersion: 7,
  metadata: {}, createdAt: '2026-09-06T00:00:00.000Z', updatedAt: '2026-09-06T00:00:00.000Z',
}

describe('KnowledgeLibrary publication dialog', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true)
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    service.getKnowledgeProcessing.mockReset()
    service.publishKnowledge.mockReset()
    service.getKnowledgeUsage.mockReset()
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
  })

  it('publica as regras locais e somente os itens aprovados da confirmação', async () => {
    const processing: KnowledgeProcessingResult = {
      document: documentFixture,
      run: null,
      chunks: [{
        id: '20000000-0000-4000-8000-000000000001', chunkKind: 'curated_fact', body: 'Atendimento nacional.',
        sourceLocator: 'section:1', evidenceExcerpt: 'atende todo o Brasil', curationStatus: 'approved', metadata: {},
      }],
    }
    service.getKnowledgeProcessing.mockResolvedValue(processing)
    service.publishKnowledge.mockResolvedValue({
      ...documentFixture, governanceVersion: 8, visibility: 'internal', publicationId: '30000000-0000-4000-8000-000000000001', version: 2, contentHash: 'a'.repeat(64),
    })
    const onChanged = vi.fn()
    await act(async () => root.render(<KnowledgeLibrary documents={[documentFixture]} onChanged={onChanged} />))
    await act(async () => Array.from(container.querySelectorAll('button')).find(button => button.textContent?.includes('Revisar'))!.click())
    await act(async () => { await Promise.resolve() })
    const visibility = document.querySelector<HTMLSelectElement>('#knowledge-review-visibility')!
    await act(async () => setSelectValue(visibility, 'internal'))
    const publish = Array.from(document.querySelectorAll('button')).find(button => button.textContent?.includes('Publicar conhecimento aprovado'))!
    await act(async () => publish.click())
    expect(service.publishKnowledge).toHaveBeenCalledWith(documentFixture.id, {
      expectedVersion: 7,
      visibility: 'internal',
      allowedAgentProfileKeys: ['growth_strategist'],
      blockedAgentProfileKeys: [],
      approvedItemIds: [processing.chunks[0].id],
    })
    expect(document.querySelector('[role="status"]')?.textContent).toContain('Publicação v2 salva')
    expect(onChanged).toHaveBeenCalled()
  })

  it('só apresenta uso confirmado quando o rastreio acessível pode ser aberto', async () => {
    const used = { ...documentFixture, status: 'published' as const, currentPublicationId: 'publication-1', lastUsedQueryId: 'query-1' }
    service.getKnowledgeUsage.mockResolvedValue({
      id: 'query-1', organizationId: used.organizationId, profileKey: 'growth_strategist', query: 'política de atendimento',
      intent: 'authorized_knowledge_v1', portalSafe: true, filters: { moduleKey: 'omnichannel' },
      resultCardIds: [], resultChunkIds: ['chunk-1'], scoreMetadata: { sourceCount: 1 }, status: 'succeeded', createdAt: used.updatedAt,
    })
    await act(async () => root.render(<KnowledgeLibrary documents={[used]} onChanged={vi.fn()} />))
    expect(container.textContent).toContain('Uso confirmado: query-1')
    const usage = Array.from(container.querySelectorAll('button')).find(button => button.textContent?.includes('Ver último uso'))!
    await act(async () => { usage.click(); await Promise.resolve() })
    expect(service.getKnowledgeUsage).toHaveBeenCalledWith(used.organizationId, 'query-1')
    expect(document.body.textContent).toContain('política de atendimento')
    expect(document.body.textContent).toContain('omnichannel')
  })
})

function setSelectValue(select: HTMLSelectElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set
  setter?.call(select, value)
  select.dispatchEvent(new Event('change', { bubbles: true }))
}
