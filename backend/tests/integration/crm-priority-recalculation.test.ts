import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { createContextAwarePool } from '../../src/db/client.js'
import { createIntegrationRig, type IntegrationRig } from './support/rig.js'
import { createRecordProfileFixture } from './support/crm-record-profile-fixtures.js'
import { fixtureUsers } from './support/fixtures.js'

let rig: IntegrationRig
let worker: pg.Pool
let fixture: Awaited<ReturnType<typeof createRecordProfileFixture>>
let leadId: string
const base = '/api/crm/priority'
const day = 86_400_000
const definition = {
  fitWeight: 50,
  temperatureWeight: 50,
  minimumCoverage: 50,
  historyDays: 30,
  fitGroups: [
    {
      id: 'company',
      label: 'Empresa cadastrada',
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
      rules: [{ kind: 'quote_requested', points: 80, buyerRelevant: true }],
    },
  ],
  inactivity: [{ afterDays: 5, points: 20 }],
  fitBands: [{ id: 'all', label: 'Potencial', min: 0 }],
  temperatureBands: [
    { id: 'cold', label: 'Frio', min: 0 },
    { id: 'hot', label: 'Quente', min: 70 },
  ],
  queues: [
    { id: 'now', label: 'Contato prioritário' },
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
  const lead = await rig.request('client_admin_A', 'POST', '/api/crm/leads', {
    organizationId: fixture.organizationId,
    crmInstanceId: fixture.instanceId,
    pipelineId: fixture.pipelineId,
    stageId: fixture.stageId,
    name: 'Conta Exemplo',
    email: '',
    source: 'manual',
  })
  expect(lead.statusCode).toBe(201)
  leadId = lead.body.id
})
afterAll(async () => {
  await worker?.end()
  await rig?.close()
})

it('publishes only a complete current preview, then recalculates latest facts and time exactly once', async () => {
  const current = await rig.request(
    'client_admin_A',
    'GET',
    `${base}/model?crmInstanceId=${fixture.instanceId}`,
  )
  const draft = await rig.request('client_admin_A', 'PUT', `${base}/draft`, {
    crmInstanceId: fixture.instanceId,
    expectedRevision: current.body.revision,
    definition,
  })
  expect(draft.statusCode, JSON.stringify(draft.body)).toBe(200)
  const publish = {
    crmInstanceId: fixture.instanceId,
    revision: draft.body.revision,
    runId: randomUUID(),
    expectedActivationId: current.body.activeActivationId ?? null,
    requestId: randomUUID(),
  }
  expect((await rig.request('client_admin_A', 'POST', `${base}/publish`, publish)).statusCode).toBe(
    409,
  )
  let page = await rig.request('client_admin_A', 'POST', `${base}/preview`, {
    crmInstanceId: fixture.instanceId,
    revision: publish.revision,
  })
  while (page.body.nextCursor)
    page = await rig.request('client_admin_A', 'POST', `${base}/preview`, {
      crmInstanceId: fixture.instanceId,
      revision: publish.revision,
      runId: page.body.runId,
      afterId: page.body.nextCursor,
    })
  expect(page.statusCode).toBe(200)
  publish.runId = page.body.runId
  const activated = await rig.request('client_admin_A', 'POST', `${base}/publish`, publish)
  expect(activated.statusCode, JSON.stringify(activated.body)).toBe(200)
  expect((await rig.request('client_admin_A', 'POST', `${base}/publish`, publish)).body).toEqual(
    activated.body,
  )
  const url = `/api/crm/leads/${leadId}/priority`
  expect((await rig.request('client_admin_A', 'GET', url)).body.state).toBe('pending')
  expect(
    (
      await rig.request('client_admin_A', 'PATCH', `/api/crm/leads/${leadId}`, {
        company: 'Conta atualizada',
      })
    ).statusCode,
  ).toBe(200)
  const signalTime = new Date(Date.now() - day)
  expect(
    (
      await rig.request('client_admin_A', 'POST', `/api/crm/leads/${leadId}/priority-signals`, {
        requestId: randomUUID(),
        kind: 'quote_requested',
        channel: 'email',
        occurredAt: signalTime.toISOString(),
      })
    ).statusCode,
  ).toBe(201)
  const { runPriorityRecalculation } =
    await import('../../src/modules/crm/priority-recalculation.js')
  await runPriorityRecalculation(worker, new Date())
  const first = await rig.request('client_admin_A', 'GET', url)
  expect(first.body).toMatchObject({
    fitScore: 100,
    temperatureScore: 80,
    priorityScore: 90,
    queueId: 'now',
  })
  await rig.sql(
    `UPDATE public.leads SET owner_member_id=(SELECT id FROM public.crm_instance_members
    WHERE crm_instance_id=$2 AND user_id=$3) WHERE id=$1`,
    [leadId, fixture.instanceId, fixtureUsers.client_member_A.id],
  )
  for (const role of ['yux_admin', 'yux_operator', 'client_admin_A', 'client_member_A'] as const) {
    const history = await rig.request(role, 'GET', `${url}/history`)
    expect(history.statusCode).toBe(200)
    expect(history.body.items[0]).toMatchObject({ cause: 'baseline', after: { priorityScore: 90 } })
    const list = await rig.request(
      role,
      'GET',
      `/api/crm/leads?crmInstanceId=${fixture.instanceId}`,
    )
    expect(list.body.find((row: { id: string }) => row.id === leadId).priority).toMatchObject({
      state: 'ranked',
      queueId: 'now',
    })
    expect(list.body.find((row: { id: string }) => row.id === leadId).priority).not.toHaveProperty(
      'reasons',
    )
  }
  expect((await rig.request('client_admin_B', 'GET', `${url}/history`)).statusCode).toBe(404)
  const boundary = new Date(signalTime.getTime() + 5 * day)
  await runPriorityRecalculation(worker, boundary)
  await runPriorityRecalculation(worker, boundary)
  expect((await rig.request('client_admin_A', 'GET', url)).body).toMatchObject({
    temperatureScore: 60,
    queueId: 'later',
  })
  expect(
    (
      await rig.sql(
        `SELECT count(*)::int AS total FROM public.crm_priority_transitions
    WHERE lead_id=$1 AND activation_id=$2 AND cause='time'`,
        [leadId, activated.body.activationId],
      )
    ).rows[0].total,
  ).toBe(1)
  const lost = await rig.request('client_admin_A', 'PATCH', `/api/crm/leads/${leadId}`, {
    status: 'lost',
    lostAt: new Date().toISOString(),
    lostReason: 'Encerrado no cenário de teste',
  })
  expect(lost.statusCode, JSON.stringify(lost.body)).toBe(200)
  expect((await rig.request('client_admin_A', 'GET', url)).body).toMatchObject({
    state: 'excluded',
    priorityScore: null,
  })
  const reopened = await rig.request('client_admin_A', 'PATCH', `/api/crm/leads/${leadId}`, {
    status: 'open',
    lostAt: null,
    lostReason: null,
  })
  expect(reopened.statusCode, JSON.stringify(reopened.body)).toBe(200)

  const deactivated = await rig.request('client_admin_A', 'POST', `${base}/activate`, {
    crmInstanceId: fixture.instanceId,
    versionId: null,
    expectedActivationId: activated.body.activationId,
    requestId: randomUUID(),
  })
  expect(deactivated.statusCode).toBe(200)
  expect((await rig.request('client_admin_A', 'GET', url)).body).toBeNull()
  const restored = await rig.request('client_admin_A', 'POST', `${base}/activate`, {
    crmInstanceId: fixture.instanceId,
    versionId: activated.body.versionId,
    expectedActivationId: null,
    requestId: randomUUID(),
  })
  expect(restored.statusCode).toBe(200)
  expect(restored.body.activationId).not.toBe(activated.body.activationId)
  expect((await rig.request('client_admin_A', 'GET', url)).body.state).toBe('pending')
  expect((await rig.request('client_admin_B', 'GET', url)).statusCode).toBe(404)
})

