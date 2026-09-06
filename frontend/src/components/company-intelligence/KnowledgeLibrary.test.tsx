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
})

function setSelectValue(select: HTMLSelectElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set
  setter?.call(select, value)
  select.dispatchEvent(new Event('change', { bubbles: true }))
}
