import { describe, expect, it } from 'vitest'
import { jinaAiProviderDefaults } from './providerDefaults'

describe('providerDefaults', () => {
  it('defines Jina AI as a safe global internal service provider', () => {
    expect(jinaAiProviderDefaults).toEqual(expect.objectContaining({
      providerType: 'internal_service',
      providerKey: 'jina_ai',
      displayName: 'Jina AI',
      secretReference: 'JINA_API_KEY',
      isDefault: true,
    }))
    expect(jinaAiProviderDefaults.publicConfig).toEqual(expect.objectContaining({
      readerBaseUrl: 'https://r.jina.ai',
      searchBaseUrl: 'https://s.jina.ai',
      readerTool: 'jina_reader',
      searchTool: 'jina_search',
      groundingTool: 'jina_grounding',
      requiredSecret: 'JINA_API_KEY',
    }))
    expect(JSON.stringify(jinaAiProviderDefaults)).not.toContain('sk-')
  })
})
