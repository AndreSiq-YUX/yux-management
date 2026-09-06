import pg from 'pg'
import { afterEach, expect, it } from 'vitest'
import {
  getActiveAutonomyGrant,
  getAutonomyGrant,
  listAutonomyGrants,
} from '../../src/modules/action-engine/autonomy-grants.js'
import { handleCampaignOptimizationCheckpoints } from '../../src/jobs/handlers/action-engine.js'
import { createIntegrationRig, getIntegrationDatabaseUrl, type IntegrationRig } from './support/rig.js'

let rig: IntegrationRig | undefined
let pool: pg.Pool | undefined

afterEach(async () => {
  await rig?.close()
  rig = undefined
  await pool?.end()
  pool = undefined
})

it('executa consultas de grants e checkpoints sem usar alias reservado', async () => {
  rig = await createIntegrationRig()
  pool = new pg.Pool({ connectionString: getIntegrationDatabaseUrl(), max: 2 })
  const actor = (await pool.query<{ id: string }>(
    `SELECT id FROM public.app_users WHERE email='admin-a@integration.test'`,
  )).rows[0].id
  const now = new Date()
  const activeStart = new Date(now.getTime() - 60 * 60 * 1_000).toISOString()
  const activeEnd = new Date(now.getTime() + 24 * 60 * 60 * 1_000).toISOString()
  const expiredStart = new Date(now.getTime() - 48 * 60 * 60 * 1_000).toISOString()
  const expiredEnd = new Date(now.getTime() - 24 * 60 * 60 * 1_000).toISOString()

  expect(await getAutonomyGrant(pool, '90000000-0000-4000-8000-000000000099', rig.ids.organizationA)).toBeNull()

  const activeId = '90000000-0000-4000-8000-000000000001'
  const expiredId = '90000000-0000-4000-8000-000000000002'
  const revokedId = '90000000-0000-4000-8000-000000000003'
  const envelope = {
    mode: 'autonomous',
    allowedModules: ['campaigns'],
    allowedCapabilityKeys: [],
    maxTotalCostBrl: '100',
    maxHumanHours: '1',
    maxExternalContacts: 0,
    expiresAt: activeEnd,
    alwaysRequireApprovalFor: [],
  }
  await pool.query(
    `INSERT INTO public.action_autonomy_grants
       (id,organization_id,mission_id,grant_version,mission_version,envelope,envelope_hash,starts_at,expires_at,requested_by)
     VALUES
       ($1,$4,$5,1,1,$6,repeat('a',64),$8,$9,$7),
       ($2,$4,$5,2,1,$6,repeat('b',64),$10,$11,$7),
       ($3,$4,$5,3,1,$6,repeat('c',64),$8,$9,$7)`,
    [activeId, expiredId, revokedId, rig.ids.organizationA, rig.ids.missionA, envelope, actor,
      activeStart, activeEnd, expiredStart, expiredEnd],
  )
  await pool.query(
    `INSERT INTO public.action_autonomy_grant_events
       (organization_id,grant_id,event_type,actor_id,subject_hash,occurred_at)
     VALUES
       ($1,$2,'requested',$5,repeat('a',64),'2026-09-05T17:00:00Z'),
       ($1,$2,'approved',$5,repeat('a',64),'2026-09-05T17:01:00Z'),
       ($1,$2,'activated',$5,repeat('a',64),'2026-09-05T17:02:00Z'),
       ($1,$3,'requested',$5,repeat('b',64),'2026-09-01T00:00:00Z'),
       ($1,$3,'activated',$5,repeat('b',64),'2026-09-01T00:01:00Z'),
       ($1,$4,'requested',$5,repeat('c',64),'2026-09-05T17:00:00Z'),
       ($1,$4,'activated',$5,repeat('c',64),'2026-09-05T17:01:00Z'),
       ($1,$4,'revoked',$5,repeat('c',64),'2026-09-05T17:02:00Z')`,
    [rig.ids.organizationA, activeId, expiredId, revokedId, actor],
  )

  expect((await getAutonomyGrant(pool, activeId, rig.ids.organizationA))?.status).toBe('active')
  expect((await getAutonomyGrant(pool, expiredId, rig.ids.organizationA))?.status).toBe('expired')
  expect((await getAutonomyGrant(pool, revokedId, rig.ids.organizationA))?.status).toBe('revoked')
  expect((await getActiveAutonomyGrant(pool, rig.ids.missionA, rig.ids.organizationA, now))?.id).toBe(activeId)
  expect(await listAutonomyGrants(pool, rig.ids.missionA, rig.ids.organizationA)).toHaveLength(3)

  await expect(handleCampaignOptimizationCheckpoints(pool, {
    missionId: rig.ids.missionA,
    now: now.toISOString(),
  })).resolves.toEqual({ candidates: 0, recorded: 0, duplicates: 0, approvals: 0, paused: 0 })
})