it('includes a signal committed while the recalculation waits for the lead lock', async () => {
  const created = await rig.request('client_admin_A', 'POST', '/api/crm/leads', {
    organizationId: fixture.organizationId,
    crmInstanceId: fixture.instanceId,
    pipelineId: fixture.pipelineId,
    stageId: fixture.stageId,
    name: 'Conta atualizada durante cálculo',
    company: 'Empresa',
    email: '',
    source: 'manual',
  })
  expect(created.statusCode).toBe(201)
  const id = created.body.id as string
  const { runPriorityRecalculation } =
    await import('../../src/modules/crm/priority-recalculation.js')
  expect((await runPriorityRecalculation(worker)).failed).toBe(0)
  const updated = await rig.request('client_admin_A', 'PATCH', `/api/crm/leads/${id}`, {
    company: 'Empresa atualizada',
  })
  expect(updated.statusCode).toBe(200)
  expect(
    (await rig.sql('SELECT lead_id FROM public.crm_priority_work WHERE lead_id=$1', [id])).rowCount,
  ).toBe(1)
  const locker = await worker.connect()
  let calculation: ReturnType<typeof runPriorityRecalculation> | undefined
  let committed = false
  try {
    await locker.query('BEGIN')
    await locker.query(
      "SELECT set_config('app.service_role','worker',true),set_config('app.current_role','yux_admin',true)",
    )
    const lock = await locker.query(
      'SELECT pg_backend_pid() AS pid FROM public.leads WHERE id=$1 FOR UPDATE',
      [id],
    )
    expect(lock.rowCount).toBe(1)
    calculation = runPriorityRecalculation(worker)
    const deadline = Date.now() + 5000
    let waiting = false
    while (!waiting && Date.now() < deadline) {
      waiting = Boolean(
        (
          await rig.sql(
            `SELECT 1 FROM pg_stat_activity WHERE datname=current_database()
        AND $1::integer = ANY(pg_blocking_pids(pid))`,
            [lock.rows[0].pid],
          )
        ).rows[0],
      )
      if (!waiting) await new Promise((resolve) => setTimeout(resolve, 25))
    }
    expect(waiting).toBe(true)
    await locker.query(
      `INSERT INTO public.crm_priority_signals
      (organization_id,crm_instance_id,lead_id,source_key,canonical_key,kind,channel,actor,occurred_at)
      VALUES($1,$2,$3,'concurrent','concurrent','quote_requested','email','buyer',clock_timestamp())`,
      [fixture.organizationId, fixture.instanceId, id],
    )
    await locker.query('COMMIT')
    committed = true
  } finally {
    if (!committed) await locker.query('ROLLBACK')
    locker.release()
    await calculation
  }
  expect((await calculation)?.failed).toBe(0)
  const result = await rig.request('client_admin_A', 'GET', `/api/crm/leads/${id}/priority`)
  expect(result.body).toMatchObject({ temperatureScore: 80, queueId: 'now' })
})
