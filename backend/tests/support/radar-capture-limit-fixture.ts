import {randomUUID} from 'node:crypto'
import {captureFixture,admin,organizationId,available} from './radar-capture-fixture.js'
import {startRadarCaptureOperation} from '../../src/modules/radar/capture-operation.js'
export async function limitFixture(){
 const f=await captureFixture()
 const started=await startRadarCaptureOperation(f.pool,admin,{organizationId,campaignId:f.campaign.id,configurationRevision:1,requestId:randomUUID(),requestedCount:20},{availability:available})
 await f.pool.query("UPDATE public.radar_campaigns SET search_configuration=jsonb_set(search_configuration,'{batch,maxPagesPerScope}','1') WHERE id=$1",[f.campaign.id])
 await f.pool.query("UPDATE public.radar_capture_operations SET status='partial',discovery_stopped=TRUE,discovery_reason='page_cap',configuration_snapshot=jsonb_set(configuration_snapshot,'{search_configuration,batch,maxPagesPerScope}','1') WHERE id=$1",[started.operationId])
 const input={organizationId,campaignId:f.campaign.id,operationId:started.operationId,configurationRevision:1,requestedCount:20}
 const op=async()=>(await f.pool.query('SELECT * FROM public.radar_capture_operations WHERE id=$1',[started.operationId])).rows[0]
 return{...f,input,op,resume:{organizationId,operationId:started.operationId,configurationRevision:1,requestId:randomUUID()}}
}
