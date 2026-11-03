import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createIntegrationRig, type IntegrationRig } from './support/rig.js'
import { createRecordProfileFixture } from './support/crm-record-profile-fixtures.js'
import { fixtureUsers } from './support/fixtures.js'
import type { PriorityResult } from '../../src/modules/crm/priority-model.js'

let rig: IntegrationRig
let fixture: Awaited<ReturnType<typeof createRecordProfileFixture>>
let field: { id: string; stableKey: string }
let recordTypeId: string
let ownedLeadId: string
let otherLeadId: string
const base = '/api/crm/priority'
const modelUrl = () => `${base}/model?crmInstanceId=${fixture.instanceId}`
type PreviewRow = PriorityResult & { leadId: string; name: string }

async function finishPreview(actor: keyof typeof fixtureUsers, revision: number, firstPage: {
  runId: string; nextCursor: string | null; results: PreviewRow[]
}) {
  let page = firstPage
  const results = [...page.results]
  while (page.nextCursor) {
    const response = await rig.request(actor, 'POST', `${base}/preview`, {
      crmInstanceId: fixture.instanceId, revision, runId: page.runId, afterId: page.nextCursor,
    })
    expect(response.statusCode, JSON.stringify(response.body)).toBe(200)
    expect(response.body.nextCursor).not.toBe(page.nextCursor)
    page = response.body
    results.push(...page.results)
  }
  return { ...page, results }
}

function definition(fieldKey = `custom:${field.stableKey}`) {
  return {
    fitWeight: 65, temperatureWeight: 35, minimumCoverage: 50, historyDays: 90,
    fitGroups: [{ id: 'criterion', label: 'Capacidade', maxPoints: 20, recordTypeId,
      alternatives: [{ fieldKey, bands: [{ min: null, max: 10, points: 5 }, { min: 10, max: null, points: 20 }] }],
    }],
    fitBands: [{ id: 'all', label: 'Potencial', min: 0 }],
    temperatureBands: [{ id: 'cold', label: 'Frio', min: 0 }],
    queues: [{ id: 'work', label: 'Acompanhar' }],
    matrix: [{ fitBandId: 'all', temperatureBandId: 'cold', queueId: 'work' }],
  }
}
async function saveDraft() {
  const current = await rig.request('client_admin_A', 'GET', modelUrl())
  expect(current.statusCode, JSON.stringify(current.body)).toBe(200)
  const saved = await rig.request('client_admin_A', 'PUT', `${base}/draft`, {
    crmInstanceId: fixture.instanceId, expectedRevision: current.body.revision, definition: definition(),
  })
  expect(saved.statusCode, JSON.stringify(saved.body)).toBe(200)
  return saved.body.revision as number
}

beforeAll(async () => {
  rig = await createIntegrationRig({ queueMode: 'stub' })
  fixture = await createRecordProfileFixture(rig)
  const type = await rig.request('client_admin_A', 'POST', '/api/crm/record-types', {
    crmInstanceId: fixture.instanceId, name: `Prestador ${randomUUID()}`,
  })
  expect(type.statusCode).toBe(201)
  recordTypeId = type.body.id
  const createdField = await rig.request('client_admin_A', 'POST', '/api/crm/custom-fields', {
    crmInstanceId: fixture.instanceId, recordTypeId, label: 'Capacidade mensal', fieldType: 'number',
  })
  expect(createdField.statusCode).toBe(201)
  field = createdField.body
  const leads = []
  for (const name of ['Brave Serviços', 'Outra equipe']) {
    const created = await rig.request('client_admin_A', 'POST', '/api/crm/leads', {
      organizationId: fixture.organizationId, pipelineId: fixture.pipelineId,
      stageId: fixture.stageId, name, email: '', crmInstanceId: fixture.instanceId, source: 'manual',
      profile: { recordTypeId, values: { [field.stableKey]: 12 } },
    })
    expect(created.statusCode, JSON.stringify(created.body)).toBe(201)
    leads.push(created.body.id)
  }
  ;[ownedLeadId, otherLeadId] = leads
  await rig.sql(`UPDATE public.leads SET owner_member_id=(
    SELECT id FROM public.crm_instance_members WHERE crm_instance_id=$1 AND user_id=$2
  ), commercial_profile=$4::jsonb WHERE id=$3`, [
    fixture.instanceId, fixtureUsers.client_member_A.id, ownedLeadId,
    JSON.stringify({ technical: { providerId: 'internal-provider', model: 'private-model' } }),
  ])
})
afterAll(async () => { await rig?.close() })

