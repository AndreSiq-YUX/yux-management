import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { createIntegrationRig, type IntegrationRig } from './support/rig.js'
import { createRecordProfileFixture } from './support/crm-record-profile-fixtures.js'
import { fixtureIds, fixtureUsers } from './support/fixtures.js'

let rig: IntegrationRig
let fixture: Awaited<ReturnType<typeof createRecordProfileFixture>>
beforeAll(async () => {
  rig = await createIntegrationRig({ queueMode: 'stub' })
  fixture = await createRecordProfileFixture(rig)
})
afterAll(async () => { await rig?.close() })

describe('CRM record profiles with PostgreSQL and service-role RLS', () => {
  it('creates scoped types/fields, edits a lead, and restores answers after switching types', async () => {
    const kitchen = await rig.request('client_admin_A', 'POST', '/api/crm/record-types', { crmInstanceId: fixture.instanceId, name: `Cozinha industrial ${randomUUID()}` })
    expect(kitchen.statusCode, JSON.stringify(kitchen.body)).toBe(201)
    const market = await rig.request('client_admin_A', 'POST', '/api/crm/record-types', { crmInstanceId: fixture.instanceId, name: `Mercado ${randomUUID()}` })
    expect(market.statusCode, JSON.stringify(market.body)).toBe(201)
    const meals = await rig.request('client_admin_A', 'POST', '/api/crm/custom-fields', {
      crmInstanceId: fixture.instanceId, recordTypeId: kitchen.body.id, label: 'Refeições diárias', fieldType: 'number', required: true,
    })
    expect(meals.statusCode, JSON.stringify(meals.body)).toBe(201)
    const created = await rig.request('client_admin_A', 'POST', '/api/crm/leads', {
      organizationId: fixture.organizationId, crmInstanceId: fixture.instanceId, pipelineId: fixture.pipelineId, stageId: fixture.stageId,
      name: 'Cozinha São Lucas', email: 'cozinha@integration.test', source: 'manual',
      profile: { recordTypeId: kitchen.body.id, values: { [meals.body.stableKey]: 0 } },
    })
    expect(created.statusCode, JSON.stringify(created.body)).toBe(201)
    const profileUrl = `/api/crm/leads/${created.body.id}/profile`
    const switched = await rig.request('client_admin_A', 'PUT', profileUrl, { recordTypeId: market.body.id, values: {} })
    expect(switched.statusCode, JSON.stringify(switched.body)).toBe(200)
    expect(switched.body.values[meals.body.stableKey]).toBe(0)
    const restored = await rig.request('client_admin_A', 'PUT', profileUrl, { recordTypeId: kitchen.body.id, values: {} })
    expect(restored.statusCode, JSON.stringify(restored.body)).toBe(200)
    expect(restored.body.values[meals.body.stableKey]).toBe(0)
    const read = await rig.request('client_admin_A', 'GET', profileUrl)
    expect(read.statusCode, JSON.stringify(read.body)).toBe(200)
    expect(read.body.recordTypeId).toBe(kitchen.body.id)
    expect(read.body.values[meals.body.stableKey]).toBe(0)

    const deniedTenant = await rig.request('client_admin_B', 'GET', profileUrl)
    expect(deniedTenant.statusCode).toBe(404)
    const deniedSeller = await rig.request('client_member_A', 'GET', profileUrl)
    expect(deniedSeller.statusCode).toBe(404)
    const deniedConfig = await rig.request('client_member_A', 'POST', '/api/crm/record-types', { crmInstanceId: fixture.instanceId, name: 'Não autorizado' })
    expect(deniedConfig.statusCode).toBe(403)

    const archived = await rig.request('client_admin_A', 'PATCH', `/api/crm/record-types/${kitchen.body.id}`, { isActive: false })
    expect(archived.statusCode).toBe(200)
    const editExisting = await rig.request('client_admin_A', 'PUT', profileUrl, { recordTypeId: kitchen.body.id, values: { [meals.body.stableKey]: 1200 } })
    expect(editExisting.statusCode, JSON.stringify(editExisting.body)).toBe(200)
    expect(editExisting.body.values[meals.body.stableKey]).toBe(1200)
  })

  it('rolls back creation with invalid required values and prevents type leakage across CRM instances', async () => {
    const type = await rig.request('client_admin_A', 'POST', '/api/crm/record-types', { crmInstanceId: fixture.instanceId, name: `Hotel ${randomUUID()}` })
    expect(type.statusCode, JSON.stringify(type.body)).toBe(201)
    const field = await rig.request('client_admin_A', 'POST', '/api/crm/custom-fields', { crmInstanceId: fixture.instanceId,
      recordTypeId: type.body.id, label: 'Quartos', fieldType: 'number', required: true })
    expect(field.statusCode, JSON.stringify(field.body)).toBe(201)
    const email = 'invalid-required@integration.test'
    const failed = await rig.request('client_admin_A', 'POST', '/api/crm/leads', {
      organizationId: fixture.organizationId, crmInstanceId: fixture.instanceId, pipelineId: fixture.pipelineId, stageId: fixture.stageId,
      name: 'Hotel incompleto', email, source: 'manual', profile: { recordTypeId: type.body.id, values: {} },
    })
    expect(failed.statusCode, JSON.stringify(failed.body)).toBe(422)
    expect((await rig.sql('SELECT id FROM public.leads WHERE email = $1', [email])).rows).toHaveLength(0)
    const configuration = await rig.request('client_admin_B', 'GET', `/api/crm/record-profile/configuration?crmInstanceId=${fixture.instanceId}`)
    expect(configuration.statusCode).toBe(404)
    const ownCrm = await rig.sql(`INSERT INTO public.crm_instances
      (organization_id, contract_id, status, max_custom_field_count, allow_client_field_customization)
      VALUES ($1, $2, 'active', 20, true)
      ON CONFLICT (contract_id) DO UPDATE SET status = 'active', max_custom_field_count = 20, allow_client_field_customization = true
      RETURNING id`, [fixtureIds.organizationB, fixtureIds.contractB])
    const otherInstanceId = ownCrm.rows[0].id
    await rig.sql(`INSERT INTO public.crm_instance_members (crm_instance_id, user_id, role, status)
      VALUES ($1, $2, 'client_admin', 'active') ON CONFLICT (crm_instance_id, user_id) DO UPDATE SET status = 'active'`,
    [otherInstanceId, fixtureUsers.client_admin_B.id])
    const crossType = await rig.request('client_admin_B', 'POST', '/api/crm/custom-fields', {
      crmInstanceId: otherInstanceId, recordTypeId: type.body.id, label: 'Campo indevido', fieldType: 'text',
    })
    expect(crossType.statusCode, JSON.stringify(crossType.body)).toBe(422)
    await expect(rig.sql(`INSERT INTO public.crm_custom_field_definitions
      (crm_instance_id, record_type_id, stable_key, label, field_type)
      VALUES ($1, $2, $3, 'Campo indevido', 'text')`, [otherInstanceId, type.body.id, randomUUID()]))
      .rejects.toMatchObject({ code: '23503' })
  })
})
