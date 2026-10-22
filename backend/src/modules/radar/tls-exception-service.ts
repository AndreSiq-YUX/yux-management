import type pg from 'pg'
import dns from 'node:dns/promises'
import {isIP} from 'node:net'
import {createHash} from 'node:crypto'
import type {AuthUser} from '../../auth/routes.js'
import {requireRadarScope} from './access.js'
import {isRadarEnabledOrganization} from './repository.js'
import {isPublicRadarSiteIp} from './osm-site-check.js'
import type {RadarSiteEvidence} from './site-evidence.js'
import {radarTlsEvidencePages} from './tls-evidence.js'
import {probeRadarExpiredCertificate,type RadarTlsExceptionGrant,type RadarTlsReadOptions} from './site-tls-exception.js'
type Queryable=Pick<pg.Pool,'query'>
export type RadarTlsScope={organizationId:string;candidateId:string;runId:string;configurationRevision:number}
type Authorize=RadarTlsScope&{diagnosticId:string;confirmed:true}
const failure=(code:string,statusCode=409)=>Object.assign(new Error(code),{statusCode})
const adminOnly=(user:AuthUser)=>{if(user.role!=='yux_admin')throw failure('radar_tls_admin_required',403)}
export function radarTlsDiagnosticId(runId:string,page:{url:string;certificate?:RadarSiteEvidence['certificate']}) {
  return createHash('sha256').update(JSON.stringify([runId,page.url,page.certificate?.hostname,page.certificate?.fingerprint256,page.certificate?.validTo])).digest('hex')
}
const selectGrant=`SELECT grant_row.id,grant_row.organization_id AS "organizationId",grant_row.candidate_id AS "candidateId",
  grant_row.run_id AS "runId",grant_row.configuration_revision AS "configurationRevision",grant_row.hostname,grant_row.fingerprint256,
  grant_row.approved_by AS "approvedBy",grant_row.approved_at AS "approvedAt",grant_row.expires_at AS "expiresAt",grant_row.revoked_at AS "revokedAt"
  FROM public.radar_site_tls_exceptions grant_row`
