// Local-only UI fixture: actual API/RLS/SQL + HTTP runtime; provider is synthetic.
import pg from 'pg'
import {spawn} from 'node:child_process'
import {resolve} from 'node:path'
import {buildServer} from '../../src/server.js'
import {loadEnv} from '../../src/config/env.js'
import {createContextAwarePool} from '../../src/db/client.js'
import {captureFixture,organizationId,admin,connectionString} from '../support/radar-capture-fixture.js'
import {upsertAdminLlmRoute} from '../../src/modules/platform/adminRepository.js'
import {getRadarOperationalLimits,updateRadarOperationalLimits} from '../../src/modules/radar/operational-limits.js'
if(!connectionString)throw Error('isolated_radar_test_database_required')
const f=await captureFixture(),policy=await getRadarOperationalLimits(f.pool,admin)
await updateRadarOperationalLimits(f.pool,admin,{expectedVersion:policy.version,limits:policy.limits,costPolicy:{usdToBrl:'5',rateAsOf:'2026-10-19T12:00:00Z',rateSource:'manual',marginPercent:'0'}})
const route=await upsertAdminLlmRoute(f.pool,{agentType:'radar_decision_default',provider:'openrouter',kind:'decision',modelName:'fixture/jev',fallbackRoutes:[{provider:'openrouter',modelName:'fixture/reserve'}],decisionConfig:{enabled:false,mode:'observe',maxAttempts:2,modelPolicies:{'fixture/jev':{estimatedUsdPerAttempt:.001},'fixture/reserve':{estimatedUsdPerAttempt:.001}}}})
const runtimeDirectory=resolve('../workers/marketing-studio-agent-runtime'),libs=resolve('../.superpowers/sdd/2026-10-19-radar-recuperacao-e-experiencia/python-libs')
const runtime=spawn('python',['tests/support/decision_runtime_server.py'],{cwd:runtimeDirectory,windowsHide:true,env:{...process.env,PYTHONPATH:`${runtimeDirectory};${libs}`,DATABASE_URL:connectionString.replace('radar_test@','yux_runtime@'),YUX_AGENT_RUNTIME_TOKEN:'fixture-browser-decision-token',RADAR_DECISION_TEST_PORT:'4183'},stdio:'inherit'})
const apiUrl=new URL(connectionString);apiUrl.username='yux_api'
const apiPool=createContextAwarePool(new pg.Pool({connectionString:apiUrl.toString()}),'api')
const env=loadEnv({NODE_ENV:'test',DATABASE_URL:connectionString,REDIS_URL:'redis://127.0.0.1:1',SESSION_SECRET:'local-radar-decisions-fixture-session-secret',CORS_ORIGIN:'http://127.0.0.1:4174',GLOBAL_RATE_LIMIT_MAX:'5000',YUX_AGENT_RUNTIME_URL:'http://127.0.0.1:4183',YUX_AGENT_RUNTIME_TOKEN:'fixture-browser-decision-token'})
const app=await buildServer(env,{pool:apiPool,jobQueue:{add:async()=>{throw Error('qa_external_effects_disabled')},close:async()=>{}},redisPing:async()=>'PONG'})
app.addHook('onError',(_request,_reply,error,done)=>{console.error('Synthetic fixture:',error.message);done()})
app.post('/__fixture__/shutdown',async(request,reply)=>{if(request.headers['x-fixture-control']!=='loopback-decisions-only')return reply.code(403).send({error:'forbidden'});setTimeout(()=>{void cleanup()},100);return{ok:true}})
app.addHook('onRequest',async(request,reply)=>{if(request.method!=='GET'&&/\/research$|enrich-brave|search-web|run-search|\/functions\//.test(request.url))return reply.code(403).send({error:'qa_paid_research_disabled'})})
await app.listen({host:'127.0.0.1',port:4182})
console.log(JSON.stringify({campaignId:f.campaign.id,routeId:route.id,organizationId,url:'http://127.0.0.1:4174/admin/ai',runtimePid:runtime.pid}))
async function cleanup(){
 runtime.kill();await app.close();await apiPool.end()
 const current=await getRadarOperationalLimits(f.pool,admin);await updateRadarOperationalLimits(f.pool,admin,{expectedVersion:current.version,limits:policy.limits,costPolicy:policy.costPolicy})
 await f.pool.query('DELETE FROM radar_decision_calibrations WHERE route_id=$1',[route.id]);await f.pool.query('DELETE FROM model_routing_rules WHERE id=$1',[route.id]);await f.pool.query("DELETE FROM radar_analysis_receipts WHERE request_id LIKE 'admin-decision:%' AND organization_id=$1",[organizationId]);await f.close();process.exit(0)
}
for(const signal of ['SIGINT','SIGTERM'] as const)process.on(signal,()=>{void cleanup()})
