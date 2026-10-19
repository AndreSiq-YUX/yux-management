import type pg from 'pg'
import {z} from 'zod'
import type {AuthUser} from '../../auth/routes.js'
import {requireRadarScope} from './access.js'
import {assertRadarRegionalBatchAccess} from './repository.js'
import {getRadarResearchAvailability} from './research-availability.js'
import type {RadarCaptureOperation} from './types.js'
import {buildCnpjaCandidateSnippet,type CnpjaCandidate} from './cnpjaClient.js'
import {loadRadarCapturePreflight,isRadarCaptureLimitPause} from './capture-preflight.js'
import {authorizeRadarContinuations,type ContinuationAuthorization} from './continuation-state.js'

export const captureError=(code:string,statusCode=409)=>Object.assign(new Error(code),{statusCode})
export const parseRadarCaptureCount=(value:unknown)=>z.number().int().positive().max(2_147_483_647).parse(value)
export type CaptureAvailability={allowed:boolean;reasons:Array<{code:string;message:string;resolution:string}>;presence?:{routeConfigured:boolean};semantic?:{routeConfigured:boolean};maxQueriesPerCandidate?:number;maximumCostPerCandidate?:number;estimates?:Array<{sourceType:string;costPerQuery:number;maximumQueries?:number;available?:boolean;remainingQueries?:number}>}
export type AvailabilityLoader=(pool:pg.Pool,user:AuthUser,organizationId:string,campaignId:string)=>Promise<CaptureAvailability>
export async function assertCaptureAvailability(pool:pg.Pool,user:AuthUser,organizationId:string,campaignId:string,availability:AvailabilityLoader=getRadarResearchAvailability){
 const result=await availability(pool,user,organizationId,campaignId)
 if(!result.allowed)throw Object.assign(captureError('radar_capture_research_unavailable'),{reasons:result.reasons})
 if(result.presence?.routeConfigured===false||result.semantic?.routeConfigured===false)throw captureError('radar_capture_model_route_missing')
}
export async function startRadarCaptureOperation(pool:pg.Pool,user:AuthUser,input:{organizationId:string;campaignId:string;configurationRevision:number;requestId:string;requestedCount:number;continuationAuthorizations?:ContinuationAuthorization[]},dependencies:{availability?:AvailabilityLoader}={}){
 const count=parseRadarCaptureCount(input.requestedCount);z.uuid().parse(input.requestId)
 await assertRadarRegionalBatchAccess(pool,user,input.organizationId,input.campaignId)
 const client=await pool.connect()
 try{
  await client.query('BEGIN')
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`radar-capture-request:${input.organizationId}:${input.requestId}`])
  const campaign=(await client.query('SELECT * FROM public.radar_campaigns WHERE id=$1 AND organization_id=$2 FOR UPDATE',[input.campaignId,input.organizationId])).rows[0]
  const duplicate=(await client.query(`SELECT request.*,operation.status FROM public.radar_capture_requests request JOIN public.radar_capture_operations operation ON operation.id=request.operation_id AND operation.organization_id=request.organization_id WHERE request.organization_id=$1 AND request.request_id=$2`,[input.organizationId,input.requestId])).rows[0]
  if(duplicate){
   if(duplicate.campaign_id!==input.campaignId||duplicate.configuration_revision!==input.configurationRevision||duplicate.requested_count!==count)throw captureError('radar_capture_request_conflict')
   await client.query('COMMIT');return{operationId:duplicate.operation_id,reused:true,status:duplicate.status}
  }
  if(campaign?.configuration_revision!==input.configurationRevision)throw captureError('radar_campaign_configuration_changed')
  const revision=campaign.configuration_revision
  const saveRequest=async(operationId:string)=>client.query(`INSERT INTO public.radar_capture_requests(organization_id,request_id,operation_id,campaign_id,configuration_revision,requested_count) VALUES($1,$2,$3,$4,$5,$6)`,[input.organizationId,input.requestId,operationId,input.campaignId,revision,count])
  const active=(await client.query(`SELECT id,status,requested_count FROM public.radar_capture_operations WHERE organization_id=$1 AND campaign_id=$2 AND configuration_revision=$3 AND status IN ('queued','discovering','researching','blocked')`,[input.organizationId,input.campaignId,revision])).rows[0]
  if(active){if(active.requested_count!==count)throw captureError('radar_capture_request_conflict');await saveRequest(active.id);await client.query('COMMIT');return{operationId:active.id,reused:true,status:active.status}}
  await assertCaptureAvailability(client as unknown as pg.Pool,user,input.organizationId,input.campaignId,dependencies.availability)
  await client.query('SELECT version FROM public.radar_operational_limits WHERE singleton=TRUE FOR SHARE')
  const {preflight,policy,scopes}=await loadRadarCapturePreflight(client,user,input,dependencies)
  if(!preflight.allowed)throw captureError(preflight.blockers[0]?.code??'radar_capture_research_unavailable')
  await authorizeRadarContinuations(client,scopes.filter(scope=>preflight.continuations.some(s=>s.scopeKey===scope.key)).map(scope=>({...scope,organizationId:input.organizationId,campaignId:input.campaignId,configurationRevision:revision})),policy,{authorizations:input.continuationAuthorizations,requestId:input.requestId,approvedBy:user.id})
  const row=(await client.query(`INSERT INTO public.radar_capture_operations(organization_id,campaign_id,requested_by,request_id,configuration_revision,requested_count,configuration_snapshot)
   VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id,status`,[input.organizationId,input.campaignId,user.id,input.requestId,revision,count,JSON.stringify({...campaign,operationalPolicy:policy})])).rows[0]
  await client.query('INSERT INTO public.radar_capture_outbox(operation_id,organization_id,campaign_id) VALUES($1,$2,$3)',[row.id,input.organizationId,input.campaignId])
  await saveRequest(row.id)
  await client.query('COMMIT');return{operationId:row.id,reused:false,status:row.status}
 }catch(cause){await client.query('ROLLBACK');throw cause}finally{client.release()}
}
export async function getRadarCaptureOperation(pool:pg.Pool,user:AuthUser,organizationId:string,operationId:string):Promise<RadarCaptureOperation>{
 await requireRadarScope(pool,user,{organizationId})
 const row=(await pool.query('SELECT * FROM public.radar_capture_operations WHERE id=$1 AND organization_id=$2',[operationId,organizationId])).rows[0]
 if(!row)throw captureError('radar_capture_not_found',404)
 await requireRadarScope(pool,user,{organizationId,campaignId:row.campaign_id})
 const items=(await pool.query(`SELECT id,candidate_id AS "candidateId",run_id AS "runId",status,blocker FROM public.radar_capture_items WHERE operation_id=$1 AND organization_id=$2 ORDER BY created_at,id`,[operationId,organizationId])).rows
 const n=(status:string)=>items.filter(item=>item.status===status).length
 return{id:row.id,campaignId:row.campaign_id,configurationRevision:row.configuration_revision,status:row.status,discoveryStopped:row.discovery_stopped,discoveryReason:row.discovery_reason,queries:row.queries,blockers:row.blockers,items,...(user.role==='yux_admin'?{canContinue:isRadarCaptureLimitPause(row,items.length)||row.status==='partial'&&row.discovery_stopped&&items.some(item=>item.status==='insufficient'&&item.runId)}:{}),
  counts:{requested:row.requested_count,admitted:items.length,researching:n('queued')+n('researching'),completed:n('completed'),insufficient:n('insufficient'),blocked:n('blocked')}}
}
export async function getLatestRadarCaptureOperation(pool:pg.Pool,user:AuthUser,organizationId:string,campaignId:string){
 await requireRadarScope(pool,user,{organizationId,campaignId})
 const row=(await pool.query('SELECT id FROM public.radar_capture_operations WHERE organization_id=$1 AND campaign_id=$2 ORDER BY created_at DESC,id DESC LIMIT 1',[organizationId,campaignId])).rows[0]
 return row?getRadarCaptureOperation(pool,user,organizationId,row.id):null
}