function project(row:Record<string,unknown>):RadarTlsExceptionGrant {
  const iso=(value:unknown)=>value instanceof Date?value.toISOString():String(value)
  return {...row,approvedAt:iso(row.approvedAt),expiresAt:iso(row.expiresAt),revokedAt:row.revokedAt?iso(row.revokedAt):undefined} as RadarTlsExceptionGrant
}
async function activeAdmin(pool:Queryable,user:AuthUser) {
  adminOnly(user)
  const result=await pool.query(`SELECT id FROM public.app_users WHERE id=$1 AND role='yux_admin' AND is_active=TRUE`,[user.id])
  if(!result.rows[0])throw failure('radar_tls_admin_required',403)
}
async function context(pool:Queryable,input:Authorize,lock=false) {
  const row=(await pool.query(`SELECT run.output,run.calls,run.status,run.configuration_revision,candidate.status AS candidate_status,
    campaign.configuration_revision AS current_revision,campaign.status AS campaign_status,review.approved_at
    FROM public.radar_candidate_research_runs run
    JOIN public.radar_candidate_records candidate ON candidate.id=run.candidate_id AND candidate.organization_id=run.organization_id
    JOIN public.radar_campaigns campaign ON campaign.id=run.campaign_id AND campaign.organization_id=run.organization_id
    LEFT JOIN public.radar_b2b_reviews review ON review.candidate_id=candidate.id
    WHERE run.id=$1 AND run.organization_id=$2 AND run.candidate_id=$3
      AND NOT EXISTS(SELECT 1 FROM public.radar_candidate_research_runs newer WHERE newer.candidate_id=run.candidate_id
        AND (newer.created_at,newer.id)>(run.created_at,run.id))
    ${lock?'FOR UPDATE OF campaign,candidate,run':''}`,[input.runId,input.organizationId,input.candidateId])).rows[0]
  if(!row||row.configuration_revision!==input.configurationRevision||row.current_revision!==input.configurationRevision
    ||row.candidate_status!=='pending_review'||row.approved_at||!['partial','blocked','failed'].includes(row.status)
    ||['paused','archived','completed'].includes(row.campaign_status))throw failure('radar_tls_context_changed')
  const pages=radarTlsEvidencePages(row)
  const page=pages.find(p=>p.diagnostic?.kind==='tls_expired'&&p.certificate&&radarTlsDiagnosticId(input.runId,p)===input.diagnosticId)
  if(!page?.certificate)throw failure('radar_tls_diagnostic_changed')
  const url=new URL(page.url)
  if(url.protocol!=='https:'||url.username||url.password||url.port&&url.port!=='443'||url.hostname!==page.certificate.hostname)throw failure('radar_tls_diagnostic_changed')
  return {page,url}
}
export async function authorizeRadarTlsException(pool:pg.Pool,user:AuthUser,input:Authorize,
  dependencies:{probe?:typeof probeRadarExpiredCertificate;resolve?:(host:string)=>Promise<string[]>}={}) {
  adminOnly(user)
  if(input.confirmed!==true)throw failure('radar_tls_confirmation_required',400)
  await requireRadarScope(pool,user,{organizationId:input.organizationId,candidateId:input.candidateId},true)
  await activeAdmin(pool,user)
  if(!await isRadarEnabledOrganization(pool,input.organizationId))throw failure('radar_forbidden',403)
  const {page,url}=await context(pool,input)
  const addresses=isIP(url.hostname)?[url.hostname]:await (dependencies.resolve??(async host=>(await dns.lookup(host,{all:true,family:4,verbatim:true})).map(r=>r.address)))(url.hostname)
  if(!addresses.length||!addresses.every(isPublicRadarSiteIp))throw failure('radar_tls_public_address_required')
  const observed=await (dependencies.probe??probeRadarExpiredCertificate)(url,addresses[0])
  if(observed.hostname!==page.certificate!.hostname||observed.fingerprint256!==page.certificate!.fingerprint256||observed.validTo!==page.certificate!.validTo)throw failure('radar_tls_certificate_changed')
  const client=await pool.connect()
  try {
    await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`radar-research:${input.candidateId}`])
    await activeAdmin(client,user);await context(client,input,true)
    const previous=(await client.query(`${selectGrant} WHERE grant_row.organization_id=$1 AND grant_row.run_id=$2 AND grant_row.hostname=$3
      AND grant_row.fingerprint256=$4 AND grant_row.revoked_at IS NULL AND grant_row.expires_at>NOW() ORDER BY grant_row.approved_at DESC LIMIT 1`,
      [input.organizationId,input.runId,observed.hostname,observed.fingerprint256])).rows[0]
    let id=previous?.id
    if(!id)id=(await client.query(`INSERT INTO public.radar_site_tls_exceptions
      (organization_id,candidate_id,run_id,configuration_revision,hostname,fingerprint256,certificate_valid_to,approved_by)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,[input.organizationId,input.candidateId,input.runId,input.configurationRevision,observed.hostname,observed.fingerprint256,observed.validTo,user.id])).rows[0].id
    const saved=(await client.query(`${selectGrant} WHERE grant_row.id=$1`,[id])).rows[0]
    await client.query('COMMIT');return project(saved)
  }catch(cause){await client.query('ROLLBACK');throw cause}finally{client.release()}
}
export async function revokeRadarTlsException(pool:pg.Pool,user:AuthUser,input:{organizationId:string;candidateId:string;grantId:string}):Promise<void> {
  adminOnly(user);await activeAdmin(pool,user)
  await requireRadarScope(pool,user,{organizationId:input.organizationId,candidateId:input.candidateId},true)
  const result=await pool.query(`UPDATE public.radar_site_tls_exceptions SET revoked_at=COALESCE(revoked_at,NOW()),revoked_by=COALESCE(revoked_by,$4)
    WHERE id=$1 AND organization_id=$2 AND candidate_id=$3 RETURNING id`,[input.grantId,input.organizationId,input.candidateId,user.id])
  if(!result.rows[0])throw failure('radar_tls_grant_not_found',404)
}
export async function listRadarTlsExceptions(pool:Queryable,scope:RadarTlsScope) {
  return (await pool.query(`${selectGrant} WHERE grant_row.organization_id=$1 AND grant_row.run_id=$2 AND grant_row.candidate_id=$3
    ORDER BY grant_row.approved_at DESC`,[scope.organizationId,scope.runId,scope.candidateId])).rows.map(project)
}
export async function getRadarTlsReadOptions(pool:Queryable,scope:RadarTlsScope,hostname:string):Promise<RadarTlsReadOptions|undefined> {
  const load=async(id?:string)=>(await pool.query(`${selectGrant}
    JOIN public.app_users author ON author.id=grant_row.approved_by AND author.is_active=TRUE AND author.role='yux_admin'
    JOIN public.radar_candidate_research_runs run ON run.id=grant_row.run_id AND run.organization_id=grant_row.organization_id
    JOIN public.radar_campaigns campaign ON campaign.id=run.campaign_id AND campaign.configuration_revision=grant_row.configuration_revision
    JOIN public.radar_candidate_records candidate ON candidate.id=grant_row.candidate_id AND candidate.status='pending_review'
    WHERE grant_row.organization_id=$1 AND grant_row.candidate_id=$2 AND grant_row.run_id=$3 AND grant_row.configuration_revision=$4
      AND grant_row.hostname=$5 AND grant_row.revoked_at IS NULL AND grant_row.approved_at<=NOW() AND grant_row.expires_at>NOW()
      AND ($6::uuid IS NULL OR grant_row.id=$6) AND campaign.status NOT IN ('paused','archived','completed')
      AND NOT EXISTS(SELECT 1 FROM public.radar_b2b_reviews review WHERE review.candidate_id=candidate.id AND review.approved_at IS NOT NULL)
    ORDER BY grant_row.approved_at DESC LIMIT 1`,[scope.organizationId,scope.candidateId,scope.runId,scope.configurationRevision,hostname,id??null])).rows[0]
  const row=await load();if(!row)return undefined
  return {tlsException:project(row),validateGrant:async grant=>!!await load(grant.id)}
}
