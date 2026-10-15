// Opt-in local QA only. No production env, queue, research or messaging effects.
import pg from 'pg'
import {randomUUID} from 'node:crypto'
import {buildServer} from '../../src/server.js'
import {loadEnv} from '../../src/config/env.js'
import {createContextAwarePool} from '../../src/db/client.js'
import {fixtureIds,fixtureUsers,seedIntegrationFixtures} from '../integration/support/fixtures.js'
import {createRadarCampaign} from '../../src/modules/radar/repository.js'
import {projectRadarPublicPresence} from '../../src/modules/radar/public-presence.js'
import {evaluateRadarResearchQuality} from '../../src/modules/radar/research-quality.js'
import {resolveRadarSearchConfiguration} from '../../src/modules/radar/search-configuration.js'
import type {RadarResearchDossier} from '../../src/modules/radar/research-service.js'
import type {AuthUser} from '../../src/auth/routes.js'
const databaseUrl=process.env.YUX_RADAR_TEST_DATABASE_URL??''
const target=new URL(databaseUrl)
if(target.hostname!=='127.0.0.1'||target.port!=='55439'||target.pathname!=='/yux_radar_research_test')throw Error('isolated_radar_test_database_required')
const pool=new pg.Pool({connectionString:databaseUrl})
await seedIntegrationFixtures(pool)
const org=fixtureIds.organizationA
await pool.query(`INSERT INTO public.contract_modules(contract_id,module_key,enabled) VALUES($1,'radar',TRUE) ON CONFLICT(contract_id,module_key) DO UPDATE SET enabled=TRUE`,[fixtureIds.contractA])
const instance=(await pool.query(`INSERT INTO public.crm_instances(organization_id,contract_id,status) VALUES($1,$2,'active') ON CONFLICT(contract_id) DO UPDATE SET status='active' RETURNING id`,[org,fixtureIds.contractA])).rows[0].id
const pipeline=(await pool.query(`INSERT INTO public.crm_pipelines(organization_id,crm_instance_id,name,is_active) VALUES($1,$2,'QA — Contatos manuais',TRUE) ON CONFLICT(organization_id,name) DO UPDATE SET is_active=TRUE RETURNING id`,[org,instance])).rows[0].id
const stage=(await pool.query(`INSERT INTO public.crm_pipeline_stages(pipeline_id,key,name,order_index,is_active) VALUES($1,'radar','Conferência humana',0,TRUE) ON CONFLICT(pipeline_id,key) DO UPDATE SET is_active=TRUE RETURNING id`,[pipeline])).rows[0].id
const config=resolveRadarSearchConfiguration({research:{enabled:true,contactPurpose:'suppliers',completion:{enabled:true,requireIdentity:true,requireWebsite:false}},crmDestination:{crmInstanceId:instance,pipelineId:pipeline,stageId:stage}})
const campaign=await createRadarCampaign(pool,fixtureUsers.yux_admin as AuthUser,{organizationId:org,name:'QA — Qualidade do Radar',campaignType:'regional_b2b',targetStates:['PR','SP'],targetSegment:'Empresas B2B',offerType:'Produtos e serviços configuráveis',searchConfiguration:config})
const contact={kind:'email' as const,value:'compras@alfa.example',sourceUrl:'https://alfa.example/fornecedor/',observedAt:'2026-10-15',association:'confirmed' as const,scope:'establishment' as const,purpose:'suppliers' as const}
for(const external of [false,true]){
  const url=external?'https://municipio.example.gov.br/ata/123':'https://alfa.example/'
  const dossier:RadarResearchDossier={discovery:{websiteUrl:url,association:'confirmed',hits:[],suggestions:[],limitations:[],queries:1},pages:[{url,text:'Empresa Alfa CNPJ 12345678000190',observedAt:contact.observedAt}],contacts:external?[]:[contact,{...contact,sourceUrl:url}],siteAssociation:'confirmed',presenceResolution:{websiteUrl:url,scope:'establishment',reason:'Evidência sintética de teste',claims:[]},qualification:{targetStatus:'confirmed',productFit:'high',reasons:['Evidência sintética'],evidenceIds:[],limitations:[]},activity:{status:'inconclusive',signals:[],presenceSignals:[],limitation:'Sinais públicos não comprovam atendimento.'},limitations:[]}
  const presence=projectRadarPublicPresence({...dossier,configurationRevision:1})
  const quality=evaluateRadarResearchQuality({dossier,policy:config.research,currentRevision:true})
  const payload={cnpj:external?'98765432000190':'12345678000190',city:'Curitiba',state:'PR',researchRevision:1,websiteUrl:url,websiteStatus:'verified_present',publicPresence:presence,publicContacts:presence.contacts,targetStatus:'confirmed',productFit:'high',researchQuality:quality}
  const candidate=(await pool.query(`INSERT INTO public.radar_candidate_records(organization_id,campaign_id,source_type,title,dedupe_key,normalized_payload) VALUES($1,$2,'manual',$3,$4,$5::jsonb) RETURNING id`,[org,campaign.id,external?'Empresa Beta — referência externa':'Empresa Alfa — contatos úteis',randomUUID(),JSON.stringify(payload)])).rows[0].id
  await pool.query(`INSERT INTO public.radar_candidate_research_runs(organization_id,campaign_id,candidate_id,configuration_revision,requested_by,status,output,completed_at) VALUES($1,$2,$3,1,$4,'partial',$5::jsonb,NOW())`,[org,campaign.id,candidate,fixtureUsers.yux_admin.id,JSON.stringify({...dossier,quality})])
  if(!external)await pool.query(`INSERT INTO public.radar_b2b_reviews(candidate_id,organization_id,campaign_id,target_status,product_fit,configuration_revision,verification_method,approved_by,approved_at) VALUES($1,$2,$3,'confirmed','high',1,'manual',$4,NOW())`,[candidate,org,campaign.id,fixtureUsers.yux_admin.id])
}
const apiUrl=new URL(databaseUrl);apiUrl.username='yux_api'
const apiPool=createContextAwarePool(new pg.Pool({connectionString:apiUrl.toString()}),'api')
const env=loadEnv({NODE_ENV:'test',DATABASE_URL:databaseUrl,REDIS_URL:'redis://127.0.0.1:1',SESSION_SECRET:'local-radar-quality-fixture-session-secret',CORS_ORIGIN:'http://127.0.0.1:4174',GLOBAL_RATE_LIMIT_MAX:'5000'})
const app=await buildServer(env,{pool:apiPool,jobQueue:{add:async()=>{throw Error('qa_external_effects_disabled')},close:async()=>{}},redisPing:async()=>'PONG'})
app.addHook('onRequest',async(request,reply)=>{if(request.method!=='GET'&&/\/research$|enrich-brave|search-web|run-search|\/functions\//.test(request.url))return reply.code(403).send({error:'qa_paid_research_disabled'})})
await app.listen({host:'127.0.0.1',port:4182})
console.log(JSON.stringify({campaignId:campaign.id,url:`http://127.0.0.1:4174/client-workspaces/${org}/comercial/radar/${campaign.id}`}))
for(const signal of ['SIGINT','SIGTERM'] as const)process.on(signal,()=>{void app.close().then(()=>Promise.all([apiPool.end(),pool.end()])).then(()=>process.exit(0))})
