import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { createContextAwarePool } from '../../src/db/client.js'
import { runPriorityRecalculation } from '../../src/modules/crm/priority-recalculation.js'
import { createRecordProfileFixture } from './support/crm-record-profile-fixtures.js'
import { fixtureUsers } from './support/fixtures.js'
import {
  createIntegrationRig,
  getIntegrationDatabaseUrl,
  type IntegrationRig,
} from './support/rig.js'

let rig: IntegrationRig
let worker: pg.Pool
let fixture: Awaited<ReturnType<typeof createRecordProfileFixture>>
const base = '/api/crm/priority'
const admin = 'client_admin_A'
const assignee = fixtureUsers.client_member_A.id
const title = 'Confirmar requisitos do pedido'
const definition = {
  fitWeight: 50,
  temperatureWeight: 50,
  minimumCoverage: 50,
  historyDays: 30,
  fitGroups: [
    {
      id: 'company',
      label: 'Empresa',
      maxPoints: 100,
      alternatives: [{ fieldKey: 'lead.company', points: 100 }],
    },
  ],
  interestGroups: [
    {
      id: 'intent',
      label: 'Intenção',
      maxPoints: 100,
      strategy: 'max',
      rules: [{ kind: 'quote_requested', points: 80, validForDays: 5 }],
    },
  ],
  fitBands: [{ id: 'all', label: 'Potencial', min: 0 }],
  temperatureBands: [
    { id: 'cold', label: 'Frio', min: 0 },
    { id: 'hot', label: 'Quente', min: 70 },
  ],
  queues: [
    { id: 'now', label: 'Contato prioritário', recommendation: title, taskDueDays: 2 },
    { id: 'later', label: 'Acompanhar' },
  ],
  matrix: [
    { fitBandId: 'all', temperatureBandId: 'hot', queueId: 'now' },
    { fitBandId: 'all', temperatureBandId: 'cold', queueId: 'later' },
  ],
}

beforeAll(async () => {
  rig = await createIntegrationRig({ queueMode: 'stub' })
  worker = createContextAwarePool(
    new pg.Pool({ connectionString: rig.serviceDatabaseUrl('yux_worker') }),
    'worker',
  )
  fixture = await createRecordProfileFixture(rig)
})

afterAll(async () => {
  await worker?.end()
  await rig?.close()
})

async function createLead(assignedTo?: string): Promise<string> {
  const response = await rig.request(admin, 'POST', '/api/crm/leads', {
    organizationId: fixture.organizationId,
    crmInstanceId: fixture.instanceId,
    pipelineId: fixture.pipelineId,
    stageId: fixture.stageId,
    name: 'Conta de teste',
    company: 'Empresa',
    email: '',
    source: 'manual',
    assignedTo,
  })
  expect(response.statusCode, JSON.stringify(response.body)).toBe(201)
  return response.body.id
}

async function quote(id: string) {
  const response = await rig.request(admin, 'POST', `/api/crm/leads/${id}/priority-signals`, {
    requestId: randomUUID(),
    kind: 'quote_requested',
    channel: 'email',
    occurredAt: new Date().toISOString(),
  })
  expect(response.statusCode).toBe(201)
  return response.body.id as string
}

async function revoke(id: string, signalId: string) {
  expect(
    (
      await rig.request(admin, 'POST', `/api/crm/leads/${id}/priority-signals/${signalId}/revoke`, {
        requestId: randomUUID(),
        reason: 'Correção de teste',
      })
    ).statusCode,
  ).toBe(200)
}

async function model() {
  return (await rig.request(admin, 'GET', `${base}/model?crmInstanceId=${fixture.instanceId}`)).body
}

async function publish() {
  const current = await model()
  const draft = await rig.request(admin, 'PUT', `${base}/draft`, {
    crmInstanceId: fixture.instanceId,
    expectedRevision: current.revision,
    definition,
  })
  expect(draft.statusCode, JSON.stringify(draft.body)).toBe(200)
  const input = { crmInstanceId: fixture.instanceId, revision: draft.body.revision }
  let page = await rig.request(admin, 'POST', `${base}/preview`, input)
  while (page.body.nextCursor) {
    page = await rig.request(admin, 'POST', `${base}/preview`, {
      ...input,
      runId: page.body.runId,
      afterId: page.body.nextCursor,
    })
  }
  expect(page.statusCode).toBe(200)
  const activated = await rig.request(admin, 'POST', `${base}/publish`, {
    ...input,
    runId: page.body.runId,
    expectedActivationId: current.activeActivationId,
    requestId: randomUUID(),
  })
  expect(activated.statusCode).toBe(200)
  return activated.body as { activationId: string; versionId: string }
}