// Caller holds the campaign row lock. Used by fresh pages and preserved overflow.
export async function admitRadarCapturePage(client:pg.PoolClient,input:{organizationId:string;campaignId:string;operationId:string;revision:number;scopeKey:string;runId:string},results:CnpjaCandidate[],persistOverflow=true){
 const op=(await client.query('SELECT * FROM public.radar_capture_operations WHERE id=$1 AND organization_id=$2 AND campaign_id=$3 FOR UPDATE',[input.operationId,input.organizationId,input.campaignId])).rows[0]
 if(!op||op.configuration_revision!==input.revision)throw captureError('radar_campaign_configuration_changed')
 let remaining=op.requested_count-Number((await client.query('SELECT COUNT(*) AS n FROM public.radar_capture_items WHERE operation_id=$1',[op.id])).rows[0].n)
 const ids:string[]=[]
 for(const result of results){
  const title=result.tradeName||result.legalName||result.taxId||'Empresa CNPJá'
  const dedupeKey=result.taxId?`cnpj:${result.taxId}`:`cnpja:${title.toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'')}:${(result.city||'').toLowerCase()}:${(result.state||'').toLowerCase()}`
  const existing=await client.query(`SELECT id FROM public.radar_candidate_records WHERE campaign_id=$1 AND dedupe_key=$2
   UNION ALL SELECT id FROM public.radar_company_records WHERE organization_id=$3 AND (($4::text IS NOT NULL AND cnpj=$4) OR ($5::text IS NOT NULL AND email_raw=$5) OR ($6::text IS NOT NULL AND phone_raw=$6))
   UNION ALL SELECT id FROM public.leads WHERE organization_id=$3 AND $4::text IS NOT NULL AND attribution_context->>'radarCnpj'=$4 LIMIT 1`,[input.campaignId,dedupeKey,input.organizationId,result.taxId??null,result.email??null,result.phone??null])
  if(existing.rows.length)continue
  if(remaining<=0){
   if(persistOverflow)await client.query('INSERT INTO public.radar_capture_overflow(organization_id,campaign_id,configuration_revision,scope_key,enrichment_run_id,candidate) VALUES($1,$2,$3,$4,$5,$6)',[input.organizationId,input.campaignId,input.revision,input.scopeKey,input.runId,JSON.stringify(result)])
   continue
  }
  const normalized={tradeName:result.tradeName,legalName:result.legalName,cnpj:result.taxId,cnaeMain:result.cnaeMain,cnaes:result.cnaes,registrationStatus:result.registrationStatus,openingDate:result.openingDate,capital:result.capital,legalNature:result.legalNature,registeredSize:result.registeredSize,registryUpdatedAt:result.registryUpdatedAt,address:result.address,websiteStatus:result.websiteStatus,city:result.city,state:result.state,emailRaw:result.email,phoneRaw:result.phone,discoveryRevision:input.revision}
  const inserted=await client.query(`INSERT INTO public.radar_candidate_records(organization_id,campaign_id,enrichment_run_id,source_type,source_url,title,snippet,raw_payload,normalized_payload,dedupe_key)
   VALUES($1,$2,$3,'cnpja_advanced_search',$4,$5,$6,$7,$8,$9) ON CONFLICT(campaign_id,dedupe_key) DO NOTHING RETURNING id`,[input.organizationId,input.campaignId,input.runId,result.sourceUrl??null,title,buildCnpjaCandidateSnippet(result),JSON.stringify(result.rawPayload),JSON.stringify(normalized),dedupeKey])
  if(!inserted.rows[0])continue
  await client.query('INSERT INTO public.radar_capture_items(organization_id,campaign_id,operation_id,candidate_id) VALUES($1,$2,$3,$4)',[input.organizationId,input.campaignId,op.id,inserted.rows[0].id])
  ids.push(inserted.rows[0].id);remaining--
 }
 if(remaining<=0)await client.query("UPDATE public.radar_capture_operations SET discovery_stopped=TRUE,discovery_reason='target_reached' WHERE id=$1",[op.id])
 return ids
}
