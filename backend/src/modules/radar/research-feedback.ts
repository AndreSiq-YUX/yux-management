import type pg from 'pg'
import {createHash} from 'node:crypto'
import type {AuthUser} from '../../auth/routes.js'
import {requireRadarScope} from './access.js'

export type RadarFeedbackInput={organizationId:string;candidateId:string;configurationRevision:number;requestId:string;
  kind:'identity_confirmed'|'identity_wrong'|'contact_valid'|'contact_invalid'|'segment_confirmed'|'segment_wrong';contact?:{kind:string;value:string};note?:string}
const fail=(code:string,statusCode=409)=>Object.assign(Error(code),{statusCode})
export async function recordRadarResearchFeedback(pool:pg.Pool,user:AuthUser,input:RadarFeedbackInput){
  await requireRadarScope(pool,user,{organizationId:input.organizationId,candidateId:input.candidateId},true)
  const client=await pool.connect()
  try{
    await client.query('BEGIN')
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`radar-feedback:${input.organizationId}:${input.requestId}`])
    const row=(await client.query(`SELECT candidate.organization_id,candidate.campaign_id,candidate.normalized_payload,campaign.configuration_revision
      FROM public.radar_candidate_records candidate JOIN public.radar_campaigns campaign ON campaign.id=candidate.campaign_id
      WHERE candidate.id=$1 AND candidate.organization_id=$2 FOR SHARE OF candidate,campaign`,[input.candidateId,input.organizationId])).rows[0]
    if(!row||row.organization_id!==input.organizationId)throw fail('radar_feedback_scope_invalid',403)
    if(row.configuration_revision!==input.configurationRevision)throw fail('radar_campaign_configuration_changed')
    const wantsContact=['contact_valid','contact_invalid'].includes(input.kind)
    if(wantsContact!==!!input.contact)throw fail('radar_feedback_contact_required',400)
    const projection=row.normalized_payload.publicPresence
    const contacts=[...(Array.isArray(row.normalized_payload.publicContacts)?row.normalized_payload.publicContacts:[]),...(Array.isArray(projection?.contacts)?projection.contacts:[])]
    if(input.contact&&!contacts.some(contact=>contact?.kind===input.contact!.kind&&contact?.value===input.contact!.value))throw fail('radar_feedback_contact_not_found',400)
    const hash=createHash('sha256').update(JSON.stringify({candidateId:input.candidateId,configurationRevision:input.configurationRevision,kind:input.kind,contact:input.contact??null,note:input.note?.trim()??''})).digest('hex')
    const previous=(await client.query('SELECT * FROM public.radar_research_feedback WHERE organization_id=$1 AND request_id=$2',[input.organizationId,input.requestId])).rows[0]
    if(previous){if(previous.payload_hash!==hash)throw fail('radar_feedback_request_conflict');await client.query('COMMIT');return previous}
    const result=(await client.query(`INSERT INTO public.radar_research_feedback(organization_id,campaign_id,candidate_id,request_id,payload_hash,configuration_revision,kind,contact,note,created_by)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10) RETURNING *`,[input.organizationId,row.campaign_id,input.candidateId,input.requestId,hash,input.configurationRevision,input.kind,input.contact?JSON.stringify(input.contact):null,input.note?.trim()??'',user.id])).rows[0]
    await client.query('COMMIT');return result
  }catch(cause){await client.query('ROLLBACK');throw cause}finally{client.release()}
}
export async function listRadarResearchFeedback(pool:pg.Pool,user:AuthUser,organizationId:string,candidateId:string){
  await requireRadarScope(pool,user,{organizationId,candidateId})
  return(await pool.query(`SELECT id,kind,contact,note,configuration_revision,created_by,created_at FROM public.radar_research_feedback
    WHERE organization_id=$1 AND candidate_id=$2 ORDER BY created_at DESC,id DESC LIMIT 100`,[organizationId,candidateId])).rows
}
