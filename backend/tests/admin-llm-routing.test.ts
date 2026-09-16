import type pg from 'pg'
import { describe, expect, it, vi } from 'vitest'
import { getAdminLlmRoutes, upsertAdminLlmRoute } from '../src/modules/platform/adminRepository.js'
import { getAdminLlmUseCases } from '../src/modules/platform/llm-routing.js'

describe('central LLM configuration', () => {
  it('lists scoped routes and every tier without restricting agent types', async () => {
    const query = vi.fn(async (_sql: string) => ({ rows: [{ id: 'route-1', agent_type: 'support_assistant',
      organization_id: 'org-a', routing_tier: 'premium', provider: 'openrouter', model_name: 'primary:free',
      fallback_routes: [{ provider: 'openai_direct', modelName: 'manual-fallback' }],
      max_input_tokens: 8000, max_output_tokens: 1000, temperature: '0.2', status: 'active' }] }))
    const routes = await getAdminLlmRoutes({ query } as unknown as pg.Pool)
    expect(routes[0]).toMatchObject({ agentType: 'support_assistant', organizationId: 'org-a', routingTier: 'premium',
      fallbackRoutes: [{ provider: 'openai_direct', modelName: 'manual-fallback' }] })
    expect(query.mock.calls[0][0]).not.toContain('agent_type = ANY')
    expect(query.mock.calls[0][0]).not.toContain("routing_tier = 'default'")
  })

  it('catalogue covers technical services, dynamic profiles, marketing agents and unknown saved routes', async () => {
    const query = vi.fn(async (sql: string) => ({ rows: sql.includes('yux_strategy_agent_profiles')
      ? [{ profile_key: 'new_profile', name: 'Novo perfil', description: 'Novo uso' }]
      : sql.includes('marketing_agents') ? [{ id: 'agent-a', agent_type: 'writer', name: 'Redator' }]
      : [{ agent_type: 'legacy_service' }] }))
    const cases = await getAdminLlmUseCases({ query } as unknown as pg.Pool)
    expect(cases.map(item => item.key)).toEqual(expect.arrayContaining(['global_llm', 'global_embeddings',
      'strategy_curator', 'knowledge_curator', 'knowledge_embeddings', 'campaign_launch_specialist',
      'funnel_nurture_specialist', 'automation_lead_classification', 'automation_message_generation',
      'automation_proposal_generation', 'new_profile', 'writer', 'legacy_service']))
    expect(new Set(cases.map(item => item.key)).size).toBe(cases.length)
    expect(cases.find(item => item.key === 'knowledge_embeddings')?.kind).toBe('embedding')
  })

  it('serializes id-less saves and updates the existing logical route without moving its scope', async () => {
    const query = vi.fn(async (sql: string, _values?: unknown[]) => ({ rows: sql.startsWith('SELECT id') ? [{ id: 'existing' }]
      : sql.startsWith('UPDATE') ? [{ id: 'existing', agent_type: 'support_assistant', organization_id: 'org-a', routing_tier: 'premium', fallback_routes: [] }] : [] }))
    const release = vi.fn()
    const pool = { connect: async () => ({ query, release }) } as unknown as pg.Pool
    const result = await upsertAdminLlmRoute(pool, { agentType: 'support_assistant', organizationId: 'org-a', routingTier: 'premium', provider: 'openrouter', modelName: 'main:free' })
    expect(result.id).toBe('existing')
    expect(query.mock.calls[1][0]).toContain('pg_advisory_xact_lock')
    const update = query.mock.calls.find(([sql]) => sql.startsWith('UPDATE'))!
    expect(update[0]).toContain('organization_id IS NOT DISTINCT FROM')
    expect(update[0]).not.toContain('SET agent_type')
    expect(update[0]).toContain('COALESCE($15::jsonb, fallback_routes)')
    expect(update[1]?.[14]).toBeNull()
    expect(query.mock.calls.some(([sql]) => sql.startsWith('INSERT'))).toBe(false)
    expect(query.mock.calls.at(-1)?.[0]).toBe('COMMIT')
    expect(release).toHaveBeenCalledOnce()
  })

  it('rejects explicit id with mismatched scope and rolls back', async () => {
    const query = vi.fn(async (_sql: string, _values?: unknown[]) => ({ rows: [] }))
    const release = vi.fn()
    await expect(upsertAdminLlmRoute({ connect: async () => ({ query, release }) } as unknown as pg.Pool,
      { id: 'wrong-scope', agentType: 'support_assistant', provider: 'openrouter', modelName: 'main:free' })).rejects.toThrow('llm_route_not_found_or_scope_mismatch')
    expect(query.mock.calls.at(-1)?.[0]).toBe('ROLLBACK')
    expect(release).toHaveBeenCalledOnce()
  })
})