describe('priority model API and PostgreSQL', () => {
  it('prevents_database_roles_from_publishing_or_activating', async () => {
    const grants = await rig.sql(`SELECT
      has_column_privilege('yux_api','public.crm_priority_configs','active_version_id','UPDATE') AS api_can_activate,
      has_column_privilege('yux_api','public.crm_priority_configs','effects_enabled','INSERT') AS api_can_insert_effects,
      has_table_privilege('yux_api','public.crm_priority_versions','INSERT') AS api_can_publish,
      has_table_privilege('yux_api','public.crm_priority_versions','UPDATE') AS api_can_rewrite_version,
      has_table_privilege('yux_worker','public.crm_priority_configs','SELECT') AS worker_can_read_drafts
    `)
    expect(grants.rows[0]).toEqual({
      api_can_activate: false, api_can_insert_effects: false, api_can_publish: false,
      api_can_rewrite_version: false, worker_can_read_drafts: false,
    })
  })

  it('rejects stale drafts and validates the field catalog', async () => {
    const revision = await saveDraft()
    const stale = await rig.request('client_admin_A', 'PUT', `${base}/draft`, {
      crmInstanceId: fixture.instanceId, expectedRevision: revision - 1, definition: definition(),
    })
    expect(stale.statusCode).toBe(409)
    const invalid = await rig.request('client_admin_A', 'PUT', `${base}/draft`, {
      crmInstanceId: fixture.instanceId, expectedRevision: revision, definition: definition('commercial_profile.technical'),
    })
    expect(invalid.statusCode).toBe(422)
  })

  it('scopes direct HTTP previews to owned leads, managed teams and accounts', async () => {
    const revision = await saveDraft()
    const payload = { crmInstanceId: fixture.instanceId, revision }
    for (const role of ['yux_admin', 'yux_operator', 'client_admin_A', 'client_member_A'] as const) {
      const preview = await rig.request(role, 'POST', `${base}/preview`, payload)
      expect(preview.statusCode, JSON.stringify(preview.body)).toBe(200)
      expect(preview.body.mode).toBe('profile_only')
      const complete = await finishPreview(role, revision, preview.body)
      expect(complete.results).toEqual(expect.arrayContaining([expect.objectContaining({
        leadId: ownedLeadId, name: 'Brave Serviços', fitScore: 100, temperatureScore: 0, priorityScore: 65,
      })]))
      expect(JSON.stringify(preview.body)).not.toMatch(/private-model|internal-provider|commercial_profile/)
      const seesOther = complete.results.some(row => row.leadId === otherLeadId)
      expect(seesOther).toBe(role !== 'client_member_A')
    }
    await rig.sql("UPDATE public.crm_instance_members SET role='manager' WHERE crm_instance_id=$1 AND user_id=$2", [fixture.instanceId, fixtureUsers.client_member_A.id])
    const team = await rig.sql(
      'INSERT INTO public.crm_teams (crm_instance_id,name) VALUES ($1,$2) RETURNING id',
      [fixture.instanceId, `Equipe teste ${randomUUID()}`],
    )
    const managedLead = await rig.request('client_admin_A', 'POST', '/api/crm/leads', {
      organizationId: fixture.organizationId, crmInstanceId: fixture.instanceId,
      pipelineId: fixture.pipelineId, stageId: fixture.stageId, teamId: team.rows[0].id,
      name: 'Lead da equipe gerenciada', email: '', source: 'manual',
    })
    expect(managedLead.statusCode, JSON.stringify(managedLead.body)).toBe(201)
    await rig.sql(`INSERT INTO public.crm_team_members (team_id,member_id,role)
      SELECT $3,id,'manager' FROM public.crm_instance_members WHERE crm_instance_id=$1 AND user_id=$2`,
    [fixture.instanceId, fixtureUsers.client_member_A.id, team.rows[0].id])
    const manager = await rig.request('client_member_A', 'POST', `${base}/preview`, payload)
    expect(manager.statusCode).toBe(200)
    const visibleIds = (await finishPreview('client_member_A', revision, manager.body)).results.map(row => row.leadId)
    expect(visibleIds).toEqual(expect.arrayContaining([ownedLeadId, managedLead.body.id]))
    expect(visibleIds).not.toContain(otherLeadId)
    for (const role of ['client_member_A', 'yux_operator'] as const) {
      const edit = await rig.request(role, 'PUT', `${base}/draft`, {
        crmInstanceId: fixture.instanceId, expectedRevision: revision, definition: definition(),
      })
      expect(edit.statusCode).toBe(403)
    }
    const other = await rig.request('client_admin_B', 'POST', `${base}/preview`, payload)
    expect([403, 404]).toContain(other.statusCode)
    expect(JSON.stringify(other.body)).not.toContain(ownedLeadId)
  })

  it('does not change scores, tasks, model activation or domain events', async () => {
    const revision = await saveDraft()
    const snapshot = async () => (await rig.sql(`SELECT
      (SELECT jsonb_agg(to_jsonb(l) ORDER BY l.id) FROM public.leads l WHERE l.crm_instance_id=$1) AS leads,
      (SELECT count(*) FROM public.crm_tasks WHERE organization_id=$2) AS tasks,
      (SELECT count(*) FROM public.domain_events WHERE organization_id=$2) AS events,
      (SELECT count(*) FROM public.lead_score_events WHERE organization_id=$2) AS score_events,
      (SELECT jsonb_agg(to_jsonb(m) ORDER BY m.id) FROM public.lead_scoring_models m WHERE m.crm_instance_id=$1) AS models
    `, [fixture.instanceId, fixture.organizationId])).rows[0]
    const before = await snapshot()
    const preview = await rig.request('client_admin_A', 'POST', `${base}/preview`, { crmInstanceId: fixture.instanceId, revision })
    expect(preview.statusCode, JSON.stringify(preview.body)).toBe(200)
    const complete = await finishPreview('client_admin_A', revision, preview.body)
    expect(complete.results.filter(row => row.state === 'ranked').length).toBeGreaterThanOrEqual(2)
    expect(await snapshot()).toEqual(before)
    const run = await rig.sql('SELECT completed_at FROM public.crm_priority_preview_runs WHERE id=$1', [preview.body.runId])
    expect(run.rows[0].completed_at).toBeTruthy()
  })

  it('treats an archived field as unknown and invalidates runs on draft edits', async () => {
    const revision = await saveDraft()
    const archive = await rig.request('client_admin_A', 'PATCH', `/api/crm/custom-fields/${field.id}`, { isActive: false })
    expect(archive.statusCode).toBe(200)
    const preview = await rig.request('client_admin_A', 'POST', `${base}/preview`, { crmInstanceId: fixture.instanceId, revision })
    expect(preview.statusCode).toBe(200)
    const complete = await finishPreview('client_admin_A', revision, preview.body)
    expect(complete.results).toEqual(expect.arrayContaining([expect.objectContaining({
      leadId: ownedLeadId, fitScore: null, state: 'needs_data',
      reasons: expect.arrayContaining([expect.objectContaining({
        kind: 'missing_data', archivedFieldKeys: [`custom:${field.stableKey}`],
      })]),
    })]))
    const restore = await rig.request('client_admin_A', 'PATCH', `/api/crm/custom-fields/${field.id}`, { isActive: true })
    expect(restore.statusCode).toBe(200)
    expect(await saveDraft()).toBe(revision + 1)
    const stale = await rig.request('client_admin_A', 'POST', `${base}/preview`, { crmInstanceId: fixture.instanceId, revision })
    expect(stale.statusCode).toBe(409)
  })

  it('continues only with the run owner and exact server cursor', async () => {
    const revision = await saveDraft()
    await rig.sql(`INSERT INTO public.leads (organization_id, crm_instance_id, pipeline_id, stage_id, name, email, source)
      SELECT $1,$2,$3,$4,'Lead de paginação ' || i,'','manual' FROM generate_series(1,51) i`, [
      fixture.organizationId, fixture.instanceId, fixture.pipelineId, fixture.stageId,
    ])
    const payload = { crmInstanceId: fixture.instanceId, revision }
    const first = await rig.request('client_admin_A', 'POST', `${base}/preview`, payload)
    expect(first.statusCode, JSON.stringify(first.body)).toBe(200)
    expect(first.body.results).toHaveLength(50)
    expect(first.body.nextCursor).toBeTruthy()
    const continuation = { ...payload, runId: first.body.runId, afterId: first.body.nextCursor }
    expect((await rig.request('yux_operator', 'POST', `${base}/preview`, continuation)).statusCode).toBe(404)
    expect((await rig.request('client_admin_A', 'POST', `${base}/preview`, { ...continuation, afterId: randomUUID() })).statusCode).toBe(409)
    const last = await rig.request('client_admin_A', 'POST', `${base}/preview`, continuation)
    expect(last.statusCode).toBe(200)
    expect(last.body.totals.processed).toBe(50 + last.body.results.length)
    const complete = await finishPreview('client_admin_A', revision, last.body)
    expect(new Set([...first.body.results, ...complete.results].map(row => row.leadId)).size)
      .toBe(50 + complete.results.length)
    expect((await rig.request('client_admin_A', 'POST', `${base}/preview`, continuation)).statusCode).toBe(409)
  })
})
