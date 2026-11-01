import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { createIntegrationRig, type IntegrationRig } from './support/rig.js'
import { createRecordProfileFixture } from './support/crm-record-profile-fixtures.js'
import { fixtureUsers } from './support/fixtures.js'
import { applyLeadScoringEvent } from '../../src/modules/crm/scoring-engine.js'
import { createContextAwarePool } from '../../src/db/client.js'
import { runWithDatabaseRequestContext } from '../../src/db/request-context.js'
import { createDomainEventEnvelope } from '../../src/modules/events/types.js'
import pg from 'pg'
let rig: IntegrationRig,
  fixture: Awaited<ReturnType<typeof createRecordProfileFixture>>
beforeAll(async () => {
  rig = await createIntegrationRig({ queueMode: 'stub' })
  fixture = await createRecordProfileFixture(rig)
})
afterAll(async () => {
  await rig?.close()
})
describe('CRM qualification through scoped HTTP and PostgreSQL', () => {
  it('configures highlights, scores ranges without inflation, isolates roles and recovers deleted leads', async () => {
    const type = await rig.request(
      'client_admin_A',
      'POST',
      '/api/crm/record-types',
      { crmInstanceId: fixture.instanceId, name: `Industrial ${randomUUID()}` },
    )
    expect(type.statusCode).toBe(201)
    const field = await rig.request(
      'client_admin_A',
      'POST',
      '/api/crm/custom-fields',
      {
        crmInstanceId: fixture.instanceId,
        recordTypeId: type.body.id,
        label: 'Refeições diárias',
        fieldType: 'number',
        isHighlighted: true,
      },
    )
    expect(field.statusCode, JSON.stringify(field.body)).toBe(201)
    expect(field.body.isHighlighted).toBe(true)
    const lead = await rig.request('client_admin_A', 'POST', '/api/crm/leads', {
      organizationId: fixture.organizationId,
      crmInstanceId: fixture.instanceId,
      pipelineId: fixture.pipelineId,
      stageId: fixture.stageId,
      name: 'Cozinha teste',
      email: 'qualification@integration.test',
      source: 'manual',
      profile: {
        recordTypeId: type.body.id,
        values: { [field.body.stableKey]: 0 },
      },
    })
    expect(lead.statusCode, JSON.stringify(lead.body)).toBe(201)
    const member = await rig.sql(
      `SELECT id FROM public.crm_instance_members WHERE crm_instance_id=$1 AND user_id=$2`,
      [fixture.instanceId, fixtureUsers.client_member_A.id],
    )
    await rig.sql(`UPDATE public.leads SET owner_member_id=$2 WHERE id=$1`, [
      lead.body.id,
      member.rows[0].id,
    ])
    for (const role of [
      'yux_admin',
      'yux_operator',
      'client_admin_A',
      'client_member_A',
    ] as const) {
      const list = await rig.request(
        role,
        'GET',
        `/api/crm/leads?crmInstanceId=${fixture.instanceId}`,
      )
      expect(list.statusCode, JSON.stringify(list.body)).toBe(200)
      const found = list.body.find((l: any) => l.id === lead.body.id)
      expect(found.profileSummary.fields[0]).toMatchObject({
        label: 'Refeições diárias',
        value: 0,
        isHighlighted: true,
      })
      expect(JSON.stringify(found.profileSummary)).not.toContain(
        'organization_id',
      )
    }
    const other = await rig.request(
      'client_admin_B',
      'GET',
      `/api/crm/leads?crmInstanceId=${fixture.instanceId}`,
    )
    expect(other.body).toEqual([])
    await rig.sql(
      `UPDATE public.lead_scoring_models SET is_active=FALSE WHERE crm_instance_id=$1`,
      [fixture.instanceId],
    )
    const model = await rig.request(
      'client_admin_A',
      'POST',
      '/api/crm/scoring/model',
      { crmInstanceId: fixture.instanceId },
    )
    expect(model.statusCode, JSON.stringify(model.body)).toBe(201)
    expect(model.body.calculationMode).toBe('sum')
    expect(
      (
        await rig.request('client_member_A', 'POST', '/api/crm/scoring/model', {
          crmInstanceId: fixture.instanceId,
        })
      ).statusCode,
    ).toBe(403)
    const rule = {
      name: 'Refeições por dia',
      kind: 'profile',
      dimension: 'fit',
      fieldKey: `custom:${field.body.stableKey}`,
      recordTypeId: type.body.id,
      points: 10,
      bands: [
        { min: null, max: 500, points: 10 },
        { min: 500, max: 1000, points: 20 },
        { min: 1000, max: null, points: 30 },
      ],
    }
    const saved = await rig.request(
      'client_admin_A',
      'POST',
      '/api/crm/scoring/qualification-rules',
      { crmInstanceId: fixture.instanceId, rule },
    )
    expect(saved.statusCode, JSON.stringify(saved.body)).toBe(201)
    const profileUrl = `/api/crm/leads/${lead.body.id}/profile`
    for (const [value, points] of [
      [0, 10],
      [499, 10],
      [500, 20],
      [1000, 30],
      [1000, 30],
    ]) {
      const update = await rig.request('client_admin_A', 'PUT', profileUrl, {
        recordTypeId: type.body.id,
        values: { [field.body.stableKey]: value },
      })
      expect(update.statusCode, JSON.stringify(update.body)).toBe(200)
      const summary = await rig.request(
        'client_admin_A',
        'GET',
        `/api/crm/leads/${lead.body.id}/qualification`,
      )
      expect(summary.body.score, JSON.stringify(summary.body)).toBe(points)
    }
    for (const role of [
      'yux_admin',
      'yux_operator',
      'client_admin_A',
      'client_member_A',
    ] as const) {
      const response = await rig.request(
        role,
        'GET',
        `/api/crm/leads/${lead.body.id}/qualification`,
      )
      expect(response.statusCode).toBe(200)
      expect(Object.keys(response.body).sort()).toEqual(
        [
          'contributions',
          'fitScore',
          'intentScore',
          'leadId',
          'score',
          'temperature',
        ].sort(),
      )
    }
    expect(
      (
        await rig.request(
          'client_admin_B',
          'GET',
          `/api/crm/leads/${lead.body.id}/qualification`,
        )
      ).statusCode,
    ).toBe(404)
    expect(
      (
        await rig.request('client_member_A', 'POST', '/api/crm/leads/trash', {
          crmInstanceId: fixture.instanceId,
          leadIds: [lead.body.id],
        })
      ).statusCode,
    ).toBe(404)
    const invalid = await rig.request(
      'client_admin_A',
      'POST',
      '/api/crm/leads/trash',
      {
        crmInstanceId: fixture.instanceId,
        leadIds: [lead.body.id, randomUUID()],
      },
    )
    expect(invalid.statusCode).toBe(404)
    expect(
      (
        await rig.sql(`SELECT deleted_at FROM public.leads WHERE id=$1`, [
          lead.body.id,
        ])
      ).rows[0].deleted_at,
    ).toBeNull()
    const removed = await rig.request(
      'client_admin_A',
      'POST',
      '/api/crm/leads/trash',
      { crmInstanceId: fixture.instanceId, leadIds: [lead.body.id] },
    )
    expect(removed.statusCode, JSON.stringify(removed.body)).toBe(200)
    expect(
      (
        await rig.request(
          'client_admin_A',
          'POST',
          `/api/crm/leads/${lead.body.id}/tasks`,
          {
            organizationId: fixture.organizationId,
            title: 'Tarefa bloqueada',
            dueAt: new Date().toISOString(),
          },
        )
      ).statusCode,
    ).toBe(404)
    await expect(
      rig.sql(
        `INSERT INTO public.lead_tasks(organization_id,lead_id,title,due_at) VALUES($1,$2,'Bloqueada',now())`,
        [fixture.organizationId, lead.body.id],
      ),
    ).rejects.toMatchObject({ code: '23514' })
    expect(
      (await rig.request('client_admin_A', 'GET', profileUrl)).statusCode,
    ).toBe(404)
    const active = await rig.request(
      'client_admin_A',
      'GET',
      `/api/crm/leads?crmInstanceId=${fixture.instanceId}`,
    )
    expect(active.body.find((l: any) => l.id === lead.body.id)).toBeUndefined()
    const generic = await rig.request(
      'client_admin_A',
      'POST',
      '/api/crm/ops-query',
      {
        table: 'leads',
        operation: 'select',
        select: 'id,name',
        filters: [{ op: 'eq', column: 'id', value: lead.body.id }],
      },
    )
    expect(generic.statusCode, JSON.stringify(generic.body)).toBe(200)
    expect(generic.body.data).toEqual([])
    const deleted = await rig.request(
      'client_admin_A',
      'GET',
      `/api/crm/leads/trash?crmInstanceId=${fixture.instanceId}`,
    )
    expect(deleted.body.leads.some((l: any) => l.id === lead.body.id)).toBe(
      true,
    )
    const restored = await rig.request(
      'client_admin_A',
      'POST',
      `/api/crm/leads/${lead.body.id}/restore`,
      { crmInstanceId: fixture.instanceId },
    )
    expect(restored.statusCode, JSON.stringify(restored.body)).toBe(200)
    expect(
      (await rig.request('client_admin_A', 'GET', profileUrl)).body.values[
        field.body.stableKey
      ],
    ).toBe(1000)
  })
  it('scores actual response and task events once per message or task and enforces the rule cap', async () => {
    const lead = await rig.request('client_admin_A', 'POST', '/api/crm/leads', {
      organizationId: fixture.organizationId,
      crmInstanceId: fixture.instanceId,
      pipelineId: fixture.pipelineId,
      stageId: fixture.stageId,
      name: 'Atividades teste',
      email: 'activity@integration.test',
      source: 'manual',
      profile: { recordTypeId: null, values: {} },
    })
    expect(lead.statusCode).toBe(201)
    const rule = await rig.request(
      'client_admin_A',
      'POST',
      '/api/crm/scoring/qualification-rules',
      {
        crmInstanceId: fixture.instanceId,
        rule: {
          name: 'Respondeu com interesse',
          kind: 'activity',
          dimension: 'intent',
          eventType: 'lead.response_received',
          fieldKey: 'activity.text',
          operator: 'contains',
          comparisonValue: 'interesse',
          points: 25,
          maxContribution: 50,
        },
      },
    )
    expect(rule.statusCode, JSON.stringify(rule.body)).toBe(201)
    const worker = createContextAwarePool(
      new pg.Pool({ connectionString: rig.serviceDatabaseUrl('yux_worker') }),
      'worker',
    )
    const messageId = randomUUID()
    const apply = (
      payload: Record<string, unknown>,
      eventType = 'lead.response_received',
      eventId = randomUUID(),
    ) =>
      runWithDatabaseRequestContext(
        {
          role: 'yux_admin',
          organizationIds: [fixture.organizationId],
          serviceRole: 'worker',
        },
        () =>
          applyLeadScoringEvent(
            worker,
            createDomainEventEnvelope({
              eventId,
              eventType,
              organizationId: fixture.organizationId,
              crmInstanceId: fixture.instanceId,
              leadId: lead.body.id,
              aggregateType: 'lead',
              aggregateId: lead.body.id,
              actor: { type: 'lead' },
              payload,
            }),
          ),
      )
    try {
      expect(
        (
          await apply({
            messageId,
            text: 'Tenho interesse',
            channel: 'whatsapp',
          })
        ).combinedScore,
      ).toBe(25)
      expect(
        (
          await apply({
            messageId,
            text: 'Tenho interesse',
            channel: 'whatsapp',
          })
        ).combinedScore,
      ).toBe(25)
      expect(
        (
          await apply({
            messageId: randomUUID(),
            text: 'Sem orçamento',
            channel: 'whatsapp',
          })
        ).combinedScore,
      ).toBe(25)
      expect(
        (
          await apply({
            messageId: randomUUID(),
            text: 'Interesse em conversar',
            channel: 'whatsapp',
          })
        ).combinedScore,
      ).toBe(50)
      expect(
        (
          await apply({
            messageId: randomUUID(),
            text: 'Interesse novamente',
            channel: 'whatsapp',
          })
        ).combinedScore,
      ).toBe(50)
      const taskRule = await rig.request(
        'client_admin_A',
        'POST',
        '/api/crm/scoring/qualification-rules',
        {
          crmInstanceId: fixture.instanceId,
          rule: {
            name: 'Tarefa concluída',
            kind: 'activity',
            dimension: 'intent',
            eventType: 'lead.task_completed',
            points: 20,
            maxContribution: 100,
          },
        },
      )
      expect(taskRule.statusCode).toBe(201)
      const taskId = randomUUID()
      expect(
        (await apply({ taskId }, 'lead.task_completed')).combinedScore,
      ).toBe(70)
      expect(
        (await apply({ taskId }, 'lead.task_completed')).combinedScore,
      ).toBe(70)
      expect(
        (await apply({ taskId: randomUUID() }, 'lead.task_completed'))
          .combinedScore,
      ).toBe(90)
      const summary = await rig.request(
        'client_admin_A',
        'GET',
        `/api/crm/leads/${lead.body.id}/qualification`,
      )
      expect(summary.body.temperature).toBe('hot')
      expect(summary.body.contributions).toHaveLength(2)
      const cap = await rig.request(
        'client_admin_A',
        'POST',
        '/api/crm/scoring/qualification-rules',
        {
          crmInstanceId: fixture.instanceId,
          rule: {
            name: 'Faixa inválida',
            kind: 'profile',
            dimension: 'fit',
            fieldKey: 'lead.value',
            points: 10,
            bands: [{ min: 100, max: 20, points: 5 }],
          },
        },
      )
      expect(cap.statusCode).toBe(400)
      const fields = await rig.request(
        'client_admin_B',
        'GET',
        `/api/crm/scoring/fields?crmInstanceId=${fixture.instanceId}`,
      )
      expect(fields.statusCode).toBe(404)
      const preview = await rig.request(
        'client_admin_A',
        'POST',
        '/api/crm/scoring/recalculate',
        { crmInstanceId: fixture.instanceId, preview: true },
      )
      expect(preview.statusCode, JSON.stringify(preview.body)).toBe(200)
      await rig.request('client_admin_A', 'POST', '/api/crm/leads/trash', {
        crmInstanceId: fixture.instanceId,
        leadIds: [lead.body.id],
      })
      expect(
        (await apply({ taskId: randomUUID() }, 'lead.task_completed'))
          .appliedRules,
      ).toBe(0)
    } finally {
      await worker.end()
    }
  })
})