const recalculate = async () => expect((await runPriorityRecalculation(worker)).failed).toBe(0)
const tasks = async (leadId: string) =>
  (
    await rig.sql(
      'SELECT id,title,assigned_to,due_at FROM public.lead_tasks WHERE lead_id=$1 ORDER BY created_at',
      [leadId],
    )
  ).rows

async function waitingOn(pid: number, event?: string): Promise<number> {
  const deadline = Date.now() + 5_000
  while (Date.now() < deadline) {
    const result = await rig.sql(
      `SELECT pid FROM pg_stat_activity WHERE datname=current_database()
       AND $1::integer=ANY(pg_blocking_pids(pid)) AND ($2::text IS NULL OR wait_event=$2)`,
      [pid, event ?? null],
    )
    if (result.rows[0]) return result.rows[0].pid
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  throw new Error('Expected a database session to wait for the lock')
}

it('requires authorized activation and creates only one assigned task for each later entry to a configured queue', async () => {
  const baseline = await createLead(assignee)
  const disabled = await createLead(assignee)
  const unassigned = await createLead()
  const active = await createLead(assignee)
  await quote(baseline)
  const { activationId, versionId } = await publish()
  expect((await model()).effectsEnabled).toBe(false)

  await recalculate()
  await quote(disabled)
  await recalculate()
  expect(await tasks(disabled)).toEqual([])
  const effects = {
    crmInstanceId: fixture.instanceId,
    expectedActivationId: activationId,
    enabled: true,
  }
  for (const role of ['yux_operator', 'client_member_A', 'client_admin_B'] as const) {
    const response = await rig.request(role, 'PATCH', `${base}/effects`, effects)
    expect([403, 404]).toContain(response.statusCode)
  }
  expect(
    (
      await rig.request(admin, 'PATCH', `${base}/effects`, {
        ...effects,
        expectedActivationId: randomUUID(),
      })
    ).statusCode,
  ).toBe(409)
  expect((await rig.request(admin, 'PATCH', `${base}/effects`, effects)).body).toEqual({
    effectsEnabled: true,
  })
  expect(await tasks(baseline)).toEqual([])
  expect(await tasks(disabled)).toEqual([])

  const newLead = await createLead(assignee)
  await quote(newLead)
  await quote(unassigned)
  const firstSignal = await quote(active)
  await recalculate()
  await recalculate()
  expect(await tasks(newLead)).toEqual([])
  expect(await tasks(unassigned)).toEqual([])
  expect(
    (await rig.request(admin, 'GET', `/api/crm/leads/${unassigned}/priority`)).body.recommendation,
  ).toBe(title)
  const created = await tasks(active)
  expect(created).toHaveLength(1)
  expect(created[0]).toMatchObject({ assigned_to: assignee, title })
  expect(created[0].due_at.getTime() - Date.now()).toBeGreaterThan(2 * 86_400_000 - 10_000)
  expect((await rig.request(admin, 'GET', `/api/crm/leads/${active}/tasks`)).body).toEqual(
    expect.arrayContaining([expect.objectContaining({ id: created[0].id, title })]),
  )

  await revoke(active, firstSignal)
  await recalculate()
  await quote(active)
  await recalculate()
  expect(await tasks(active)).toHaveLength(2)
  const restored = await rig.request(admin, 'POST', `${base}/activate`, {
    crmInstanceId: fixture.instanceId,
    expectedActivationId: activationId,
    versionId,
    requestId: randomUUID(),
  })
  expect(restored.statusCode).toBe(200)
  expect((await model()).effectsEnabled).toBe(false)
  expect(
    (
      await rig.request('yux_admin', 'PATCH', `${base}/effects`, {
        ...effects,
        expectedActivationId: restored.body.activationId,
      })
    ).statusCode,
  ).toBe(200)
  await recalculate()
  expect(await tasks(active)).toHaveLength(2)
})

it('rolls back a task if the effect receipt fails and stays idempotent when workers retry', async () => {
  const lead = await createLead(assignee)
  const { activationId } = await publish()
  await recalculate()
  expect(
    (
      await rig.request(admin, 'PATCH', `${base}/effects`, {
        crmInstanceId: fixture.instanceId,
        expectedActivationId: activationId,
        enabled: true,
      })
    ).statusCode,
  ).toBe(200)
  await quote(lead)
  await rig.sql(`
    CREATE FUNCTION public.test_fail_priority_task_effect() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'injected effect receipt failure'; END $$;
    CREATE TRIGGER test_fail_priority_task_effect BEFORE INSERT ON public.crm_priority_task_effects
    FOR EACH ROW EXECUTE FUNCTION public.test_fail_priority_task_effect();
  `)
  try {
    expect((await runPriorityRecalculation(worker)).failed).toBe(1)
    expect(await tasks(lead)).toEqual([])
    const stored = await rig.sql(
      "SELECT result->>'queueId' AS queue FROM public.crm_priority_evaluations WHERE lead_id=$1 AND activation_id=$2",
      [lead, activationId],
    )
    expect(stored.rows[0]?.queue).toBe('later')
  } finally {
    await rig.sql(`
      DROP TRIGGER test_fail_priority_task_effect ON public.crm_priority_task_effects;
      DROP FUNCTION public.test_fail_priority_task_effect();
    `)
  }
  await Promise.all([recalculate(), recalculate()])
  const created = await tasks(lead)
  expect(created).toHaveLength(1)
  expect(
    (
      await rig.sql('SELECT transition_id FROM public.crm_priority_task_effects WHERE task_id=$1', [
        created[0].id,
      ])
    ).rowCount,
  ).toBe(1)
})

it('suppresses queued effects after a contact block, deletion, pause or deactivation', async () => {
  const blocked = await createLead(assignee)
  const deleted = await createLead(assignee)
  const paused = await createLead(assignee)
  const deactivated = await createLead(assignee)
  const { activationId } = await publish()
  await recalculate()
  const effects = { crmInstanceId: fixture.instanceId, expectedActivationId: activationId }
  expect(
    (await rig.request(admin, 'PATCH', `${base}/effects`, { ...effects, enabled: true }))
      .statusCode,
  ).toBe(200)
  await quote(blocked)
  await quote(deleted)
  const opportunity = await rig.sql(
    `
    WITH campaign AS (
      INSERT INTO public.radar_campaigns(organization_id,name,target_segment,target_city,target_state,offer_type)
      VALUES($1,'Carteira de teste','Serviços','Curitiba','PR','Proposta') RETURNING id
    ), company AS (
      INSERT INTO public.radar_company_records(organization_id,dedupe_key,legal_name)
      VALUES($1,$2,'Empresa de teste') RETURNING id
    )
    INSERT INTO public.radar_opportunities(organization_id,campaign_id,company_record_id,converted_lead_id,status)
    SELECT $1,campaign.id,company.id,$2::uuid,'converted' FROM campaign,company RETURNING id
  `,
    [fixture.organizationId, blocked],
  )
  await rig.sql("UPDATE public.radar_opportunities SET status='opted_out' WHERE id=$1", [
    opportunity.rows[0].id,
  ])
  expect(
    (
      await rig.request(admin, 'POST', '/api/crm/leads/trash', {
        crmInstanceId: fixture.instanceId,
        leadIds: [deleted],
      })
    ).statusCode,
  ).toBe(200)
  await recalculate()
  expect(await tasks(blocked)).toEqual([])
  expect(await tasks(deleted)).toEqual([])
  expect((await rig.request(admin, 'GET', `/api/crm/leads/${blocked}/priority`)).body.state).toBe(
    'excluded',
  )

  await quote(paused)
  const locker = new pg.Client({ connectionString: getIntegrationDatabaseUrl() })
  await locker.connect()
  let pauseRequest: ReturnType<IntegrationRig['request']> | undefined
  let calculation: ReturnType<typeof recalculate> | undefined
  let committed = false
  try {
    await locker.query('BEGIN')
    const lock = await locker.query(
      'SELECT pg_backend_pid() AS pid FROM public.crm_priority_configs WHERE crm_instance_id=$1 FOR UPDATE',
      [fixture.instanceId],
    )
    pauseRequest = rig.request(admin, 'PATCH', `${base}/effects`, { ...effects, enabled: false })
    const pausingPid = await waitingOn(lock.rows[0].pid)
    calculation = recalculate()
    // The worker has evaluated the change and reached the effect while the pause is still in flight.
    await waitingOn(pausingPid, 'advisory')
    await locker.query('COMMIT')
    committed = true
  } finally {
    if (!committed) await locker.query('ROLLBACK')
    await locker.end()
    await Promise.allSettled([pauseRequest, calculation])
  }
  expect((await pauseRequest)?.statusCode).toBe(200)
  await calculation
  expect(await tasks(paused)).toEqual([])
  expect(
    (await rig.request(admin, 'PATCH', `${base}/effects`, { ...effects, enabled: true }))
      .statusCode,
  ).toBe(200)
  await quote(deactivated)
  expect(
    (
      await rig.request(admin, 'POST', `${base}/activate`, {
        ...effects,
        versionId: null,
        requestId: randomUUID(),
      })
    ).statusCode,
  ).toBe(200)
  await recalculate()
  expect(await tasks(deactivated)).toEqual([])
  expect((await model()).effectsEnabled).toBe(false)
})
