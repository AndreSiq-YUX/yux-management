import { expect, it } from 'vitest'
import { evaluateMissionReadiness } from '../src/modules/action-engine/readiness.js'
import { createPipelineDraft } from '../src/modules/crm/mission-commands.js'
import { randomUUID } from 'node:crypto'
import { CRM_PREPARATION_PACK_V1 } from '../src/modules/action-engine/packs/crm-preparation-v1.js'
import { createActionEngineCapabilityRegistry } from '../src/modules/action-engine/capabilities/index.js'

it('pins a draft-only topology with no publication, activation, enrollment, send, or long wait', () => {
  const registry = createActionEngineCapabilityRegistry()
  expect(CRM_PREPARATION_PACK_V1.readinessSpec.requiredConnections).toEqual([])
  expect(CRM_PREPARATION_PACK_V1.policyDefaults.mode).toBe('prepare')
  expect(CRM_PREPARATION_PACK_V1.topologyTemplate.steps).toHaveLength(8)
  for (const step of CRM_PREPARATION_PACK_V1.topologyTemplate.steps) {
    const capability = registry.get(step.capabilityKey, step.capabilityVersion)!
    expect(['none', 'draft']).toContain(capability.effect)
    expect(capability.requiredConnections).toEqual([])
    expect(step.capabilityKey).not.toMatch(/publish|send|enroll|activate|signal.wait/)
  }
})

it('permits preparation with CRM and automations but no active CRM, sender, or nurture activation entitlement', async () => {
  const db = { async query(sql: string) {
    if (sql.includes('SELECT id, kind FROM public.organizations')) return { rows: [{ id: 'org', kind: 'client' }] }
    if (sql.includes('SELECT contract.id')) return { rows: [{ id: 'contract', action_engine_enabled: true, crm_enabled: true, automations_enabled: true, funnel_nurture_enabled: false }] }
    if (sql.includes('FROM public.crm_instances')) return { rows: sql.includes("'draft'") ? [{ id: 'crm' }] : [] }
    if (sql.includes('FROM public.memberships')) return { rows: [{ id: 'owner' }] }
    if (sql.includes('information_schema.tables')) return { rows: [{ available: true }] }
    if (sql.includes('FROM public.action_pack_versions')) return { rows: [{ content_hash: (await import('../src/modules/action-engine/packs/crm-preparation-v1.js')).CRM_PREPARATION_PACK_V1.contentHash }] }
    if (sql.includes('COUNT(*)')) return { rows: [{ count: 0 }] }
    return { rows: [] }
  } }
  const report = await evaluateMissionReadiness(db as never, { organizationId: 'org', contractId: 'contract', packKey: 'crm_preparation', mode: 'prepare',
    deadlineAt: new Date(Date.now() + 86400000).toISOString(), targetRevenueBrl: '0', maxTotalCostBrl: '0', maxHumanHours: '0', humanHourlyRateBrl: '0',
    agentHarnessHealthy: true, mutationLeaseReady: true } as never)
  expect(report.checks.filter(item => item.status === 'block')).toEqual([])
  expect(report.ready).toBe(true)
  expect(report.availableChannels).toEqual([])
  const base = { organizationId: 'org', contractId: 'contract', deadlineAt: new Date(Date.now() + 86400000).toISOString(), targetRevenueBrl: '1',
    maxTotalCostBrl: '0', maxHumanHours: '0', humanHourlyRateBrl: '0', agentHarnessHealthy: true, mutationLeaseReady: true }
  const wrongMode = await evaluateMissionReadiness(db as never, { ...base, packKey: 'crm_preparation', mode: 'assisted' })
  expect(wrongMode.checks).toContainEqual(expect.objectContaining({ code: 'crm_preparation_scope_invalid', status: 'block' }))
  const activation = await evaluateMissionReadiness(db as never, { ...base, packKey: 'funnel_nurture', mode: 'assisted' })
  expect(activation.checks).toContainEqual(expect.objectContaining({ code: 'funnel_nurture_not_entitled', status: 'block' }))
  expect(activation.checks).toContainEqual(expect.objectContaining({ code: 'email_unavailable', status: 'block' }))
})

it('can create a draft pipeline version on a provisioned draft CRM without activating or publishing it', async () => {
  const calls: string[] = []
  const db = { async query(sql: string) {
    calls.push(sql)
    if (sql.includes('FROM public.action_command_results')) return { rows: [] }
    if (sql.includes('FROM public.crm_instances')) return { rows: sql.includes("'draft'") ? [{ id: 'crm' }] : [] }
    if (sql.includes('INSERT INTO public.crm_pipeline_versions')) return { rows: [{ id: 'version' }] }
    if (sql.includes('INSERT INTO public.domain_events')) return { rows: [{ id: 'event', occurred_at: new Date(), created_at: new Date() }] }
    return { rows: [] }
  } }
  const result = await createPipelineDraft(db as never, { organizationId: randomUUID(), missionId: randomUUID(), actionRunId: randomUUID(), actorId: randomUUID(), idempotencyKey: 'draft' } as never,
    { name: 'Captação', stages: [
      { key: 'new', name: 'Novo', exitCriteria: [], isWon: false, isLost: false },
      { key: 'positive', name: 'Resposta positiva', exitCriteria: [], isWon: false, isLost: false },
    ] })
  expect(result.status).toBe('draft')
  expect(result.evidence.activated).toBe(false)
  expect(calls.some(sql => /UPDATE public.crm_instances|INSERT INTO public.crm_pipelines\b|UPDATE public.crm_pipeline_versions/.test(sql))).toBe(false)
})
