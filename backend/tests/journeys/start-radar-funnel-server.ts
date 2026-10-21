// Rendered local QA. Every outbound job/provider action is disabled.
import pg from 'pg';
import {randomUUID} from 'node:crypto';
import {buildServer} from '../../src/server.js';
import {loadEnv} from '../../src/config/env.js';
import {createContextAwarePool} from '../../src/db/client.js';
import {fixtureIds,fixtureUsers,seedIntegrationFixtures} from '../integration/support/fixtures.js';
import {createRadarCampaign} from '../../src/modules/radar/repository.js';
import type {AuthUser} from '../../src/auth/routes.js';
const databaseUrl=process.env.YUX_RADAR_TEST_DATABASE_URL??'',target=new URL(databaseUrl);
if(target.hostname!=='127.0.0.1'||target.port!=='55439'||target.pathname!=='/yux_radar_research_test')throw Error('isolated_radar_test_database_required');
const pool=new pg.Pool({connectionString:databaseUrl});await seedIntegrationFixtures(pool);
const organizationId=fixtureIds.organizationA;
await pool.query(`INSERT INTO contract_modules(contract_id,module_key,enabled) VALUES($1,'radar',TRUE) ON CONFLICT(contract_id,module_key) DO UPDATE SET enabled=TRUE`,[fixtureIds.contractA]);
const priorPermission=(await pool.query(`SELECT 1 FROM role_permissions WHERE role_key='client_admin' AND permission_key='radar:manage'`)).rowCount;
await pool.query(`INSERT INTO role_permissions(role_key,permission_key) VALUES('client_admin','radar:manage') ON CONFLICT DO NOTHING`);
const campaign=await createRadarCampaign(pool,fixtureUsers.yux_admin as AuthUser,{organizationId,name:'QA — Funil por etapas',campaignType:'regional_b2b',targetSegment:'Empresas de serviços',targetStates:['PR'],offerType:'Produtos empresariais',searchConfiguration:{funnel:{enabled:true,g0:{mode:'enforce'},g1:{mode:'off'},g5:{mode:'off'}},research:{enabled:true,webSearchEnabled:true},excludedNameTerms:['fora'],sources:{enrichWithBrave:false}}} as any);
for(const outside of [false,true]){
 const payload={tradeName:outside?'Empresa Fora':'Empresa Alfa',cnpj:outside?'98765432000190':'12345678000190',city:'Curitiba',state:'PR',...(outside?{targetStatus:'not_target',decisionExclusion:{active:true,gate:'g0',revision:1},triageReasons:['Nome corresponde à exclusão configurada: fora.'],funnel:{registry:{outcome:'block'}}}:{websiteUrl:'https://alfa.example/',publicContacts:[{kind:'email',value:'compras@alfa.example',sourceUrl:'https://alfa.example/',observedAt:new Date().toISOString(),association:'confirmed',scope:'establishment'}]})};
 await pool.query(`INSERT INTO radar_candidate_records(organization_id,campaign_id,source_type,title,dedupe_key,normalized_payload) VALUES($1,$2,'manual',$3,$4,$5)`,[organizationId,campaign.id,payload.tradeName,randomUUID(),JSON.stringify(payload)]);
}
const apiUrl=new URL(databaseUrl);apiUrl.username='yux_api';const apiPool=createContextAwarePool(new pg.Pool({connectionString:apiUrl.toString()}),'api');
const app=await buildServer(loadEnv({NODE_ENV:'test',DATABASE_URL:databaseUrl,REDIS_URL:'redis://127.0.0.1:1',SESSION_SECRET:'local-funnel-browser-only-secret-12345',CORS_ORIGIN:'http://127.0.0.1:4174',GLOBAL_RATE_LIMIT_MAX:'5000'}),{pool:apiPool,jobQueue:{add:async()=>{throw Error('qa_external_effects_disabled')},close:async()=>{}},redisPing:async()=>'PONG'});
app.addHook('onRequest',async(request,reply)=>{if(request.method!=='GET'&&/\/research$|enrich-brave|search-web|run-search|\/functions\/|\/evaluate$|\/test$|\/reopen$/.test(request.url))return reply.code(403).send({error:'qa_external_effects_disabled'})});
app.post('/__fixture__/shutdown',async(request,reply)=>{if(request.headers['x-fixture-control']!=='loopback-funnel-only')return reply.code(403).send({error:'forbidden'});setTimeout(()=>void cleanup(),100);return{ok:true}});
await app.listen({host:'127.0.0.1',port:4182});console.log(JSON.stringify({campaignId:campaign.id,organizationId}));
async function cleanup(){await app.close();await apiPool.end();await pool.query('DELETE FROM radar_campaigns WHERE id=$1',[campaign.id]);if(!priorPermission)await pool.query(`DELETE FROM role_permissions WHERE role_key='client_admin' AND permission_key='radar:manage'`);await pool.end();process.exit(0)}
for(const signal of ['SIGINT','SIGTERM'] as const)process.on(signal,()=>void cleanup());
