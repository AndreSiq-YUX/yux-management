import { randomUUID } from 'node:crypto'
import { expect, it } from 'vitest'
import { createIntegrationRig } from './support/rig.js'

it('persiste a jornada de automacao, executa versao imutavel e isola duas organizacoes', async () => {
  const rig = await createIntegrationRig()
  try {
    const graph = {
      nodes: [
        { id: 'trigger', type: 'trigger', data: { triggerType: 'lead.created' } },
        { id: 'action', type: 'action', data: { actionType: 'create_task' } },
      ],
      edges: [{ source: 'trigger', target: 'action' }],
    }
    const created = await rig.request('client_admin_A', 'POST', '/api/automations/flows', {
      organizationId: rig.ids.organizationA,
      name: `Jornada portal ${randomUUID()}`,
      description: 'Criada pelo editor integrado',
      dailyRunLimit: 50,
      graph,
    })
    expect(created.statusCode).toBe(201)
    expect(created.body).toMatchObject({
      organizationId: rig.ids.organizationA,
      status: 'draft',
      isEnabled: false,
      graph,
    })
    const flowId = created.body.id as string

    expect((await rig.request('client_admin_A', 'POST', `/api/automations/flows/${flowId}/triggers`, {
      triggerType: 'lead.created', config: { source: 'portal' },
    })).statusCode).toBe(201)
    expect((await rig.request('client_admin_A', 'POST', `/api/automations/flows/${flowId}/actions`, {
      actionType: 'create_task', orderIndex: 1, payload: { title: 'Retornar contato do portal' },
    })).statusCode).toBe(201)

    const refreshed = await rig.request(
      'client_admin_A', 'GET', `/api/automations/flows?organizationId=${rig.ids.organizationA}`,
    )
    expect(refreshed.statusCode).toBe(200)
    expect(refreshed.body.find((flow: { id: string }) => flow.id === flowId)).toMatchObject({
      graph,
      triggers: [expect.objectContaining({ triggerType: 'lead.created' })],
      actions: [expect.objectContaining({ actionType: 'create_task' })],
    })

    const runsBeforeSimulation = await rig.sql(
      'SELECT COUNT(*)::int AS count FROM public.automation_execution_runs WHERE flow_id=$1',
      [flowId],
    )
    const simulation = await rig.request('client_admin_A', 'POST', `/api/automations/flows/${flowId}/simulate`, {
      organizationId: rig.ids.organizationA,
      eventType: 'lead.created',
      samplePayload: { source: 'site' },
    })
    expect(simulation.statusCode).toBe(201)
    expect(simulation.body).toMatchObject({ matched: true, triggerMatched: true })
    expect(simulation.body.plannedActions).toHaveLength(1)
    expect((await rig.sql(
      'SELECT COUNT(*)::int AS count FROM public.automation_execution_runs WHERE flow_id=$1',
      [flowId],
    )).rows[0].count).toBe(runsBeforeSimulation.rows[0].count)

    const activation = await rig.request('client_admin_A', 'POST', `/api/automations/flows/${flowId}/activate`, {
      organizationId: rig.ids.organizationA,
    })
    expect(activation.statusCode).toBe(200)
    expect(activation.body.flow).toMatchObject({ status: 'published', isEnabled: true, publishedVersion: 1 })
    const versionId = activation.body.publishedVersion.id as string

    await expect(rig.sql(
      `UPDATE public.automation_flow_versions SET snapshot='{}'::jsonb WHERE id=$1`,
      [versionId],
    )).rejects.toThrow('published_automation_version_immutable')

    const leadId = randomUUID()
    await rig.sql(
      `INSERT INTO public.leads (id,organization_id,name,email,source,status)
       VALUES ($1,$2,'Lead automacao',$3,'portal','open')`,
      [leadId, rig.ids.organizationA, `${leadId}@integration.test`],
    )
    const dispatch = await rig.request('client_admin_A', 'POST', '/api/automations/dispatch', {
      event: {
        eventId: randomUUID(),
        type: 'lead.created',
        organizationId: rig.ids.organizationA,
        leadId,
        payload: { source: 'portal' },
      },
    })
    expect(dispatch.statusCode).toBe(202)
    await rig.workerTick()

    const executions = await rig.request('client_admin_A', 'GET', `/api/automations/flows/${flowId}/executions`)
    expect(executions.statusCode).toBe(200)
    expect(executions.body).toEqual(expect.arrayContaining([
      expect.objectContaining({
        organizationId: rig.ids.organizationA,
        flowVersionId: versionId,
        status: 'completed',
        leadId,
      }),
    ]))
    expect((await rig.sql(
      'SELECT COUNT(*)::int AS count FROM public.lead_tasks WHERE organization_id=$1 AND lead_id=$2',
      [rig.ids.organizationA, leadId],
    )).rows[0].count).toBe(1)

    const paused = await rig.request('client_admin_A', 'POST', `/api/automations/flows/${flowId}/pause`, {
      organizationId: rig.ids.organizationA,
    })
    expect(paused.statusCode).toBe(200)
    expect(paused.body.flow).toMatchObject({ status: 'paused', isEnabled: false })

    const secondDispatch = await rig.request('client_admin_A', 'POST', '/api/automations/dispatch', {
      event: {
        eventId: randomUUID(), type: 'lead.created', organizationId: rig.ids.organizationA, leadId, payload: {},
      },
    })
    expect(secondDispatch.statusCode).toBe(202)
    await rig.workerTick()
    expect((await rig.sql(
      'SELECT COUNT(*)::int AS count FROM public.automation_execution_runs WHERE flow_id=$1',
      [flowId],
    )).rows[0].count).toBe(1)

    const duplicate = await rig.request('client_admin_A', 'POST', `/api/automations/flows/${flowId}/duplicate`, {
      organizationId: rig.ids.organizationA,
    })
    expect(duplicate.statusCode).toBe(201)
    expect(duplicate.body).toMatchObject({ organizationId: rig.ids.organizationA, status: 'draft', isEnabled: false })
    expect(duplicate.body.id).not.toBe(flowId)
    expect(duplicate.body.triggers).toHaveLength(1)
    expect(duplicate.body.actions).toHaveLength(1)

    expect((await rig.request('client_member_A', 'POST', `/api/automations/flows/${flowId}/duplicate`, {
      organizationId: rig.ids.organizationA,
    })).statusCode).toBe(403)
    expect((await rig.request('client_admin_B', 'POST', `/api/automations/flows/${flowId}/activate`, {
      organizationId: rig.ids.organizationA,
    })).statusCode).toBe(404)
    expect((await rig.request('client_admin_B', 'POST', '/api/automations/dispatch', {
      event: { eventId: randomUUID(), type: 'lead.created', organizationId: rig.ids.organizationA, leadId },
    })).statusCode).toBe(403)
    expect((await rig.request(
      'client_admin_B', 'GET', `/api/automations/flows?organizationId=${rig.ids.organizationA}`,
    )).body).toEqual([])

    await rig.restartApi()
    const reloaded = await rig.request(
      'client_admin_A', 'GET', `/api/automations/flows?organizationId=${rig.ids.organizationA}`,
    )
    expect(reloaded.statusCode).toBe(200)
    expect(reloaded.body.find((flow: { id: string }) => flow.id === flowId)).toMatchObject({ graph })
  } finally {
    await rig.close()
  }
})

