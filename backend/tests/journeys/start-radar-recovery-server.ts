// Local, opt-in presentation QA. No provider, runtime or real queue is invoked.
import pg from 'pg'
import {randomUUID} from 'node:crypto'
import {captureFixture,organizationId,admin} from '../support/radar-capture-fixture.js'
import {createContextAwarePool} from '../../src/db/client.js'
import {buildServer} from '../../src/server.js'
import {loadEnv} from '../../src/config/env.js'
const f=await captureFixture()
await f.pool.query(`UPDATE public.radar_campaigns SET search_configuration=jsonb_set(search_configuration,'{research,presenceResolutionEnabled}','true') WHERE id=$1`,[f.campaign.id])
await f.pool.query(`INSERT INTO public.model_routing_rules(agent_type,organization_id,provider,model_name,max_output_tokens) VALUES('radar_presence_resolution',$1,'openrouter','fixture-only',4000)`,[organizationId])
for(let i=0;i<2;i++){
 const candidate=(await f.pool.query(`INSERT INTO public.radar_candidate_records(organization_id,campaign_id,source_type,title,dedupe_key,normalized_payload) VALUES($1,$2,'manual',$3,$4,'{}') RETURNING id`,[organizationId,f.campaign.id,i?'Empresa Beta':'Empresa Alfa',randomUUID()])).rows[0]
 const run=(await f.pool.query(`INSERT INTO public.radar_candidate_research_runs(organization_id,campaign_id,candidate_id,requested_by,configuration_revision,status) VALUES($1,$2,$3,$4,1,'blocked') RETURNING id`,[organizationId,f.campaign.id,candidate.id,admin.id])).rows[0]
 const key=i?'semantic':'presence',action=i?'radar_business_qualification':'radar_presence_resolution',digest='a'.repeat(64)
 await f.pool.query('UPDATE public.radar_candidate_research_runs SET calls=$2 WHERE id=$1',[run.id,JSON.stringify({[key]:{status:'uncertain',source:action,evidenceHash:digest}})])
 await f.pool.query(`INSERT INTO public.radar_analysis_receipts(organization_id,action,request_id,input_hash,owner_token,status,input_request) VALUES($1,$2,$3,$4,$5,'uncertain','{}')`,[organizationId,action,`${run.id}${i?'':':presence'}:${digest}`,digest,randomUUID()])
}
const url=new URL(process.env.YUX_RADAR_TEST_DATABASE_URL!);url.username='yux_api'
const pool=createContextAwarePool(new pg.Pool({connectionString:url.toString()}),'api')
const env=loadEnv({NODE_ENV:'test',DATABASE_URL:process.env.YUX_RADAR_TEST_DATABASE_URL!,REDIS_URL:'redis://127.0.0.1:1',SESSION_SECRET:'local-radar-recovery-qa-only-secret',CORS_ORIGIN:'http://127.0.0.1:4174',GLOBAL_RATE_LIMIT_MAX:'5000'})
const app=await buildServer(env,{pool,jobQueue:{add:async()=>({id:'local-observation-only'}),close:async()=>{}},redisPing:async()=>'PONG'})
await app.listen({host:'127.0.0.1',port:4182})
console.log(JSON.stringify({campaignId:f.campaign.id,organizationId,url:`http://127.0.0.1:4174/admin/integrations?radarOrganization=${organizationId}&radarCampaign=${f.campaign.id}#radar-operations`}))
for(const signal of ['SIGINT','SIGTERM'] as const)process.on(signal,()=>{void app.close().then(()=>pool.end()).then(()=>f.pool.end()).then(()=>process.exit(0))})
