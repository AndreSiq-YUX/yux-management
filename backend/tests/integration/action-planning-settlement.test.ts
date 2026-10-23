import { randomUUID } from 'node:crypto'
import { expect, it } from 'vitest'
import pg from 'pg'
import { createContextAwarePool } from '../../src/db/client.js'
import { runWithDatabaseRequestContext } from '../../src/db/request-context.js'
import { reservePlanningCall, settlePlanningCall } from '../../src/modules/action-engine/planning-cycle.js'
import { createIntegrationRig } from './support/rig.js'

it('settles actual model usage with the worker and rejects a reservation from another cycle or tenant', async () => {
  const rig = await createIntegrationRig({ queueMode: 'stub' })
  const pool = createContextAwarePool(new pg.Pool({ connectionString: rig.serviceDatabaseUrl('yux_worker') }), 'worker')
  const cycleId = randomUUID()
  const actual = { calls: 1, inputTokens: 100, outputTokens: 50, costBrl: '0.03', latencyMs: 100 }
  try {
    await rig.sql(`INSERT INTO public.action_planning_cycles
      (id,organization_id,mission_id,plan_revision,context_hash,pack_key,pack_version,budget)
      SELECT $1,$2,$3,COALESCE(MAX(plan_revision),0)+1,$4,'integration_pack','1.0.0',$5
      FROM public.action_planning_cycles WHERE mission_id=$3`,
    [cycleId, rig.ids.organizationA, rig.ids.missionA, 'a'.repeat(64),
      { maxCalls: 2, maxInputTokens: 1000, maxOutputTokens: 1000, maxCostBrl: '5', maxLatencyMs: 5000 }])
    await runWithDatabaseRequestContext({ role: 'yux_operator', organizationIds: [rig.ids.organizationA], serviceRole: 'worker' }, async () => {
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        const reservation = await reservePlanningCall(client, {
          cycleId, organizationId: rig.ids.organizationA, specialistProfile: 'mission_supervisor', specialistVersion: 1,
          reservation: { calls: 1, inputTokens: 500, outputTokens: 500, costBrl: '1', latencyMs: 1000 },
        })
        const input = { cycleId, organizationId: rig.ids.organizationA, reservationId: reservation.reservationId, actual,
          providerModelId: 'fixture-model', metadata: { profileKey: 'mission_supervisor' } }
        await expect(settlePlanningCall(client, { ...input, cycleId: randomUUID() })).rejects.toThrow('planning_reservation_unavailable')
        await expect(settlePlanningCall(client, { ...input, organizationId: rig.ids.organizationB })).rejects.toThrow('planning_reservation_unavailable')
        await expect(settlePlanningCall(client, input)).resolves.toEqual(actual)
        await client.query('COMMIT')
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      } finally { client.release() }
    })
    const entries = await rig.sql(`SELECT nature,input_tokens,output_tokens,cost_brl::text,provider_model_id,metadata
      FROM public.action_planning_usage_entries WHERE cycle_id=$1 AND nature='actual'`, [cycleId])
    expect(entries.rows).toEqual([{ nature: 'actual', input_tokens: 100, output_tokens: 50,
      cost_brl: '0.030000', provider_model_id: 'fixture-model', metadata: { profileKey: 'mission_supervisor' } }])
    expect((await rig.sql('SELECT usage FROM public.action_planning_cycles WHERE id=$1', [cycleId])).rows[0].usage).toEqual(actual)
  } finally { await pool.end(); await rig.close() }
})