it('impede ativar um grafo ciclico e retorna erro recuperavel', async () => {
  const rig = await createIntegrationRig()
  try {
    const created = await rig.request('client_admin_A', 'POST', '/api/automations/flows', {
      organizationId: rig.ids.organizationA,
      name: `Jornada invalida ${randomUUID()}`,
      graph: {
        nodes: [{ id: 'a', type: 'trigger' }, { id: 'b', type: 'action' }],
        edges: [{ source: 'a', target: 'b' }, { source: 'b', target: 'a' }],
      },
    })
    const flowId = created.body.id as string
    await rig.request('client_admin_A', 'POST', `/api/automations/flows/${flowId}/triggers`, {
      triggerType: 'lead.created', config: {},
    })
    await rig.request('client_admin_A', 'POST', `/api/automations/flows/${flowId}/actions`, {
      actionType: 'create_task', orderIndex: 1, payload: { title: 'Nao executar' },
    })

    const activation = await rig.request('client_admin_A', 'POST', `/api/automations/flows/${flowId}/activate`, {
      organizationId: rig.ids.organizationA,
    })
    expect(activation.statusCode).toBe(422)
    expect(activation.body.error).toBe('automation_graph_invalid')
    expect((await rig.sql(
      'SELECT status,is_enabled,active_version_id FROM public.automation_flows WHERE id=$1',
      [flowId],
    )).rows[0]).toEqual({ status: 'draft', is_enabled: false, active_version_id: null })
  } finally {
    await rig.close()
  }
})
