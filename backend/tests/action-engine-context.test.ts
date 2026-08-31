import { describe, expect, it, vi } from 'vitest'
import { buildMissionOperationalContext } from '../src/modules/action-engine/context-builder.js'
import type { CapabilityManifestEntry } from '../src/modules/action-engine/capability-manifest.js'

const manifest: CapabilityManifestEntry[] = [{
  key: 'crm.pipeline.snapshot', version: 1, definitionHash: 'a'.repeat(64),
  effect: 'none', recoveryKind: 'compensatable',
}]

function database() {
  const query = vi.fn(async (sql: string, params?: unknown[]) => {
    if (sql.includes('contract_modules')) return { rows: [{ module_key: 'crm' }, { module_key: 'automation' }] }
    if (sql.includes('action_mission_memory_summaries')) return { rows: [{
      id: 'memory-1', pack_key: 'funnel_nurture', pack_version: '1.0.0', outcome_hash: 'd'.repeat(64),
      summary: { terminalStatus: 'succeeded', pattern: 'approved only' },
    }] }
    if (sql.includes('channel_connections')) return { rows: [{ channel: 'whatsapp', is_active: true }] }
    if (sql.includes('ad_provider_connections')) return { rows: [{ provider: 'meta', status: 'disconnected' }] }
    if (sql.includes('crm_pipelines')) return { rows: [{ id: 'pipeline-1', name: 'Principal', is_default: true }] }
    if (sql.includes('FROM public.leads')) return { rows: [{ total: 10, inactive: 4 }] }
    if (sql.includes('automation_flows')) return { rows: [{ id: 'flow-1', status: 'published', is_enabled: true }] }
    throw new Error(`optional table unavailable: ${sql}; params=${JSON.stringify(params)}`)
  })
  return { query }
}

describe('authoritative Mission operational context', () => {
  it('returns entitlements, provider health, live state, memory and capability manifest', async () => {
    const db = database()
    const result = await buildMissionOperationalContext(db as never, {
      organizationId: 'org-1', contractId: 'contract-1', query: 'Criar funil',
      requestedModules: ['automations', 'crm', 'campaigns'], capabilityManifest: manifest,
      packKeys: ['funnel_nurture'],
    })

    expect(result.allowedModules).toEqual(['automations', 'crm'])
    expect(result.providerHealth).toEqual({
      channels: [{ key: 'whatsapp', ready: true }],
      advertising: [{ key: 'meta', ready: false }],
    })
    expect(result.liveState).toMatchObject({ campaigns: { available: false, reason: 'module_not_allowed' } })
    expect(result.learningMemoryItems).toEqual([{
      id: 'memory-1', packKey: 'funnel_nurture', packVersion: '1.0.0',
      outcomeHash: 'd'.repeat(64), summary: { terminalStatus: 'succeeded', pattern: 'approved only' },
    }])
    expect(result.capabilityCatalogHash).toMatch(/^[a-f0-9]{64}$/)
    const entitlementCall = db.query.mock.calls.find(([sql]) => String(sql).includes('contract_modules'))
    expect(entitlementCall?.[1]).toEqual(['org-1', 'contract-1'])
  })

  it('does not select company, customer knowledge or YUX strategy', async () => {
    const db = database()
    const result = await buildMissionOperationalContext(db as never, {
      organizationId: 'org-1', query: 'Objetivo', requestedModules: ['crm'], capabilityManifest: manifest,
    })

    const allSql = db.query.mock.calls.map(([sql]) => String(sql)).join('\n')
    expect(allSql).not.toMatch(/organization_company_profiles|knowledge_publications|knowledge_entries|yux_strategy_concept_cards/)
    expect(result.companyContext).toEqual({})
    expect(result.knowledgeItems).toEqual([])
    expect(result.strategyItems).toEqual([])
  })

  it('keeps the organization and provider state in the immutable operational hash', async () => {
    const one = await buildMissionOperationalContext(database() as never, {
      organizationId: 'org-1', query: 'Objetivo', requestedModules: ['crm'], capabilityManifest: manifest,
    })
    const two = await buildMissionOperationalContext(database() as never, {
      organizationId: 'org-2', query: 'Objetivo', requestedModules: ['crm'], capabilityManifest: manifest,
    })
    expect(one.contextHash).not.toBe(two.contextHash)
  })
})
