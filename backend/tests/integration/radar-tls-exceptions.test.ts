import pg from 'pg'
import {randomUUID} from 'node:crypto'
import {beforeAll,afterAll,describe,it,expect} from 'vitest'
import {seedIntegrationFixtures,fixtureIds,fixtureUsers} from './support/fixtures.js'
import {createContextAwarePool} from '../../src/db/client.js'
import {runWithDatabaseRequestContext} from '../../src/db/request-context.js'
import {authorizeRadarTlsException,revokeRadarTlsException,getRadarTlsReadOptions,radarTlsDiagnosticId} from '../../src/modules/radar/tls-exception-service.js'
import {executeRadarCandidateResearch,getRadarCandidateResearch} from '../../src/modules/radar/research-service.js'
const connectionString=process.env.YUX_RADAR_TEST_DATABASE_URL
if(connectionString){const u=new URL(connectionString);if(u.hostname!=='127.0.0.1'||u.pathname!=='/yux_radar_research_test')throw Error('isolated_radar_test_database_required')}
describe.skipIf(!connectionString)('scoped TLS grants with real PostgreSQL',()=>{
  const pool=new pg.Pool({connectionString}),url=new URL(connectionString||'postgresql://localhost/unused')
  url.username='yux_worker';const raw=new pg.Pool({connectionString:url.toString()}),worker=createContextAwarePool(raw,'worker')
  const org=fixtureIds.internalOrg,admin=fixtureUsers.yux_admin as never
  const scoped=<T>(fn:()=>Promise<T>)=>runWithDatabaseRequestContext({role:'yux_admin',organizationIds:[org],serviceRole:'worker'},fn)
  const fingerprint=Array(32).fill('AB').join(':')
  const page={url:'https://public.example/',text:'',observedAt:new Date().toISOString(),limitation:'robots_tls_expired',diagnostic:{stage:'robots',kind:'tls_expired',code:'CERT_HAS_EXPIRED'},certificate:{hostname:'public.example',fingerprint256:fingerprint,validTo:'2020-01-02T00:00:00Z'}}
  let campaign:string,candidate:string,run:string
  beforeAll(async()=>{
    await seedIntegrationFixtures(pool)
    await pool.query('UPDATE public.organizations SET is_internal_growth_workspace=TRUE WHERE id=$1',[org])
    campaign=(await pool.query(`INSERT INTO public.radar_campaigns(organization_id,name,target_segment,target_city,target_state,offer_type) VALUES($1,'TLS fixture','Serviços','Curitiba','PR','Oferta') RETURNING id`,[org])).rows[0].id
    candidate=(await pool.query(`INSERT INTO public.radar_candidate_records(organization_id,campaign_id,source_type,title,dedupe_key) VALUES($1,$2,'manual','Fixture',$3) RETURNING id`,[org,campaign,randomUUID()])).rows[0].id
    run=(await pool.query(`INSERT INTO public.radar_candidate_research_runs(organization_id,campaign_id,candidate_id,requested_by,configuration_revision,status,output) VALUES($1,$2,$3,$4,1,'partial',$5) RETURNING id`,[org,campaign,candidate,fixtureUsers.yux_admin.id,JSON.stringify({pages:[page]})])).rows[0].id
  })
  afterAll(async()=>{if(campaign)await pool.query('DELETE FROM public.radar_campaigns WHERE id=$1',[campaign]);await Promise.all([pool.end(),raw.end()])})
  const input=()=>({organizationId:org,candidateId:candidate,runId:run,configurationRevision:1,diagnosticId:radarTlsDiagnosticId(run,page),confirmed:true as const})
  const probe=async()=>page.certificate
  const resolve=async()=>['8.8.8.8']
  it('saves one-hour grants without changing research state or resetting calls; revalidates and revokes',async()=>{
    const grant=await scoped(()=>authorizeRadarTlsException(worker,admin,input(),{probe,resolve}))
    expect(Date.parse(grant.expiresAt)-Date.parse(grant.approvedAt)).toBe(3600000)
    expect(grant).toMatchObject({hostname:'public.example',fingerprint256:fingerprint,runId:run})
    expect((await pool.query('SELECT status,calls FROM public.radar_candidate_research_runs WHERE id=$1',[run])).rows[0]).toMatchObject({status:'partial',calls:{}})
    const context={organizationId:org,candidateId:candidate,runId:run,configurationRevision:1}
    const options=await scoped(()=>getRadarTlsReadOptions(worker,context,'public.example'))
    expect(options?.tlsException?.id).toBe(grant.id)
    await pool.query(`UPDATE public.radar_candidate_research_runs SET output='{}' WHERE id=$1`,[run])
    expect((await scoped(()=>getRadarTlsReadOptions(worker,context,'public.example')))?.tlsException?.id).toBe(grant.id)
    expect(await scoped(()=>getRadarTlsReadOptions(worker,{...context,runId:randomUUID()},'public.example'))).toBeUndefined()
    expect(await scoped(()=>getRadarTlsReadOptions(worker,context,'other.example'))).toBeUndefined()
    await scoped(()=>revokeRadarTlsException(worker,admin,{organizationId:org,candidateId:candidate,grantId:grant.id}))
    expect(await scoped(()=>options!.validateGrant!(grant))).toBe(false)
    const audit=(await pool.query('SELECT approved_by,revoked_at FROM public.radar_site_tls_exceptions WHERE id=$1',[grant.id])).rows[0]
    expect(audit.approved_by).toBe(fixtureUsers.yux_admin.id);expect(audit.revoked_at).toBeTruthy()
    await scoped(()=>revokeRadarTlsException(worker,admin,{organizationId:org,candidateId:candidate,grantId:grant.id}))
  })
  it('rejects mismatched scope/revision and changed certificate without writing a grant',async()=>{
    await pool.query('UPDATE public.radar_candidate_research_runs SET output=$2 WHERE id=$1',[run,JSON.stringify({pages:[page]})])
    for(const change of [{organizationId:randomUUID()},{candidateId:randomUUID()},{configurationRevision:2},{runId:randomUUID()},{diagnosticId:'0'.repeat(64)}])
      await expect(scoped(()=>authorizeRadarTlsException(worker,admin,{...input(),...change},{probe,resolve}))).rejects.toThrow()
    await expect(scoped(()=>authorizeRadarTlsException(worker,admin,input(),{resolve,probe:async()=>({...page.certificate,fingerprint256:'00'})}))).rejects.toThrow()
  })
  it('enforces tenant RLS and denies DELETE for service roles',async()=>{
    const rows=await runWithDatabaseRequestContext({role:'client_member',organizationIds:[fixtureIds.organizationA],serviceRole:'worker'},()=>worker.query('SELECT id FROM public.radar_site_tls_exceptions WHERE run_id=$1',[run]))
    expect(rows.rows).toEqual([])
    await expect(scoped(()=>worker.query('DELETE FROM public.radar_site_tls_exceptions WHERE run_id=$1',[run]))).rejects.toThrow(/permission denied/)
  })
  it('resumes the worker using the scoped grant, preserves sourced evidence and consumes no paid provider',async()=>{
    await pool.query('UPDATE public.radar_campaigns SET search_configuration=$2 WHERE id=$1',[campaign,JSON.stringify({sources:{enrichWithBrave:false,inspectWebsite:true},research:{enabled:true,presenceResolutionEnabled:false,semanticQualificationEnabled:false,profileEnabled:false}})])
    const saved={pages:[page],discoveryLocked:true,discovery:{association:'review',websiteUrl:page.url,suggestions:[],hits:[],limitations:[]}}
    await pool.query(`UPDATE public.radar_candidate_research_runs SET status='partial',output=$2,lease_id=NULL,lease_until=NULL WHERE id=$1`,[run,JSON.stringify(saved)])
    const grant=await scoped(()=>authorizeRadarTlsException(worker,admin,input(),{probe,resolve}))
    // Represent the separate, explicit resume action. A certificate grant alone
    // must not let a late duplicate job execute a terminal partial/blocked run.
    await pool.query("UPDATE public.radar_candidate_research_runs SET status='queued' WHERE id=$1",[run])
    const result=await scoped(()=>executeRadarCandidateResearch(worker,{} as never,{runId:run,organizationId:org},undefined,{
      web:async()=>{throw Error('paid search must never run')},runtime:async()=>{throw Error('paid model must never run')},
      collect:async(url,_policy,dependencies)=>{
        const options=await dependencies?.tlsOptions?.(new URL(url).hostname)
        expect(options?.tlsException?.id).toBe(grant.id)
        return [{url,observedAt:new Date().toISOString(),text:'Fixture empresa. Informações públicas para fornecedores e soluções empresariais.',tlsException:{grantId:grant.id,hostname:'public.example',fingerprint256:fingerprint,observedAt:new Date().toISOString()}}]
      },
    }))
    expect(result.status).toBe('partial')
    const dossier=await scoped(()=>getRadarCandidateResearch(worker,admin,org,candidate))
    expect(dossier.run?.output.pages?.[0].tlsException?.grantId).toBe(grant.id)
    expect(dossier.tlsExceptions[0].id).toBe(grant.id)
    const payload=(await pool.query('SELECT normalized_payload FROM public.radar_candidate_records WHERE id=$1',[candidate])).rows[0].normalized_payload
    expect(payload.researchTlsExceptions[0].grantId).toBe(grant.id)
    expect((await pool.query('SELECT calls FROM public.radar_candidate_research_runs WHERE id=$1',[run])).rows[0].calls).toEqual({})
  })
  it('refuses expired grants and inactive administrators at the next read',async()=>{
    const scope={organizationId:org,candidateId:candidate,runId:run,configurationRevision:1}
    const options=await scoped(()=>getRadarTlsReadOptions(worker,scope,'public.example'))
    expect(options?.tlsException).toBeTruthy()
    try {
      await pool.query('UPDATE public.app_users SET is_active=FALSE WHERE id=$1',[fixtureUsers.yux_admin.id])
      expect(await scoped(()=>options!.validateGrant!(options!.tlsException!))).toBe(false)
    }finally{await pool.query('UPDATE public.app_users SET is_active=TRUE WHERE id=$1',[fixtureUsers.yux_admin.id])}
    await pool.query(`UPDATE public.radar_site_tls_exceptions SET approved_at=NOW()-INTERVAL '2 hours',expires_at=NOW()-INTERVAL '1 hour' WHERE id=$1`,[options!.tlsException!.id])
    expect(await scoped(()=>getRadarTlsReadOptions(worker,scope,'public.example'))).toBeUndefined()
    await expect(scoped(()=>worker.query('UPDATE public.radar_site_tls_exceptions SET fingerprint256=$2 WHERE id=$1',[options!.tlsException!.id,fingerprint]))).rejects.toThrow(/permission denied/)
  })
  it.each(['http://public.example/','https://public.example/'])('authorizes only the actual failed HTTPS destination after redirect from %s',async original=>{
    const redirected={...page,url:'https://www.public.example/empresa',certificate:{...page.certificate,hostname:'www.public.example'}}
    await pool.query(`UPDATE public.radar_candidate_research_runs SET status='partial',output=$2 WHERE id=$1`,[run,JSON.stringify({pages:[redirected],discovery:{websiteUrl:original}})])
    const grant=await scoped(()=>authorizeRadarTlsException(worker,admin,{...input(),diagnosticId:radarTlsDiagnosticId(run,redirected)},{resolve,probe:async url=>{
      expect(url.toString()).toBe('https://www.public.example/empresa');return redirected.certificate
    }}))
    expect(grant.hostname).toBe('www.public.example')
    const scope={organizationId:org,candidateId:candidate,runId:run,configurationRevision:1}
    expect((await scoped(()=>getRadarTlsReadOptions(worker,scope,'www.public.example')))?.tlsException?.id).toBe(grant.id)
    expect(await scoped(()=>getRadarTlsReadOptions(worker,scope,'public.example'))).toBeUndefined()
  })
})
