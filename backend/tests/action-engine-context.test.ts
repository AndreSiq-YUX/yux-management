import { describe, expect, it, vi } from 'vitest'
import { buildMissionContext } from '../src/modules/action-engine/context-builder.js'
import type { CapabilityManifestEntry } from '../src/modules/action-engine/capability-manifest.js'

const manifest: CapabilityManifestEntry[] = [{ key: 'crm.pipeline.snapshot', version: 1, definitionHash: 'a'.repeat(64), effect: 'none', recoveryKind: 'compensatable' }]

function database(reverse = false) {
  const knowledge = [
    { id: 'entry-2', source_id: 'source-2', title: 'Produto', body_snapshot: 'Descrição publicada', visibility: 'both', checksum_sha256: 'b'.repeat(64), published_at: '2026-08-02T00:00:00Z' },
    { id: 'entry-1', source_id: 'source-1', title: 'ICP', body_snapshot: 'Perfil publicado', visibility: 'external', checksum_sha256: 'c'.repeat(64), published_at: '2026-08-01T00:00:00Z' },
  ]
  const query = vi.fn(async (sql: string, params?: unknown[]) => {
    if (sql.includes('organization_company_profiles')) return { rows: [{ trade_name: params?.[0] === 'org-2' ? 'Outra' : 'YUX', description: 'Empresa', emails: ['secret@example.com'], phones: ['11999999999'], internal_notes: 'secret' }] }
    if (sql.includes('knowledge_publications')) return { rows: reverse ? [...knowledge].reverse() : knowledge }
    if (sql.includes('yux_strategy_concept_cards')) return { rows: [{ id: 'card-1', updated_at: '2026-08-01T00:00:00Z', concept: 'Priorize valor', decision_rules: ['meça'], recommended_actions: ['teste'], metadata: {} }] }
    if (sql.includes('contract_modules')) return { rows: [{ module_key: 'crm' }, { module_key: 'automation' }] }
    if (sql.includes('action_mission_memory_summaries')) return { rows: [{ id:'memory-1',pack_key:'funnel_nurture',pack_version:'1.0.0',outcome_hash:'d'.repeat(64),summary:{ terminalStatus:'succeeded',pattern:'approved only' } }] }
    if (sql.includes('crm_pipelines')) return { rows: [{ id: 'pipeline-1', name: 'Principal', is_default: true }] }
    if (sql.includes('FROM public.leads')) return { rows: [{ total: 10, inactive: 4 }] }
    if (sql.includes('automation_flows')) return { rows: [{ id: 'flow-1', status: 'published', is_enabled: true }] }
    throw new Error(`optional table unavailable: ${sql}`)
  })
  return { query }
}

describe('frozen Mission context', () => {
  it('selects governed published context, stable sorts and excludes PII/secrets', async () => {
    const firstDb = database(false)
    const secondDb = database(true)
    const input = { organizationId: 'org-1', contractId: 'contract-1', query: 'Criar funil', agentProfileKey: 'mission_supervisor', requestedModules: ['automations','crm','campaigns'], capabilityManifest: manifest }
    const first = await buildMissionContext(firstDb as never, input)
    const second = await buildMissionContext(secondDb as never, input)
    expect(first.contextHash).toBe(second.contextHash)
    expect(first.knowledgeItems.map((item) => item.id)).toEqual(['entry-1','entry-2'])
    expect(first.allowedModules).toEqual(['automations','crm'])
    expect(first.liveState).toMatchObject({ campaigns: { available: false, reason: 'module_not_allowed' } })
    expect(first.learningMemoryItems).toEqual([{ id:'memory-1',packKey:'funnel_nurture',packVersion:'1.0.0',outcomeHash:'d'.repeat(64),summary:{ terminalStatus:'succeeded',pattern:'approved only' } }])
    expect(JSON.stringify(first)).not.toMatch(/secret@example|11999999999|internal_notes/)
    const knowledgeSql = firstDb.query.mock.calls.find(([sql]) => String(sql).includes('knowledge_publications'))?.[0]
    expect(knowledgeSql).toContain("entry.status = 'published'")
    expect(knowledgeSql).toContain("source.visibility IN ('external','both')")
    expect(knowledgeSql).toContain('blocked_agent_profile_keys')
    const learningSql = firstDb.query.mock.calls.find(([sql]) => String(sql).includes('action_mission_memory_summaries'))?.[0]
    expect(learningSql).toContain("review_status='approved'")
  })

  it('keeps tenants in the hash and never queries knowledge without organization scope', async () => {
    const oneDb = database()
    const twoDb = database()
    const base = { query: 'Objetivo', agentProfileKey: 'mission_supervisor', requestedModules: ['crm'], capabilityManifest: manifest }
    const one = await buildMissionContext(oneDb as never, { ...base, organizationId: 'org-1' })
    const two = await buildMissionContext(twoDb as never, { ...base, organizationId: 'org-2' })
    expect(one.contextHash).not.toBe(two.contextHash)
    expect(oneDb.query.mock.calls.every(([, params]) => !params || params[0] === 'org-1' || params[0] === 'mission_supervisor')).toBe(true)
  })
})
