import { describe, expect, it } from 'vitest'
import type { ActionPackVersion } from '../src/modules/action-engine/action-pack.js'
import { createActionEngineCapabilityRegistry } from '../src/modules/action-engine/capabilities/index.js'
import { createPublishedPackRegistry } from '../src/modules/action-engine/pack-registry.js'
import { resolvePackSelection } from '../src/modules/action-engine/pack-resolver.js'
import { CAMPAIGN_LAUNCH_PACK_V1 } from '../src/modules/action-engine/packs/campaign-launch-v1.js'
import { FUNNEL_NURTURE_PACK_V1 } from '../src/modules/action-engine/packs/funnel-nurture-v1.js'
import { REVENUE_RECOVERY_PACK_V0 } from '../src/modules/action-engine/packs/revenue-recovery-v0.js'

const packs = [REVENUE_RECOVERY_PACK_V0, FUNNEL_NURTURE_PACK_V1, CAMPAIGN_LAUNCH_PACK_V1]
const catalog = createPublishedPackRegistry(packs).list()
const capabilities = createActionEngineCapabilityRegistry().listMetadata().map(item => ({ key: item.key, version: item.version }))
const modules = ['action_engine','crm','automations','funnel_nurture_agent','campaigns','landing_pages','campaign_launch_agent']
const request = (pack: ActionPackVersion) => ({ key: pack.key, semanticVersion: pack.semanticVersion, contentHash: pack.contentHash })

describe('published Action Pack resolver', () => {
  it('resolves a single pack and orders a compatible funnel plus campaign pair', () => {
    expect(resolvePackSelection({ requested: [request(REVENUE_RECOVERY_PACK_V0)], catalog, entitledModules: modules, availableCapabilities: capabilities })).toHaveLength(1)
    const composite = resolvePackSelection({ requested: [request(CAMPAIGN_LAUNCH_PACK_V1), request(FUNNEL_NURTURE_PACK_V1)], catalog, entitledModules: modules, availableCapabilities: capabilities })
    expect(composite.map(item => item.key)).toEqual(['funnel_nurture','campaign_launch'])
    expect(composite.find(item => item.key === 'funnel_nurture')?.producesArtifacts).toContainEqual({ key: 'crm.funnel', schemaVersion: 1 })
  })

  it('rejects missing entitlement, unavailable capability, unpublished/hash mismatch and duplicates', () => {
    expect(() => resolvePackSelection({ requested: [request(CAMPAIGN_LAUNCH_PACK_V1)], catalog, entitledModules: modules.filter(item => item !== 'campaign_launch_agent'), availableCapabilities: capabilities })).toThrow('mission_pack_entitlement_missing')
    expect(() => resolvePackSelection({ requested: [request(CAMPAIGN_LAUNCH_PACK_V1)], catalog, entitledModules: modules, availableCapabilities: capabilities.filter(item => item.key !== 'campaign.provider.activate') })).toThrow('mission_pack_capability_unavailable')
    expect(() => resolvePackSelection({ requested: [{ ...request(CAMPAIGN_LAUNCH_PACK_V1), contentHash: 'f'.repeat(64) }], catalog, entitledModules: modules, availableCapabilities: capabilities })).toThrow('mission_pack_hash_mismatch')
    expect(() => resolvePackSelection({ requested: [request(CAMPAIGN_LAUNCH_PACK_V1), request(CAMPAIGN_LAUNCH_PACK_V1)], catalog, entitledModules: modules, availableCapabilities: capabilities })).toThrow('mission_pack_selection_duplicate')
    const draft = { ...CAMPAIGN_LAUNCH_PACK_V1, key: 'draft_pack', status: 'draft' as const }
    const draftCatalog = createPublishedPackRegistry([draft]).list()
    expect(() => resolvePackSelection({ requested: [request(draft)], catalog: draftCatalog, entitledModules: modules, availableCapabilities: capabilities })).toThrow('mission_pack_unpublished')
  })

  it('rejects a required artifact that no selected upstream pack produces', () => {
    const consumer = { ...CAMPAIGN_LAUNCH_PACK_V1, key: 'strict_campaign', artifactContract: { consumes: [{ key: 'crm.funnel', schemaVersion: 2, optional: false }], produces: [] } }
    const strictCatalog = createPublishedPackRegistry([consumer]).list()
    expect(() => resolvePackSelection({ requested: [request(consumer)], catalog: strictCatalog, entitledModules: modules, availableCapabilities: capabilities })).toThrow('mission_pack_artifact_requirement_unsatisfied')
  })
})
