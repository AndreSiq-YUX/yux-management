import { randomUUID } from 'node:crypto'
import { expect, it } from 'vitest'
import pg from 'pg'
import { createIntegrationRig, getIntegrationDatabaseUrl } from './support/rig.js'
import { runRadarMissionCommand } from '../../src/modules/radar/action-engine-store.js'
import { seedRadarMissionAction } from './support/radar-action-fixture.js'

it('commits a Radar mutation and its idempotent result once under concurrent delivery',async()=>{
  const rig=await createIntegrationRig({queueMode:'stub'})
  const pool=new pg.Pool({connectionString:getIntegrationDatabaseUrl()})
  try {
    const context=await seedRadarMissionAction(rig)
    const key=context.idempotencyKey
    const execute=()=>runRadarMissionCommand(pool,context,'radar.campaign.create',{name:'Campaign'},async(client)=>{
      const r=await client.query(`INSERT INTO public.radar_campaigns(organization_id,name,target_segment,target_city,target_state,offer_type,created_by)
        VALUES($1,'Campaign','Segment','City','SP','Offer',$2) RETURNING id`,[context.organizationId,context.actorUserId])
      return {campaignId:r.rows[0].id}
    },true)
    const results=await Promise.all(Array.from({length:10},execute))
    expect(new Set(results.map(r=>r.campaignId)).size).toBe(1)
    await expect(runRadarMissionCommand(pool,context,'radar.campaign.create',{name:'Changed'},async()=>({}),true)).rejects.toThrow('radar_mission_idempotency_conflict')
    expect((await rig.sql('SELECT count(*)::int AS n FROM action_radar_commands WHERE organization_id=$1 AND idempotency_key=$2',[context.organizationId,key])).rows[0].n).toBe(1)
  } finally {await pool.end();await rig.close()}
})
