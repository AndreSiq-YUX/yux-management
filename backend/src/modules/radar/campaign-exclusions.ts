import {isRadarSemanticallyOutside} from './semantic-eligibility.js'
import type pg from 'pg'
import {createHash} from 'node:crypto'
import {z} from 'zod'
import type {AuthUser} from '../../auth/routes.js'
import {requireRadarScope} from './access.js'
import {normalizeValidRadarCnpj,radarEntityDomain,radarEntityNameKey} from './entity-resolution.js'
import {reconcileRadarCaptureItems} from './capture-reconciliation.js'
type Db=Pick<pg.Pool,'query'>
type Scope={organizationId:string;campaignId:string}
type Identity={candidateId?:string;cnpj?:string;taxIdVerified?:boolean;title?:string;city?:string;state?:string;websiteUrl?:string;websiteVerified?:boolean;externalKey?:{namespace:string;value:string};keys?:string[]}
const failure=()=>Object.assign(Error('radar_candidate_not_found'),{statusCode:404})
export const radarCampaignExclusionSchema=z.object({organizationId:z.uuid(),campaignId:z.uuid(),candidateIds:z.array(z.uuid()).min(1),requestId:z.uuid(),reason:z.string().trim().max(500).optional()}).strict()
export function radarCampaignExclusionKeys(identity:Identity){
 const keys=[...(identity.keys??[])]
 if(identity.candidateId)keys.push(`candidate:${identity.candidateId}`)
 const taxId=identity.taxIdVerified?normalizeValidRadarCnpj(identity.cnpj):undefined
 if(taxId)keys.push(`cnpj:${taxId}`)
 if(identity.externalKey)keys.push(`external:${JSON.stringify(identity.externalKey)}`)
 const domain=identity.websiteVerified?radarEntityDomain(identity.websiteUrl):undefined
 if(domain&&identity.title&&identity.city&&identity.state)keys.push(`site:${JSON.stringify([domain,radarEntityNameKey(identity.title),identity.city.toLocaleLowerCase('pt-BR'),identity.state.toUpperCase()])}`)
 return [...new Set(keys)].sort()
}
export async function isRadarCampaignExcluded(db:Db,input:Scope&{identity:Identity;criteriaRevision:number}){
 if(input.identity.candidateId){
  const row=(await db.query('SELECT status,normalized_payload FROM public.radar_candidate_records WHERE id=$1 AND organization_id=$2 AND campaign_id=$3',[input.identity.candidateId,input.organizationId,input.campaignId])).rows[0]
  if(row?.status==='discarded'||row?.normalized_payload?.decisionExclusion?.active===true&&row.normalized_payload.decisionExclusion.revision===input.criteriaRevision)return true
  if(row?.normalized_payload?.targetStatus==='not_target'){
   const run=(await db.query(`SELECT id,output FROM public.radar_candidate_research_runs WHERE candidate_id=$1 AND organization_id=$2 AND campaign_id=$3 AND configuration_revision=$4 AND status IN('partial','succeeded') ORDER BY created_at DESC,id DESC LIMIT 1`,[input.identity.candidateId,input.organizationId,input.campaignId,input.criteriaRevision])).rows[0]
   if(run&&row.normalized_payload.semanticReviewOverride?.runId!==run.id&&isRadarSemanticallyOutside(run.output))return true
  }
 }
 const keys=radarCampaignExclusionKeys(input.identity)
 if(!keys.length)return false
 return (await db.query(`SELECT 1 FROM public.radar_campaign_exclusions WHERE organization_id=$1 AND campaign_id=$2 AND revoked_at IS NULL AND (origin='manual' OR criteria_revision=$3) AND identity_keys ?| $4::text[] LIMIT 1`,[input.organizationId,input.campaignId,input.criteriaRevision,keys])).rows.length>0
}
export async function excludeRadarCampaignCandidates(pool:pg.Pool,user:AuthUser,value:z.infer<typeof radarCampaignExclusionSchema>){
 const input=radarCampaignExclusionSchema.parse(value),ids=[...new Set(input.candidateIds)].sort()
 await requireRadarScope(pool,user,{organizationId:input.organizationId,campaignId:input.campaignId},true)
 const db=await pool.connect()
 try{
  await db.query('BEGIN')
  const campaign=(await db.query('SELECT id FROM public.radar_campaigns WHERE id=$1 AND organization_id=$2 FOR UPDATE',[input.campaignId,input.organizationId])).rows[0]
  if(!campaign)throw failure()
  const inputHash=createHash('sha256').update(JSON.stringify({ids,reason:input.reason??null})).digest('hex')
  const replay=(await db.query('SELECT input_hash FROM public.radar_campaign_exclusion_requests WHERE organization_id=$1 AND campaign_id=$2 AND request_id=$3',[input.organizationId,input.campaignId,input.requestId])).rows[0]
  if(replay){if(replay.input_hash!==inputHash)throw Object.assign(Error('radar_exclusion_request_conflict'),{statusCode:409});await db.query('COMMIT');return{items:ids.map(candidateId=>({candidateId,status:'excluded' as const}))}}
  const rows=(await db.query('SELECT candidate.*,to_jsonb(review) AS review_snapshot FROM public.radar_candidate_records candidate LEFT JOIN public.radar_b2b_reviews review ON review.candidate_id=candidate.id AND review.organization_id=candidate.organization_id WHERE candidate.id=ANY($1::uuid[]) AND candidate.organization_id=$2 AND candidate.campaign_id=$3 ORDER BY candidate.id FOR UPDATE OF candidate',[ids,input.organizationId,input.campaignId])).rows
  if(rows.length!==ids.length)throw failure()
  await db.query('INSERT INTO public.radar_campaign_exclusion_requests(organization_id,campaign_id,request_id,input_hash,candidate_ids) VALUES($1,$2,$3,$4,$5::jsonb)',[input.organizationId,input.campaignId,input.requestId,inputHash,JSON.stringify(ids)])
  for(const row of rows){
   const data=row.normalized_payload??{},website=data.publicPresence?.website??{}
   const aliases=(await db.query('SELECT key_kind,identity_key FROM public.radar_business_identity_keys WHERE organization_id=$1 AND campaign_id=$2 AND candidate_id=$3 AND active',[input.organizationId,input.campaignId,row.id])).rows
   const keys=radarCampaignExclusionKeys({candidateId:row.id,cnpj:data.cnpj,taxIdVerified:['cnpja_advanced_search','cnpja_office_lookup'].includes(row.source_type)||data.taxIdVerified===true,title:row.title,city:data.city,state:data.state,websiteUrl:website.url,websiteVerified:website.association==='confirmed',keys:aliases.map(key=>`identity:${key.key_kind}:${key.identity_key}`)})
   await db.query(`INSERT INTO public.radar_campaign_exclusions(organization_id,campaign_id,candidate_id,request_id,identity_keys,title,reason,created_by,review_snapshot) VALUES($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9::jsonb) ON CONFLICT(organization_id,campaign_id,candidate_id) WHERE revoked_at IS NULL DO NOTHING`,[input.organizationId,input.campaignId,row.id,input.requestId,JSON.stringify(keys),row.title,input.reason??null,user.id,JSON.stringify({...row.review_snapshot,_sourceType:row.source_type})])
   await db.query("UPDATE public.radar_candidate_records SET status='discarded',reviewed_by=$2,reviewed_at=NOW(),updated_at=NOW() WHERE id=$1",[row.id,user.id])
   await reconcileRadarCaptureItems(db,{organizationId:input.organizationId,candidateId:row.id})
  }
  await db.query('COMMIT');return{items:ids.map(candidateId=>({candidateId,status:'excluded' as const}))}
 }catch(cause){await db.query('ROLLBACK');throw cause}finally{db.release()}
}
export async function listRadarCampaignExclusions(db:Db,user:AuthUser,input:Scope){
 await requireRadarScope(db,user,{organizationId:input.organizationId,campaignId:input.campaignId})
 return(await db.query(`SELECT exclusion.id,exclusion.candidate_id AS "candidateId",CASE WHEN $3::boolean OR COALESCE(candidate.source_type,exclusion.review_snapshot->>'_sourceType') IS NOT NULL AND COALESCE(candidate.source_type,exclusion.review_snapshot->>'_sourceType')<>'osm_extract' THEN exclusion.title ELSE 'Empresa excluída' END AS title,exclusion.origin,exclusion.created_at AS "createdAt" FROM public.radar_campaign_exclusions exclusion LEFT JOIN public.radar_candidate_records candidate ON candidate.id=exclusion.candidate_id AND candidate.organization_id=exclusion.organization_id WHERE exclusion.organization_id=$1 AND exclusion.campaign_id=$2 AND exclusion.revoked_at IS NULL ORDER BY exclusion.created_at DESC,exclusion.id`,[input.organizationId,input.campaignId,user.role==='yux_admin'])).rows
}
export async function restoreRadarCampaignExclusion(pool:pg.Pool,user:AuthUser,input:Scope&{exclusionId:string}){
 await requireRadarScope(pool,user,{organizationId:input.organizationId,campaignId:input.campaignId},true)
 const db=await pool.connect()
 try{
  await db.query('BEGIN');await db.query('SELECT id FROM public.radar_campaigns WHERE id=$1 AND organization_id=$2 FOR UPDATE',[input.campaignId,input.organizationId])
  const saved=(await db.query('SELECT candidate_id,revoked_at FROM public.radar_campaign_exclusions WHERE id=$1 AND organization_id=$2 AND campaign_id=$3 FOR UPDATE',[input.exclusionId,input.organizationId,input.campaignId])).rows[0]
  if(!saved)throw failure()
  if(saved.revoked_at){await db.query('COMMIT');return{status:'restored' as const}}
  await db.query('UPDATE public.radar_campaign_exclusions SET revoked_at=COALESCE(revoked_at,NOW()),revoked_by=$2 WHERE id=$1',[input.exclusionId,user.id])
  if(saved.candidate_id)await db.query("UPDATE public.radar_candidate_records SET status='pending_review',reviewed_by=NULL,reviewed_at=NULL,updated_at=NOW() WHERE id=$1 AND organization_id=$2 AND status='discarded'",[saved.candidate_id,input.organizationId])
  if(saved.candidate_id)await db.query("UPDATE public.radar_b2b_reviews SET approved_at=NULL,approved_by=NULL,target_status='review',product_fit='unknown',updated_at=NOW() WHERE candidate_id=$1 AND organization_id=$2 AND campaign_id=$3",[saved.candidate_id,input.organizationId,input.campaignId])
  if(saved.candidate_id)await reconcileRadarCaptureItems(db,{organizationId:input.organizationId,candidateId:saved.candidate_id})
  await db.query('COMMIT');return{status:'restored' as const}
 }catch(cause){await db.query('ROLLBACK');throw cause}finally{db.release()}
}
