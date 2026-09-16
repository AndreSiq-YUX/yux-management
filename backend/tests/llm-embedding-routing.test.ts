import { describe, expect, it, vi } from 'vitest'
import { embedOpenRouterTexts } from '../src/modules/company-intelligence/openrouter-embeddings.js'
import { resolveEmbeddingConfiguration } from '../src/modules/platform/llm-runtime-config.js'

const env = { OPENROUTER_API_KEY: 'test-only', OPENROUTER_EMBEDDING_DIMENSIONS: 1, OPENROUTER_ALLOWED_PAID_MODELS: 'primary,global', SESSION_SECRET: 'test' } as any
const rules = [
  { agent_type: 'knowledge_embeddings', provider: 'openrouter', model_name: 'primary', status: 'active', routing_tier: 'default', fallback_routes: [{ provider: 'openai_direct', modelName: 'fallback' }] },
  { agent_type: 'global_embeddings', provider: 'openrouter', model_name: 'global', status: 'active', routing_tier: 'default' },
]
function pool(routes: Array<Record<string, any>> = rules) { return { query: vi.fn(async (sql: string) => ({ rows: sql.includes('model_routing_rules') ? routes : [] })) } as any }

describe('central embedding routing', () => {
  it('retries the complete batch on a new provider and preserves actual identity', async () => {
    const config = await resolveEmbeddingConfiguration(pool(), { ...env, OPENAI_API_KEY: 'direct-test' })
    const calls: Array<{ url: string; model: string; input: string[] }> = []
    const transport = vi.fn(async (url, init) => {
      const data = JSON.parse(init.body)
      calls.push({ url, ...data })
      if (data.model === 'primary' && calls.length === 2) return new Response('{}', { status: 503 })
      return new Response(JSON.stringify({ model: data.model === 'fallback' ? 'actual-fallback' : data.model, data: data.input.map((_: string, index: number) => ({ index, embedding: [1] })) }))
    }) as any
    const texts = Array.from({ length: 33 }, (_, i) => String(i))
    const result = await embedOpenRouterTexts(env, texts, 'search_document', transport, undefined, config)
    expect(calls.map(c => c.model)).toEqual(['primary', 'primary', 'fallback', 'fallback'])
    expect(calls[2].input).toEqual(texts.slice(0, 32))
    expect(calls[2].url).toBe('https://api.openai.com/v1/embeddings')
    expect(result).toMatchObject({ provider: 'openai_direct', model: 'actual-fallback', dimensions: 1 })
    expect(result.vectors).toHaveLength(33)
  })

  it('does not select another tenant or an unrelated premium route', async () => {
    const config = await resolveEmbeddingConfiguration(pool([
      { ...rules[0], organization_id: 'other' }, { ...rules[0], routing_tier: 'premium' }, rules[1],
    ]), env, { organizationId: 'mine' })
    expect(config.attempts.map(a => a.model)).toEqual(['global'])
  })

  it('does not bypass a paused route', async () => {
    await expect(resolveEmbeddingConfiguration(pool([{ ...rules[0], status: 'paused' }, rules[1]]), env)).rejects.toThrow('llm_route_not_active')
  })

  it('ignores scoped and non-default historical globals even when their context matches', async () => {
    const config = await resolveEmbeddingConfiguration(pool([
      { ...rules[1], model_name: 'scoped-global', organization_id: 'mine' },
      { ...rules[1], model_name: 'premium-global', routing_tier: 'premium' },
      rules[1],
    ]), env, { organizationId: 'mine', routingTier: 'premium' })
    expect(config.attempts.map(attempt => attempt.model)).toEqual(['global'])
  })

  it('does not bypass provider authorization with fallback', async () => {
    const config = await resolveEmbeddingConfiguration(pool(), env)
    const transport = vi.fn(async () => new Response('{}', { status: 403 })) as any
    await expect(embedOpenRouterTexts(env, ['a'], 'search_query', transport, undefined, config)).rejects.toThrow('embeddings_http_403')
    expect(transport).toHaveBeenCalledTimes(1)
  })

  it('uses explicit fallback when primary credentials are unavailable', async () => {
    const config = await resolveEmbeddingConfiguration(pool(), { ...env, OPENROUTER_API_KEY: undefined, OPENAI_API_KEY: 'direct-test' })
    const transport = vi.fn(async (_url, init) => {
      const payload = JSON.parse(init.body)
      return new Response(JSON.stringify({ model: payload.model, data: [{ index: 0, embedding: [1] }] }))
    }) as any
    const result = await embedOpenRouterTexts(env, ['a'], 'search_query', transport, undefined, config)
    expect(result.provider).toBe('openai_direct')
    expect(result.model).toBe('fallback')
    expect(transport).toHaveBeenCalledTimes(1)
  })

  it('preserves legacy env credentials when reference exists without a stored secret', async () => {
    const database = { query: vi.fn(async (sql: string) => ({ rows: sql.includes('model_routing_rules') ? [] : sql.includes('platform_provider_connections') ? [{ id: 'provider', status: 'not_configured', secret_reference: 'OPENROUTER_API_KEY', public_config: {} }] : [] })) } as any
    const config = await resolveEmbeddingConfiguration(database, env)
    expect(config.attempts[0].apiKey).toBe('test-only')
    expect(config.attempts[0].credentialError).toBeUndefined()
  })
})
