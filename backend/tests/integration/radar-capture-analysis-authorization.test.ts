import {describe,it,expect} from 'vitest'
import pg from 'pg'
import {randomUUID} from 'node:crypto'
import {captureFixture,connectionString,admin,organizationId,available,company} from '../support/radar-capture-fixture.js'
import {fixtureUsers,fixturePassword} from './support/fixtures.js'
import {startRadarCaptureOperation,getRadarCaptureOperation} from '../../src/modules/radar/capture-operation.js'
import {advanceRadarCaptureDiscovery} from '../../src/modules/radar/capture-discovery.js'
import {createContextAwarePool} from '../../src/db/client.js'
import {buildServer} from '../../src/server.js'

describe.skipIf(!connectionString)('capture analysis authorization through HTTP and PostgreSQL',()=>{
 it('accepts the typed Admin consent and denies forged approvals without exposing audit data',async()=>{
  const f=await captureFixture(),url=new URL(connectionString!);url.username='yux_api'
  const pool=createContextAwarePool(new pg.Pool({connectionString:url.toString()}),'api')
  const app=await buildServer({NODE_ENV:'test',DATABASE_URL:connectionString!,REDIS_URL:'redis://127.0.0.1:1',SESSION_COOKIE_NAME:'yux_session',SESSION_SECRET:'radar-analysis-authorization-fixture-secret',CORS_ORIGIN:'http://localhost:3000',PORT:4000},
    {pool,jobQueue:{add:async()=>({id:'fixture'}),close:async()=>{}},redisPing:async()=>'PONG'})
  try{
   const start=await startRadarCaptureOperation(f.pool,admin,{organizationId,campaignId:f.campaign.id,configurationRevision:1,requestId:randomUUID(),requestedCount:1},{availability:available})
   await advanceRadarCaptureDiscovery(f.pool,{} as never,{organizationId,operationId:start.operationId},{availability:available,searchPage:async()=>({candidates:[company()]}),loadSecret:async()=>'fixture'})
   await f.pool.query("UPDATE public.radar_capture_items SET status='blocked' WHERE operation_id=$1",[start.operationId])
   await f.pool.query("UPDATE public.radar_capture_operations SET status='blocked' WHERE id=$1",[start.operationId])
   for(const role of ['yux_operator','client_admin_A','client_member_A','yux_admin'] as const){
    const login=await app.inject({method:'POST',url:'/api/auth/login',payload:{email:fixtureUsers[role].email,password:fixturePassword}})
    expect(login.statusCode).toBe(200)
    const headers={cookie:String(login.headers['set-cookie']).split(';')[0]}
    const response=await app.inject({method:'POST',url:`/api/radar/capture-operations/${start.operationId}/resume`,headers,payload:{organizationId,configurationRevision:1,requestId:randomUUID(),allowSemanticRefresh:true}})
    expect(response.statusCode).toBe(role==='yux_admin'?202:403)
    if(role!=='yux_admin')expect(response.body).not.toMatch(/approvedBy|analysis_refresh_authorizations|allowSemanticRefresh/)
   }
   const row=(await f.pool.query('SELECT analysis_refresh_authorizations FROM public.radar_capture_operations WHERE id=$1',[start.operationId])).rows[0]
   expect(row.analysis_refresh_authorizations).toHaveLength(1)
   expect(row.analysis_refresh_authorizations[0].approvedBy).toBe(admin.id)
   const state=await getRadarCaptureOperation(f.pool,admin,organizationId,start.operationId)
   expect(state.counts.admitted).toBe(1)
   expect(state).not.toHaveProperty('analysis_refresh_authorizations')
  }finally{await app.close();await pool.end();await f.close()}
 })
})
