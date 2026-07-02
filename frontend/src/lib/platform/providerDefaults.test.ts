import { describe, expect, it } from 'vitest'
import { cnpjaProviderDefaults, jinaAiProviderDefaults } from './providerDefaults'

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

  it('defines CNPJa as an admin-managed internal service provider', () => {
    expect(cnpjaProviderDefaults).toEqual(expect.objectContaining({
      providerType: 'internal_service',
      providerKey: 'cnpja',
      displayName: 'CNPJa',
      secretReference: 'cnpja:api_key',
      isDefault: true,
    }))
    expect(cnpjaProviderDefaults.publicConfig).toEqual(expect.objectContaining({
      baseUrl: 'https://api.cnpja.com',
      advancedSearchPath: '/office/search',
      officeLookupPath: '/office/:taxId',
      requiredSecret: 'cnpja:api_key',
    }))
    expect(JSON.stringify(cnpjaProviderDefaults)).not.toContain('sk-')
  })
})
