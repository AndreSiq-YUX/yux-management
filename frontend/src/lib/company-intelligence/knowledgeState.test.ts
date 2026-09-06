import { describe, expect, it } from 'vitest'
import { knowledgeProcessingErrorMessage, labelForKnowledgeState } from './knowledgeState'

describe('knowledge state labels', () => {
  it('separa indexação, publicação, elegibilidade e uso efetivo', () => {
    expect(labelForKnowledgeState({ documentStatus: 'indexed', publicationId: null, eligibleProfiles: [], lastUsedQueryId: null })).toBe('Pronto para revisão')
    expect(labelForKnowledgeState({ documentStatus: 'published', publicationId: 'pub-1', eligibleProfiles: ['growth_strategist'], lastUsedQueryId: null })).toBe('Publicado')
    expect(labelForKnowledgeState({ documentStatus: 'published', publicationId: 'pub-1', eligibleProfiles: ['growth_strategist'], lastUsedQueryId: 'query-1' })).toBe('Usado por agente')
  })

  it('distingue falha de embeddings de fonte ausente', () => {
    expect(knowledgeProcessingErrorMessage('jina_embeddings_http_503')).toContain('busca inteligente')
    expect(knowledgeProcessingErrorMessage('knowledge_source_fetch_failed')).toContain('fonte')
  })
})
