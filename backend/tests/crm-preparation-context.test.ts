import { expect, it } from 'vitest'
import { buildMissionOperationalContext } from '../src/modules/action-engine/context-builder.js'
import { createActionEngineCapabilityRegistry } from '../src/modules/action-engine/capabilities/index.js'
import { createCapabilityManifest } from '../src/modules/action-engine/capability-manifest.js'

it('reports draft preparation separately from sender readiness and full activation entitlement', async () => {
  const registry = createActionEngineCapabilityRegistry()
  const manifest = createCapabilityManifest(registry, registry.listMetadata().map(item => ({ key: item.key, version: item.version })))
  const db = { async query(sql: string, params?: unknown[]) {
    if (sql.includes('FROM public.crm_instances')) { expect(params?.[0]).toBe('org-a'); return { rows: [{ status: 'draft', max_pipeline_count: 1 }] } }
    if (sql.includes('platform_provider_connections')) return { rows: [{ configured: true }] }
    return { rows: [] }
  } }
  const result = await buildMissionOperationalContext(db as never, { organizationId: 'org-a', contractId: 'contract-a', query: 'Preparar rascunhos',
    requestedModules: [], capabilityManifest: manifest.entries, accountAvailability: { authority: 'server', organizationId: 'org-a', contractId: 'contract-a',
      enabledModules: ['crm', 'automations'], tools: [], actionAuthorization: 'not_granted_by_snapshot' } })
  expect(result.accountAvailability).toMatchObject({ preparation: { available: true, crmStatus: 'draft', maxPipelineCount: 1, blockers: [] } })
  expect(result.accountAvailability?.connections).toContainEqual({ key: 'email', status: 'unverified', platformConfigured: true })
})
