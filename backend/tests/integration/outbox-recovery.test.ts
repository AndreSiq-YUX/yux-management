import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { expect, it } from 'vitest'
import {
  claimPendingEvents,
  completeEventDispatch,
  getOutboxOperationalSnapshot,
} from '../../src/modules/events/repository.js'
import { createIntegrationRig, getIntegrationDatabaseUrl } from './support/rig.js'

it('retoma claim expirado e impede finalização por proprietário antigo', async () => {
  const rig = await createIntegrationRig()
  const pool = new pg.Pool({ connectionString: getIntegrationDatabaseUrl(), max: 2 })
  const eventId = randomUUID()
  try {
    await rig.sql(
      `INSERT INTO public.domain_events (
         id,organization_id,event_type,aggregate_type,aggregate_id,correlation_id,actor,payload
       ) VALUES ($1,$2,'integration.outbox_recovery','mission',$3,$1,'{"type":"system"}'::jsonb,'{}'::jsonb)`,
      [eventId, rig.ids.organizationA, rig.ids.missionA],
    )

    const first = await claimPendingEvents(pool, 1, 'worker-a')
    expect(first[0]?.claim).toMatchObject({ owner: 'worker-a', attempt: 1, stage: 'fan_out' })

    await rig.sql(
      `UPDATE public.domain_events SET lease_until = NOW() - INTERVAL '1 second' WHERE id = $1`,
      [eventId],
    )
    const recovered = await claimPendingEvents(pool, 1, 'worker-b')
    expect(recovered[0]?.claim).toMatchObject({ owner: 'worker-b', attempt: 2, stage: 'fan_out' })

    expect(await completeEventDispatch(pool, eventId, 'worker-a', 1)).toBe(false)
    expect(await completeEventDispatch(pool, eventId, 'worker-b', 2)).toBe(true)

    const snapshot = await getOutboxOperationalSnapshot(pool)
    expect(snapshot.abandonedLeases).toBe(0)
  } finally {
    await pool.end()
    await rig.close()
  }
})
