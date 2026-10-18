import {describe,it,expect} from 'vitest'
import {randomUUID} from 'node:crypto'
import {connectionString,admin,available} from './support/radar-capture-fixture.js'
import {limitFixture} from './support/radar-capture-limit-fixture.js'
import {resumeRadarCaptureOperation} from '../src/modules/radar/capture-dispatch.js'
import pg from 'pg'
import {buildServer} from '../src/server.js'
import {createContextAwarePool} from '../src/db/client.js'
import {runWithDatabaseRequestContext} from '../src/db/request-context.js'
import {fixtureUsers,fixturePassword,fixtureIds} from './integration/support/fixtures.js'
const path='../src/modules/radar/capture-preflight.js',api=await import(path).catch(()=>({}))
const limits={pageSize:10,maxPagesPerScope:4,maxQueriesPerBatch:8}
describe.skipIf(!connectionString)('capture limits consent with PostgreSQL',()=>{
 it('requires explicit consent to reopen a legacy partial lot',async()=>{
  const f=await limitFixture()
  try{await expect(resumeRadarCaptureOperation(f.pool,admin,f.resume,{availability:available})).rejects.toThrow('radar_capture_limits_confirmation_required')}
  finally{await f.close()}
 })
 it('changes only lot discovery limits once and keeps original target and consumption',async()=>{
  const f=await limitFixture()
  try{
   expect(api.getRadarCapturePreflight).toBeTypeOf('function')
   const p=await api.getRadarCapturePreflight(f.pool,admin,f.input,{availability:available}),before=await f.op()
   const input={...f.resume,limitsAuthorization:{expectedStateId:p.stateId,limits}}
   await Promise.all([1,2].map(()=>resumeRadarCaptureOperation(f.pool,admin,input,{availability:available})))
   const after=await f.op()
   expect(after).toMatchObject({id:before.id,status:'queued',requested_count:20,queries:before.queries,scope_pages:before.scope_pages,resume_generation:1,discovery_stopped:false})
   expect(after.configuration_snapshot.search_configuration.batch).toMatchObject(limits)
   expect((await f.pool.query('SELECT search_configuration FROM public.radar_campaigns WHERE id=$1',[f.campaign.id])).rows[0].search_configuration.batch.maxPagesPerScope).toBe(1)
   const audit=(await f.pool.query('SELECT * FROM public.radar_capture_limit_authorizations WHERE operation_id=$1',[before.id])).rows
   expect(audit).toHaveLength(1);expect(audit[0]).toMatchObject({approved_by:admin.id,request_id:f.resume.requestId,new_limits:limits})
  }finally{await f.close()}
 })
 it.each(['changed_state','new_active','uncertain','live_lease'])('refuses unsafe continuation: %s',async mode=>{
  const f=await limitFixture()
  try{
   expect(api.getRadarCapturePreflight).toBeTypeOf('function')
   const p=await api.getRadarCapturePreflight(f.pool,admin,f.input,{availability:available})
   if(mode==='changed_state')await f.pool.query('UPDATE public.radar_capture_operations SET resume_generation=resume_generation+1 WHERE id=$1',[f.input.operationId])
   if(mode==='new_active')await f.pool.query("INSERT INTO public.radar_capture_operations(organization_id,campaign_id,requested_by,request_id,configuration_revision,requested_count,configuration_snapshot) SELECT organization_id,campaign_id,requested_by,$2,configuration_revision,1,configuration_snapshot FROM public.radar_capture_operations WHERE id=$1",[f.input.operationId,randomUUID()])
   if(mode==='uncertain')await f.pool.query('UPDATE public.radar_capture_operations SET discovery_pending=TRUE WHERE id=$1',[f.input.operationId])
   if(mode==='live_lease')await f.pool.query("UPDATE public.radar_capture_operations SET lease_until=NOW()+INTERVAL '1 minute' WHERE id=$1",[f.input.operationId])
   const before=await f.op()
   await expect(resumeRadarCaptureOperation(f.pool,admin,{...f.resume,limitsAuthorization:{expectedStateId:p.stateId,limits}},{availability:available})).rejects.toThrow()
   expect(await f.op()).toEqual(before)
  }finally{await f.close()}
 })
 it('rolls back the limits audit and snapshot when requeue fails',async()=>{
  const f=await limitFixture(),name=`limit_rollback_${randomUUID().replaceAll('-','')}`
  try{
   const p=await api.getRadarCapturePreflight(f.pool,admin,f.input,{availability:available}),before=await f.op()
   await f.pool.query(`CREATE FUNCTION public.${name}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id='${f.input.operationId}' AND NEW.status='queued' THEN RAISE EXCEPTION 'limit_queue_failure'; END IF; RETURN NEW; END $$`)
   await f.pool.query(`CREATE TRIGGER ${name} BEFORE UPDATE ON public.radar_capture_operations FOR EACH ROW EXECUTE FUNCTION public.${name}()`)
   await expect(resumeRadarCaptureOperation(f.pool,admin,{...f.resume,limitsAuthorization:{expectedStateId:p.stateId,limits}},{availability:available})).rejects.toThrow('limit_queue_failure')
   expect(await f.op()).toEqual(before)
   expect((await f.pool.query('SELECT id FROM public.radar_capture_limit_authorizations WHERE operation_id=$1',[f.input.operationId])).rows).toHaveLength(0)
  }finally{await f.pool.query(`DROP TRIGGER IF EXISTS ${name} ON public.radar_capture_operations`);await f.pool.query(`DROP FUNCTION IF EXISTS public.${name}()`);await f.close()}
 })
 it('revalidates the quota for the approved page size, not the old one',async()=>{
  const f=await limitFixture()
  try{
   await f.pool.query('UPDATE public.radar_campaigns SET daily_limit=3 WHERE id=$1',[f.campaign.id])
   const p=await api.getRadarCapturePreflight(f.pool,admin,f.input,{availability:available}),before=await f.op()
   expect(p.allowed).toBe(true)
   await expect(resumeRadarCaptureOperation(f.pool,admin,{...f.resume,limitsAuthorization:{expectedStateId:p.stateId,limits:{pageSize:5,maxPagesPerScope:4,maxQueriesPerBatch:8}}},{availability:available})).rejects.toThrow()
   expect(await f.op()).toEqual(before)
  }finally{await f.close()}
 })
 it.each([{pageSize:0,maxPagesPerScope:4,maxQueriesPerBatch:8},{pageSize:10,maxPagesPerScope:11,maxQueriesPerBatch:8},{pageSize:10,maxPagesPerScope:4,maxQueriesPerBatch:101},{pageSize:1,maxPagesPerScope:1,maxQueriesPerBatch:1},{maxPagesPerScope:4,maxQueriesPerBatch:8}])('rejects invalid or insufficient approved limits %j',async proposed=>{
  const f=await limitFixture()
  try{
   const p=await api.getRadarCapturePreflight(f.pool,admin,f.input,{availability:available}),before=await f.op()
   await expect(resumeRadarCaptureOperation(f.pool,admin,{...f.resume,limitsAuthorization:{expectedStateId:p.stateId,limits:proposed as typeof limits}},{availability:available})).rejects.toThrow()
   expect(await f.op()).toEqual(before)
  }finally{await f.close()}
 })
 it('enforces HTTP audience, exact consent and scoped immutable audit permissions',async()=>{
  const f=await limitFixture(),url=new URL(connectionString!);url.username='yux_api'
  const pool=createContextAwarePool(new pg.Pool({connectionString:url.toString()}),'api');let dispatched=0
  const app=await buildServer({NODE_ENV:'test',DATABASE_URL:connectionString!,REDIS_URL:'redis://127.0.0.1:1',SESSION_COOKIE_NAME:'yux_session',SESSION_SECRET:'local-limits-test-secret-at-least-32',CORS_ORIGIN:'http://localhost:3000',PORT:4000},{pool,jobQueue:{add:async()=>{dispatched++;return{id:'fake'}},close:async()=>{}},redisPing:async()=>'PONG'})
  const workerUrl=new URL(connectionString!);workerUrl.username='yux_worker'
  const worker=createContextAwarePool(new pg.Pool({connectionString:workerUrl.toString()}),'worker')
  try{
   const login=async(role:keyof typeof fixtureUsers)=>{
    const response=await app.inject({method:'POST',url:'/api/auth/login',payload:{email:fixtureUsers[role].email,password:fixturePassword}})
    expect(response.statusCode).toBe(200);return String(response.headers['set-cookie']).split(';')[0]
   }
   const path=`/api/radar/campaigns/${f.campaign.id}/capture-preflight`,{campaignId:_campaignId,...payload}=f.input
   for(const role of ['yux_operator','client_admin_A','client_member_A','client_admin_B'] as const){
    const response=await app.inject({method:'POST',url:path,headers:{cookie:await login(role)},payload})
    expect(response.statusCode).toBe(403);expect(response.body).not.toMatch(/stateId|queries|cnpja|worker|limits/i)
   }
   const cookie=await login('yux_admin')
   const response=await app.inject({method:'POST',url:path,headers:{cookie},payload})
   expect(response.statusCode).toBe(200);expect(dispatched).toBe(0)
   const stateId=response.json().stateId
   const resume={organizationId:f.input.organizationId,configurationRevision:1,requestId:f.resume.requestId,limitsAuthorization:{expectedStateId:stateId,limits}}
   const resumed=await app.inject({method:'POST',url:`/api/radar/capture-operations/${f.input.operationId}/resume`,headers:{cookie},payload:resume})
   expect(resumed.statusCode).toBe(202);expect(resumed.json()).toMatchObject({id:f.input.operationId,counts:{requested:20}});expect(dispatched).toBe(1)
   await runWithDatabaseRequestContext({role:'client_member',serviceRole:'worker',organizationIds:[fixtureIds.organizationB]},async()=>{
    expect((await worker.query('SELECT id FROM public.radar_capture_limit_authorizations WHERE operation_id=$1',[f.input.operationId])).rows).toHaveLength(0)
   })
   await runWithDatabaseRequestContext({role:'client_member',serviceRole:'worker',organizationIds:[f.input.organizationId]},async()=>{
    expect((await worker.query('SELECT id FROM public.radar_capture_limit_authorizations WHERE operation_id=$1',[f.input.operationId])).rows).toHaveLength(1)
    await expect(worker.query('DELETE FROM public.radar_capture_limit_authorizations WHERE operation_id=$1',[f.input.operationId])).rejects.toThrow('permission denied')
   })
  }finally{await app.close();await pool.end();await worker.end();await f.close()}
 },20_000)
})
