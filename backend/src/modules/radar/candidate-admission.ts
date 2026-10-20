import type pg from 'pg'
import type {AuthUser} from '../../auth/routes.js'
import {createHash,randomUUID} from 'node:crypto'
import {z} from 'zod'
import {getDatabaseRequestContext} from '../../db/request-context.js'
import type {BusinessMentionV1} from '../../contracts/generated/radarResearch.js'
import {validateRadarResearchContract} from './effect-receipts.js'
import {projectRadarCompanyFacts} from './company-projection.js'
import {resolveRadarBusinessEntity,radarEntityDomain,radarEntityNameKey,normalizeValidRadarCnpj,type RadarSavedBusinessIdentity,type RadarBusinessVerification,type RadarRegistryPolicy,type RadarExternalIdentity,type RadarEntityResolution} from './entity-resolution.js'

type Admission=RadarEntityResolution & {observationId:string;admission:'linked'|'provisional'|'ambiguous'|'outside_profile'|'unlinked';reused:boolean}
type Input={organizationId:string;campaignId:string;revision:number;observationKey:string;mention:BusinessMentionV1;verification?:RadarBusinessVerification;externalKey?:RadarExternalIdentity;registryPolicy:RadarRegistryPolicy;canPersist:boolean}
const location=z.object({city:z.string().max(200).optional(),state:z.string().max(80).optional(),address:z.string().max(500).optional()}).strict()
const scope=z.enum(['company','group','establishment'])
const verified=z.object({taxId:z.object({value:z.string().max(24),subjectName:z.string().min(2).max(240),subjectScope:scope,sourceRole:z.enum(['registry','institutional']),evidenceId:z.string().min(1).max(80),location:location.optional()}).strict().optional(),website:z.object({url:z.string().max(2000),association:z.literal('confirmed'),scope,evidenceId:z.string().min(1).max(80)}).strict().optional()}).strict()
const inputSchema=z.object({organizationId:z.uuid(),campaignId:z.uuid(),revision:z.number().int().positive(),observationKey:z.string().min(1).max(240),mention:z.unknown(),verification:verified.optional(),externalKey:z.object({namespace:z.string().min(1).max(80),value:z.string().min(1).max(300)}).strict().optional(),
 registryPolicy:z.object({triage:z.enum(['compatible','investigate','outside_profile','unknown']),requiredFields:z.array(z.string().max(80)).max(50),missingFields:z.array(z.string().max(80)).max(50),sourceAllowed:z.boolean(),budgetApproved:z.boolean()}).strict(),canPersist:z.boolean()}).strict()
const object=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{}
const text=(value:unknown)=>typeof value==='string'&&value?value:undefined
function canonical(value:unknown):unknown{
 if(Array.isArray(value))return value.map(canonical)
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([key,item])=>key!=='observedAt'&&item!==undefined).sort(([left],[right])=>left.localeCompare(right)).map(([key,item])=>[key,canonical(item)]))
 return value
}
function inputHash(input:Input){const {canPersist:_approved,registryPolicy, ...rest}=input
 return createHash('sha256').update(JSON.stringify(canonical({...rest,triage:registryPolicy.triage}))).digest('hex')}
