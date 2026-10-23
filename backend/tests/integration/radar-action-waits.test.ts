import { randomUUID } from 'node:crypto'
import { expect,it } from 'vitest'
import pg from 'pg'
import { createIntegrationRig,getIntegrationDatabaseUrl } from './support/rig.js'
import { seedRadarMissionAction } from './support/radar-action-fixture.js'
import { attachRadarMissionOperation } from '../../src/modules/radar/action-engine-store.js'
import { inspectRadarMissionOperation,reconcileRadarMissionOperations } from '../../src/modules/action-engine/radar-operation-waits.js'
import { radarProspectingMetricCollector } from '../../src/modules/action-engine/metrics/radar-prospecting.js'
import { getMission } from '../../src/modules/action-engine/repository.js'

it('waits across reconcilers, blocks cross-tenant reads and retries a lost queue acknowledgement',async()=>{
 const rig=await createIntegrationRig({queueMode:'stub'}),pool=new pg.Pool({connectionString:getIntegrationDatabaseUrl()})
 try{
  const context=await seedRadarMissionAction(rig,'radar.operation.await')
  const campaignId=(await rig.sql("INSERT INTO public.radar_campaigns(organization_id,name,target_segment,target_city,target_state,offer_type,created_by) VALUES($1,'Wait test','Empresas','Curitiba','PR','Oferta',$2) RETURNING id",[context.organizationId,context.actorUserId])).rows[0].id
  const requestId=randomUUID()
  const operationId=(await rig.sql(`INSERT INTO public.radar_capture_operations(organization_id,campaign_id,requested_by,request_id,configuration_revision,requested_count,configuration_snapshot,status)
    VALUES($1,$2,$3,$4,1,10,'{}','researching') RETURNING id`,[context.organizationId,campaignId,context.actorUserId,requestId])).rows[0].id
  const ref={operationType:'capture' as const,operationId,requestId,campaignId,configurationRevision:1,criteriaRevision:1}
  await attachRadarMissionOperation(pool,context,ref)
  await rig.sql("UPDATE public.action_runs SET output=$2::jsonb,claimed_by='radar_operation_wait',available_at=NOW()-INTERVAL '1 second' WHERE id=$1",[context.actionRunId,JSON.stringify({output:{status:'pending',ref},effectProduced:false})])
  expect(await inspectRadarMissionOperation(pool,context,ref)).toMatchObject({status:'pending'})
  await expect(inspectRadarMissionOperation(pool,{...context,organizationId:rig.ids.organizationB},ref)).rejects.toThrow('unlinked')
  await rig.restartApi()
  const enqueued:string[]=[]
  let queueFails=true
  const queue={async add(name:string){if(queueFails)throw Error('lost acknowledgement');enqueued.push(name);return{id:'test'}}}
  expect(await reconcileRadarMissionOperations(pool,queue as never)).toMatchObject({resolved:0})
  await rig.sql("UPDATE public.radar_capture_operations SET status='partial' WHERE id=$1",[operationId])
  await rig.sql("UPDATE public.action_runs SET available_at=NOW()-INTERVAL '1 second' WHERE id=$1",[context.actionRunId])
  expect(await reconcileRadarMissionOperations(pool,queue as never)).toMatchObject({resolved:1})
  expect((await rig.sql('SELECT status,claimed_by FROM public.action_runs WHERE id=$1',[context.actionRunId])).rows[0]).toMatchObject({status:'succeeded',claimed_by:'radar_needs_schedule'})
  queueFails=false
  await reconcileRadarMissionOperations(pool,queue as never)
  expect(enqueued).toEqual(['action-engine.scheduleReadyActions'])
  await reconcileRadarMissionOperations(pool,queue as never)
  expect(enqueued).toHaveLength(1)
  const mission=await getMission(pool,context.missionId,context.organizationId)
  const metrics=await radarProspectingMetricCollector.collect(pool,mission!)
  expect(metrics.metrics.operations_partial).toMatchObject({value:'1'})
  expect(metrics.metrics.attributed_revenue_brl.kind).toBe('not_applicable')
 }finally{await pool.end();await rig.close()}
})
