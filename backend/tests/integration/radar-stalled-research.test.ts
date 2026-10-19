import {describe,it,expect} from 'vitest'
import {randomUUID} from 'node:crypto'
import pg from 'pg'
import {captureFixture,connectionString,organizationId,admin} from '../support/radar-capture-fixture.js'
import {queueRadarResearchRequest} from '../../src/modules/radar/research-requests.js'
import {createContextAwarePool} from '../../src/db/client.js'
import {runWithDatabaseRequestContext} from '../../src/db/request-context.js'
import {fixtureIds} from './support/fixtures.js'
import {reconcileRadarCaptureOutbox as maintainRadar} from '../../src/jobs/handlers/maintenance.js'
const modulePath='../../src/modules/radar/stalled-research.js',api=await import(modulePath).catch(()=>({})) as typeof import('../../src/modules/radar/stalled-research.js')
describe.skipIf(!connectionString)('Radar research watchdog in isolated PostgreSQL',()=>{
 it('records progress, ignores heartbeat/time/order-only updates and preserves dated business facts',async()=>{
  const f=await captureFixture()
  try{
   const candidate=(await f.pool.query(`INSERT INTO public.radar_candidate_records(organization_id,campaign_id,source_type,title,dedupe_key,normalized_payload) VALUES($1,$2,'manual','Empresa vigia',$3,'{}') RETURNING id`,[organizationId,f.campaign.id,randomUUID()])).rows[0]
   const run=(await f.pool.query(`INSERT INTO public.radar_candidate_research_runs(organization_id,campaign_id,candidate_id,configuration_revision,requested_by,status,output) VALUES($1,$2,$3,1,$4,'running',$5) RETURNING *`,[organizationId,f.campaign.id,candidate.id,admin.id,JSON.stringify({pages:[{text:'A',observedAt:'2026-10-18'},{text:'B',observedAt:'2026-10-18'}]})])).rows[0]
   expect(run).toHaveProperty('last_progress_at')
   await f.pool.query("UPDATE public.radar_candidate_research_runs SET last_progress_at=NOW()-INTERVAL '1 hour' WHERE id=$1",[run.id])
   const before=(await f.pool.query('SELECT * FROM public.radar_candidate_research_runs WHERE id=$1',[run.id])).rows[0].last_progress_at
   await f.pool.query('UPDATE public.radar_candidate_research_runs SET updated_at=NOW(),lease_until=NOW()+INTERVAL \'6 minutes\',output=$2 WHERE id=$1',[run.id,JSON.stringify({pages:[{text:'B',observedAt:'2026-10-19'},{text:'A',observedAt:'2026-10-19'}]})])
   expect((await f.pool.query('SELECT last_progress_at FROM public.radar_candidate_research_runs WHERE id=$1',[run.id])).rows[0].last_progress_at).toEqual(before)
   await f.pool.query("UPDATE public.radar_candidate_research_runs SET output=jsonb_set(output,'{publishedDate}','\"2026-10-19\"') WHERE id=$1",[run.id])
   expect((await f.pool.query('SELECT last_progress_at FROM public.radar_candidate_research_runs WHERE id=$1',[run.id])).rows[0].last_progress_at.getTime()).toBeGreaterThan(before.getTime())
   const request=await queueRadarResearchRequest(f.pool,admin,{organizationId,campaignId:f.campaign.id,candidateIds:[candidate.id],criteriaRevision:1,intent:'resume',requestId:randomUUID()})
   const parent=(await f.pool.query('SELECT id FROM public.radar_research_requests WHERE request_id=$1',[request.requestId])).rows[0]
   await f.pool.query('UPDATE public.radar_research_request_items SET run_id=$2 WHERE research_request_id=$1',[parent.id,run.id])
   const parentLock=await f.pool.connect(),childUpdate=await f.pool.connect()
   try{
    await parentLock.query('BEGIN');await parentLock.query('SELECT id FROM public.radar_research_requests WHERE id=$1 FOR UPDATE',[parent.id])
    await childUpdate.query('BEGIN');await childUpdate.query("SET LOCAL lock_timeout='100ms'")
    // Progress markers must not introduce child->parent locks opposite to the
    // existing campaign/parent->child completion transaction.
    await expect(childUpdate.query("UPDATE public.radar_candidate_research_runs SET stage='reading' WHERE id=$1",[run.id])).resolves.toMatchObject({rowCount:1})
   }finally{await childUpdate.query('ROLLBACK');await parentLock.query('ROLLBACK');childUpdate.release();parentLock.release()}
  }finally{await f.close()}
 })
 it('deduplicates attention, isolates tenants and never retries an uncertain paid effect',async()=>{
  expect(api.inspectStalledRadarResearch).toBeTypeOf('function')
  const f=await captureFixture()
  const url=new URL(connectionString!);url.username='yux_worker'
  const worker=createContextAwarePool(new pg.Pool({connectionString:url.toString()}),'worker')
  const scoped=<T>(work:()=>Promise<T>,ids:string[]=[organizationId])=>runWithDatabaseRequestContext({role:'yux_operator',organizationIds:ids,serviceRole:'worker'},work)
  try{
   const candidate=(await f.pool.query(`INSERT INTO public.radar_candidate_records(organization_id,campaign_id,source_type,title,dedupe_key,normalized_payload) VALUES($1,$2,'manual','Empresa parada',$3,'{}') RETURNING id`,[organizationId,f.campaign.id,randomUUID()])).rows[0]
   const result=await queueRadarResearchRequest(f.pool,admin,{organizationId,campaignId:f.campaign.id,candidateIds:[candidate.id],criteriaRevision:1,intent:'resume',requestId:randomUUID()})
   const request=(await f.pool.query('SELECT * FROM public.radar_research_requests WHERE request_id=$1',[result.requestId])).rows[0]
   const run=(await f.pool.query(`INSERT INTO public.radar_candidate_research_runs(organization_id,campaign_id,candidate_id,configuration_revision,requested_by,status,calls) VALUES($1,$2,$3,1,$4,'blocked','{"presence":{"status":"uncertain"}}') RETURNING id`,[organizationId,f.campaign.id,candidate.id,admin.id])).rows[0]
   await f.pool.query("UPDATE public.radar_research_request_items SET state='waiting',run_id=$2,reason_code='radar_presence_previous_request_uncertain' WHERE research_request_id=$1",[request.id,run.id])
   await f.pool.query("UPDATE public.radar_research_requests SET status='waiting',last_progress_at=NOW()-INTERVAL '1 hour' WHERE id=$1",[request.id])
   for(const [table,id] of [['radar_research_requests',request.id],['radar_candidate_research_runs',run.id]] as const)await f.pool.query(`UPDATE public.${table} SET last_progress_at=NOW()-INTERVAL '1 hour' WHERE id=$1`,[id])
   await f.pool.query("UPDATE public.radar_research_request_items SET last_progress_at=NOW()-INTERVAL '1 hour' WHERE research_request_id=$1",[request.id])
   const options={now:new Date(),stalledAfterMinutes:10}
   const observations=await scoped(()=>api.inspectStalledRadarResearch(worker,options))
   expect(observations.find((item:{id:string})=>item.id===request.id)).toMatchObject({reason:'effect_uncertain',nextAction:'reconcile_receipts'})
   await scoped(()=>api.persistStalledRadarResearch(worker,observations,options.now));await scoped(()=>api.persistStalledRadarResearch(worker,observations,options.now))
   expect(Number((await f.pool.query('SELECT COUNT(*) AS n FROM public.radar_research_attention WHERE research_request_id=$1',[request.id])).rows[0].n)).toBe(1)
   expect(await scoped(()=>api.inspectStalledRadarResearch(worker,options),[fixtureIds.organizationA])).not.toEqual(expect.arrayContaining([expect.objectContaining({id:request.id})]))
   expect((await f.pool.query('SELECT calls FROM public.radar_candidate_research_runs WHERE id=$1',[run.id])).rows[0].calls).toEqual({presence:{status:'uncertain'}})
   let deliveryAttempts=0
   expect(await scoped(()=>worker.query('SELECT * FROM public.radar_research_requests'),[])).toMatchObject({rows:[]})
   expect((await scoped(()=>worker.query('SELECT organization_id FROM public.radar_research_watchdog_scopes'),[])).rows).toContainEqual({organization_id:organizationId})
   await expect(scoped(()=>maintainRadar(worker,{add:async()=>{deliveryAttempts++;throw Error('fixture_queue_unavailable')}},1),[])).rejects.toThrow('fixture_queue_unavailable')
   expect(deliveryAttempts).toBeGreaterThan(0)
   expect((await f.pool.query('SELECT reason FROM public.radar_research_attention WHERE research_request_id=$1',[request.id])).rows[0].reason).toBe('effect_uncertain')
   expect((await f.pool.query('SELECT calls FROM public.radar_candidate_research_runs WHERE id=$1',[run.id])).rows[0].calls).toEqual({presence:{status:'uncertain'}})
   expect((await f.pool.query('SELECT * FROM public.radar_source_usage_counters WHERE campaign_id=$1',[f.campaign.id])).rows).toHaveLength(0)
   await f.pool.query("UPDATE public.radar_research_requests SET status='completed' WHERE id=$1",[request.id])
   await scoped(()=>api.persistStalledRadarResearch(worker,[],new Date()))
   expect((await f.pool.query('SELECT resolved_at FROM public.radar_research_attention WHERE research_request_id=$1',[request.id])).rows[0].resolved_at).not.toBeNull()
  }finally{await worker.end();await f.close()}
 })
})
