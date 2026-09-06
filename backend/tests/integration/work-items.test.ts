import { randomUUID } from 'node:crypto'
import { expect, it } from 'vitest'
import { createIntegrationRig } from './support/rig.js'
import { fixtureUsers } from './support/fixtures.js'

it('projeta trabalho das fontes e conclui intervenção humana uma única vez com evidência', async () => {
  const rig = await createIntegrationRig()
  const ids = {
    lead: randomUUID(), crmTask: randomUUID(), otherTask: randomUUID(), project: randomUUID(), projectTask: randomUUID(),
    mission: randomUUID(), plan: randomUUID(), step: randomUUID(), run: randomUUID(), observation: randomUUID(),
  }
  try {
    await rig.sql(
      `INSERT INTO public.leads (id,organization_id,client_id,name,email,source,stage,status)
       VALUES ($1,$2,$3,'Lead fila diária','fila-diaria@integration.test','integration','NEW','open')`,
      [ids.lead, rig.ids.organizationA, '20000000-0000-4000-8000-000000000001'],
    )
    await rig.sql(
      `INSERT INTO public.lead_tasks (id,organization_id,lead_id,title,due_at,assigned_to,metadata,updated_at)
       VALUES ($1,$2,$3,'Retornar contato',NOW(),$4,'{}'::jsonb,'2026-09-06T22:44:46.123456Z'::timestamptz),
              ($5,$2,$3,'Tarefa de outra pessoa',NOW(),$6,'{}'::jsonb,NOW())`,
      [ids.crmTask, rig.ids.organizationA, ids.lead, fixtureUsers.yux_operator.id,
        ids.otherTask, fixtureUsers.client_member_A.id],
    )
    await rig.sql(
      `INSERT INTO public.projects (id,name,client_id,status,priority,type,start_date,expected_end_date)
       VALUES ($1,'Projeto fila diária',$2,'ACTIVE','MEDIUM','OTHER',CURRENT_DATE,CURRENT_DATE + 30)`,
      [ids.project, '20000000-0000-4000-8000-000000000001'],
    )
    await rig.sql(
      `INSERT INTO public.project_tasks (id,project_id,title,status,assigned_to,due_date,is_client_visible)
       VALUES ($1,$2,'Revisar entrega','in_progress',$3,CURRENT_DATE,TRUE)`,
      [ids.projectTask, ids.project, fixtureUsers.yux_operator.id],
    )
    await rig.sql(
      `INSERT INTO public.action_missions
         (id,organization_id,contract_id,pack_version_id,title,objective,status,mode,create_idempotency_key,budget,created_by)
       VALUES ($1,$2,$3,'71000000-0000-4000-8000-000000000001','Missão fila diária','Validar fila','active','assisted',$4,$5,$6)`,
      [ids.mission, rig.ids.organizationA, rig.ids.contractA, `work-items-mission-${ids.mission}`,
        { humanHourlyRateBrl: '120', maxHumanHours: '8' }, fixtureUsers.yux_admin.id],
    )
    await rig.sql(
      `INSERT INTO public.action_plans
         (id,organization_id,mission_id,revision,status,pack_version_id,pack_content_hash,plan_hash,created_by)
       VALUES ($1,$2,$3,1,'active','71000000-0000-4000-8000-000000000001',repeat('a',64),repeat('b',64),$4)`,
      [ids.plan, rig.ids.organizationA, ids.mission, fixtureUsers.yux_admin.id],
    )
    await rig.sql(
      `INSERT INTO public.action_plan_steps
         (id,organization_id,plan_id,step_key,position,capability_key,capability_version)
       VALUES ($1,$2,$3,'human-review',0,'human.task.create',1)`,
      [ids.step, rig.ids.organizationA, ids.plan],
    )
    await rig.sql(
      `INSERT INTO public.action_runs
         (id,organization_id,mission_id,plan_id,plan_step_id,status,idempotency_key,input,output,claimed_by)
       VALUES ($1,$2,$3,$4,$5,'running',$6,$7,$8,'human_task')`,
      [ids.run, rig.ids.organizationA, ids.mission, ids.plan, ids.step, `work-items-run-${ids.run}`,
        { title: 'Conferir resultado', description: 'Conferir antes de avançar', dueAt: new Date().toISOString(), assignedTo: fixtureUsers.yux_operator.id },
        { output: { preview: false, taskId: ids.observation }, effectProduced: true }],
    )
    await rig.sql(
      `INSERT INTO public.action_observations
         (id,organization_id,mission_id,observation_type,idempotency_key,source_type,source_record_id,payload)
       VALUES ($1,$2,$3,'human_task_created',$4,'mission',$3,$5)`,
      [ids.observation, rig.ids.organizationA, ids.mission, `work-items-run-${ids.run}`,
        { title: 'Conferir resultado', description: 'Conferir antes de avançar', dueAt: new Date().toISOString(), assignedTo: fixtureUsers.yux_operator.id, status: 'open' }],
    )

    const listed = await rig.request('yux_operator', 'GET', `/api/workspace/work-items?organizationId=${rig.ids.organizationA}&due=all`)
    expect(listed.statusCode).toBe(200)
    expect(listed.body.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceType: 'crm_task', sourceId: ids.crmTask, organizationId: rig.ids.organizationA }),
      expect.objectContaining({ sourceType: 'project_task', sourceId: ids.projectTask, organizationId: rig.ids.organizationA }),
      expect.objectContaining({ sourceType: 'mission_human_task', sourceId: ids.observation, missionId: ids.mission }),
    ]))
    expect(listed.body.items.filter((item: { sourceId: string }) => item.sourceId === ids.observation)).toHaveLength(1)

    const filtered = await rig.request('yux_operator', 'GET', `/api/workspace/work-items?organizationId=${rig.ids.organizationA}&assigneeId=${fixtureUsers.client_member_A.id}&due=all`)
    expect(filtered.statusCode).toBe(200)
    expect(filtered.body.items.map((item: { sourceId: string }) => item.sourceId)).toContain(ids.otherTask)
    expect(filtered.body.items.map((item: { sourceId: string }) => item.sourceId)).not.toContain(ids.crmTask)

    const deniedOrganization = await rig.request('client_admin_B', 'GET', `/api/workspace/work-items?organizationId=${rig.ids.organizationA}&due=all`)
    expect(deniedOrganization.statusCode).toBe(403)

    const otherVersion = listed.body.items.find((item: { sourceId: string }) => item.sourceId === ids.otherTask).version
    const wrongAssignee = await rig.request('yux_operator', 'POST', `/api/workspace/work-items/crm_task/${ids.otherTask}/complete`, {
      organizationId: rig.ids.organizationA, expectedVersion: otherVersion, evidence: { note: 'tentativa indevida' }, minutesSpent: 5,
    })
    expect(wrongAssignee.statusCode).toBe(403)

    const crmItem = listed.body.items.find((item: { sourceId: string }) => item.sourceId === ids.crmTask)
    expect(crmItem.version).toBe('2026-09-06T22:44:46.123Z')
    const crmCompletion = {
      organizationId: rig.ids.organizationA,
      expectedVersion: crmItem.version,
      evidence: { note: 'Contato retornado com sucesso' },
      minutesSpent: 7,
    }
    const completedCrmTask = await rig.request(
      'yux_operator',
      'POST',
      `/api/workspace/work-items/crm_task/${ids.crmTask}/complete`,
      crmCompletion,
    )
    expect(completedCrmTask.statusCode).toBe(200)
    expect(completedCrmTask.body).toMatchObject({ sourceType: 'crm_task', sourceId: ids.crmTask, status: 'completed' })
    const repeatedCrmCompletion = await rig.request(
      'yux_operator',
      'POST',
      `/api/workspace/work-items/crm_task/${ids.crmTask}/complete`,
      crmCompletion,
    )
    expect(repeatedCrmCompletion.statusCode).toBe(409)
    const persistedCrmTask = await rig.sql(
      `SELECT status, metadata #> '{workItemCompletion,evidence}' AS evidence,
              (SELECT COUNT(*)::int FROM public.domain_events event
               WHERE event.aggregate_id = $1 AND event.event_type = 'lead.task_completed') AS completion_count
       FROM public.lead_tasks WHERE id = $1`,
      [ids.crmTask],
    )
    expect(persistedCrmTask.rows[0]).toMatchObject({
      status: 'completed', evidence: crmCompletion.evidence, completion_count: 1,
    })

    const missingEvidence = await rig.request('yux_operator', 'POST', `/api/workspace/work-items/mission_human_task/${ids.observation}/complete`, {
      organizationId: rig.ids.organizationA, expectedVersion: '2026-09-05T00:00:00.000Z', evidence: {}, minutesSpent: 12,
    })
    expect(missingEvidence.statusCode).toBe(400)

    const humanItem = listed.body.items.find((item: { sourceId: string }) => item.sourceId === ids.observation)
    const completion = {
      organizationId: rig.ids.organizationA,
      expectedVersion: humanItem.version,
      evidence: { note: 'Resultado conferido', url: 'https://example.test/evidence/1' },
      minutesSpent: 17,
    }
    const [firstCompletion, repeatedCompletion] = await Promise.all([
      rig.request('yux_operator', 'POST', `/api/workspace/work-items/mission_human_task/${ids.observation}/complete`, completion),
      rig.request('yux_operator', 'POST', `/api/workspace/work-items/mission_human_task/${ids.observation}/complete`, completion),
    ])
    expect([firstCompletion.statusCode, repeatedCompletion.statusCode].sort()).toEqual([200, 409])

    const persisted = await rig.sql(
      `SELECT run.status, run.output, observation.payload,
              (SELECT COUNT(*)::int FROM public.domain_events event
               WHERE event.aggregate_id = $1 AND event.event_type = 'action.succeeded') AS transition_count,
              (SELECT human_minutes FROM public.action_cost_entries cost
               WHERE cost.run_id = $1 AND cost.nature = 'actual' LIMIT 1) AS human_minutes
       FROM public.action_runs run
       JOIN public.action_observations observation ON observation.id = $2
       WHERE run.id = $1`,
      [ids.run, ids.observation],
    )
    expect(persisted.rows[0]).toMatchObject({ status: 'succeeded', transition_count: 1, human_minutes: '17.00' })
    expect(persisted.rows[0].output.resolution).toMatchObject(completion.evidence)
    expect(persisted.rows[0].payload).toMatchObject({ status: 'completed', evidence: completion.evidence, minutesSpent: 17 })

    const after = await rig.request('yux_operator', 'GET', `/api/workspace/work-items?organizationId=${rig.ids.organizationA}&due=all`)
    expect(after.body.items.some((item: { sourceId: string }) => item.sourceId === ids.observation)).toBe(false)
  } finally {
    await rig.close()
  }
})