function result(row:{id:string;candidate_id:string|null;resolution:RadarEntityResolution;state:Admission['admission']},reused:boolean):Admission{
 const {candidateId:_candidate,...resolution}=row.resolution
 return {...resolution,...(row.candidate_id?{candidateId:row.candidate_id}:{}),newCandidateCount:reused||row.state==='outside_profile'||row.state==='unlinked'?0:resolution.newCandidateCount,observationId:row.id,admission:row.state,reused}
}
async function savedBusinesses(db:pg.PoolClient,organizationId:string,campaignId:string):Promise<RadarSavedBusinessIdentity[]>{
 const candidates=(await db.query('SELECT id,organization_id,title,source_type,normalized_payload FROM public.radar_candidate_records WHERE organization_id=$1 AND campaign_id=$2',[organizationId,campaignId])).rows
 const keys=(await db.query('SELECT candidate_id,key_kind,identity_key FROM public.radar_business_identity_keys WHERE organization_id=$1 AND campaign_id=$2 AND active',[organizationId,campaignId])).rows
 return candidates.map(candidate=>{
  const payload=projectRadarCompanyFacts(object(candidate.normalized_payload),candidate.title),presence=object(payload.publicPresence),website=object(presence.website)
  const taxId=normalizeValidRadarCnpj(payload.cnpj),identityScope=['company','group','establishment'].includes(String(payload.identityScope))?payload.identityScope as RadarSavedBusinessIdentity['scope']:'establishment'
  const owned=keys.filter(key=>key.candidate_id===candidate.id)
  const externalKeys:RadarExternalIdentity[]=owned.filter(key=>key.key_kind==='external_id').map(key=>JSON.parse(key.identity_key))
  const domainKey=owned.find(key=>key.key_kind==='domain_location')
  const provenDomain=domainKey?z.tuple([z.string(),z.string(),z.string(),z.string(),z.string()]).parse(JSON.parse(domainKey.identity_key))[0]:undefined
  return{candidateId:candidate.id,organizationId:candidate.organization_id,names:[candidate.title,text(payload.tradeName),text(payload.legalName)].filter((name):name is string=>!!name),taxId,
   taxIdVerified:!!taxId&&(candidate.source_type==='cnpja_advanced_search'||candidate.source_type==='cnpja_office_lookup'||payload.taxIdVerified===true&&owned.some(key=>key.key_kind==='tax_id'&&key.identity_key===taxId)),scope:identityScope,
   location:{city:text(payload.city),state:text(payload.state),address:text(payload.address)},externalKeys,
   ...(provenDomain?{officialDomain:provenDomain,domainScope:identityScope}:website.association==='confirmed'&&['company','establishment'].includes(String(website.scope))?{officialDomain:radarEntityDomain(text(website.url)),domainScope:website.scope as 'company'|'establishment'}:{})}
 })
}
/** Internal transactional admission only. The planner owns authorizations/transports. */
export async function admitRadarBusinessMention(pool:pg.Pool,input:Input,dependencies:{transaction?:pg.PoolClient}={}):Promise<Admission>{
 if(input.canPersist!==true)throw Error('radar_business_persistence_not_authorized')
 const context=getDatabaseRequestContext()
 if(context?.serviceRole==='worker'&&!context.organizationIds.includes(input.organizationId))throw Error('radar_campaign_not_found')
 if(context&&context.serviceRole!=='worker'&&context.role!=='yux_admin')throw Object.assign(Error('radar_admin_required'),{statusCode:403})
 inputSchema.parse(input)
 if(!validateRadarResearchContract(input.mention)||!('needsVerification' in input.mention)||Buffer.byteLength(JSON.stringify(input))>64000)throw Error('radar_business_mention_invalid')
 const db=dependencies.transaction??await pool.connect()
 try{
  if(!dependencies.transaction)await db.query('BEGIN')
  // Same lock order as capture admission. Never advance a cursor in this helper.
  const campaign=(await db.query(`SELECT configuration_revision FROM public.radar_campaigns WHERE id=$1 AND organization_id=$2
   AND(current_user<>'yux_worker' OR organization_id=ANY(COALESCE(NULLIF(current_setting('app.current_orgs',true),''),'{}')::uuid[])) FOR UPDATE`,[input.campaignId,input.organizationId])).rows[0]
  if(!campaign)throw Error('radar_campaign_not_found')
  if(campaign.configuration_revision!==input.revision)throw Error('radar_campaign_configuration_changed')
  const hash=inputHash(input),previous=(await db.query('SELECT id,candidate_id,resolution,state,input_hash FROM public.radar_business_observations WHERE organization_id=$1 AND campaign_id=$2 AND observation_key=$3',[input.organizationId,input.campaignId,input.observationKey])).rows[0]
  if(previous){if(previous.input_hash!==hash)throw Error('radar_business_observation_conflict');if(!dependencies.transaction)await db.query('COMMIT');return result(previous,true)}
  const resolution=resolveRadarBusinessEntity({...input,existingCandidates:await savedBusinesses(db,input.organizationId,input.campaignId)})
  const outside=input.registryPolicy.triage==='outside_profile'
  const observationId=randomUUID()
  let candidateId=outside?undefined:resolution.candidateId
  if(!outside&&resolution.status==='new_provisional'){
   const payload={tradeName:input.mention.name,...input.mention.location,...(resolution.taxId?{cnpj:resolution.taxId,taxIdVerified:true}:{}),identityScope:resolution.scope,websiteStatus:'unknown',discoveryRevision:input.revision}
   const row=(await db.query(`INSERT INTO public.radar_candidate_records(organization_id,campaign_id,source_type,source_url,title,normalized_payload,dedupe_key) VALUES($1,$2,'web_search',$3,$4,$5,$6) RETURNING id`,[input.organizationId,input.campaignId,input.mention.sourceUrl,input.mention.name,JSON.stringify(payload),`entity:${observationId}`])).rows[0]
   candidateId=row.id
  }
  const state=outside?'outside_profile':resolution.status==='matched'?'linked':resolution.status==='new_provisional'?'provisional':'ambiguous'
  const saved={...resolution,...(candidateId?{candidateId}:{}),newCandidateCount:outside?0:resolution.newCandidateCount}
  const row=(await db.query(`INSERT INTO public.radar_business_observations(id,organization_id,campaign_id,observation_key,input_hash,criteria_revision,mention,resolution,candidate_id,state,verification,external_identity) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id,candidate_id,resolution,state`,[observationId,input.organizationId,input.campaignId,input.observationKey,hash,input.revision,JSON.stringify(input.mention),JSON.stringify(saved),candidateId??null,state,JSON.stringify(input.verification??{}),input.externalKey?JSON.stringify(input.externalKey):null])).rows[0]
  if(candidateId){
   const keys:Array<[string,string]>=[]
   if(resolution.taxId&&resolution.scope!=='group')keys.push(['tax_id',resolution.taxId])
   if(input.externalKey)keys.push(['external_id',JSON.stringify({namespace:input.externalKey.namespace,value:input.externalKey.value})])
   // The verified domain is corroboration, never a unique group identity alone.
   const domain=radarEntityDomain(input.verification?.website?.url),loc=input.mention.location
   if(domain&&input.verification?.website?.scope===resolution.scope&&resolution.scope!=='group'&&loc?.city&&loc.state)keys.push(['domain_location',JSON.stringify([domain,radarEntityNameKey(input.mention.name),loc.city.toLocaleLowerCase('pt-BR'),loc.state.toUpperCase(),loc.address??''])])
   for(const [kind,key] of keys){
    const owned=(await db.query('SELECT candidate_id FROM public.radar_business_identity_keys WHERE organization_id=$1 AND campaign_id=$2 AND key_kind=$3 AND identity_key=$4 AND active',[input.organizationId,input.campaignId,kind,key])).rows[0]
    if(owned&&owned.candidate_id!==candidateId)throw Error('radar_business_identity_conflict')
    if(!owned)await db.query(`INSERT INTO public.radar_business_identity_keys(organization_id,campaign_id,candidate_id,observation_id,key_kind,identity_key) VALUES($1,$2,$3,$4,$5,$6)`,[input.organizationId,input.campaignId,candidateId,observationId,kind,key])
   }
  }
  await db.query(`INSERT INTO public.radar_business_identity_events(organization_id,campaign_id,observation_id,kind,candidate_id,reason) VALUES($1,$2,$3,$4,$5,$6)`,[input.organizationId,input.campaignId,observationId,outside?'exclude':resolution.status==='matched'?'link':resolution.status==='new_provisional'?'create':'review',candidateId??null,resolution.signals.join(',')])
  if(!dependencies.transaction)await db.query('COMMIT')
  return result(row,false)
 }catch(cause){if(!dependencies.transaction)await db.query('ROLLBACK');throw cause}finally{if(!dependencies.transaction)db.release()}
}
/** Undo association, not deletion/automatic reassignment or a new provider call. */
export async function unlinkRadarBusinessObservation(pool:pg.Pool,user:AuthUser,input:{organizationId:string;observationId:string;reason:string}){
 if(user.role!=='yux_admin')throw Object.assign(Error('radar_admin_required'),{statusCode:403})
 z.object({organizationId:z.uuid(),observationId:z.uuid(),reason:z.string().trim().min(4).max(500)}).strict().parse(input)
 const db=await pool.connect()
 try{
  await db.query('BEGIN')
  const actor=(await db.query("SELECT id FROM public.app_users WHERE id=$1 AND role='yux_admin' AND is_active",[user.id])).rows[0]
  if(!actor)throw Object.assign(Error('radar_admin_required'),{statusCode:403})
  const reference=(await db.query('SELECT campaign_id FROM public.radar_business_observations WHERE id=$1 AND organization_id=$2',[input.observationId,input.organizationId])).rows[0]
  if(!reference)throw Error('radar_business_observation_not_found')
  await db.query('SELECT id FROM public.radar_campaigns WHERE id=$1 AND organization_id=$2 FOR UPDATE',[reference.campaign_id,input.organizationId])
  const row=(await db.query('SELECT * FROM public.radar_business_observations WHERE id=$1 AND organization_id=$2 FOR UPDATE',[input.observationId,input.organizationId])).rows[0]
  if(row.state==='unlinked'){await db.query('COMMIT');return{status:'unchanged'}}
  await db.query("UPDATE public.radar_business_observations SET state='unlinked',candidate_id=NULL,updated_at=NOW() WHERE id=$1",[row.id])
  await db.query('UPDATE public.radar_business_identity_keys SET active=FALSE,invalidated_at=NOW() WHERE observation_id=$1 AND active',[row.id])
  await db.query(`INSERT INTO public.radar_business_identity_events(organization_id,campaign_id,observation_id,kind,previous_candidate_id,actor_id,reason) VALUES($1,$2,$3,'unlink',$4,$5,$6)`,[input.organizationId,row.campaign_id,row.id,row.candidate_id,user.id,input.reason.trim()])
  await db.query('COMMIT');return{status:'unlinked'}
 }catch(cause){await db.query('ROLLBACK');throw cause}finally{db.release()}
}
