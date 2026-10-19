import type pg from 'pg'

type RefreshGrant={requestId:string;approvedBy:string;configurationRevision:number;candidateIds:string[]}
export async function radarCaptureRefreshAuthorized(db:Pick<pg.Pool,'query'>,operation:{resume_request_id?:string;configuration_revision:number;analysis_refresh_authorizations?:unknown},candidateId:string):Promise<boolean>{
  if(!operation.resume_request_id||!Array.isArray(operation.analysis_refresh_authorizations))return false
  const grant=operation.analysis_refresh_authorizations.find((value:unknown):value is RefreshGrant=>{
    if(!value||typeof value!=='object')return false
    const item=value as Partial<RefreshGrant>
    return item.requestId===operation.resume_request_id&&item.configurationRevision===operation.configuration_revision
      &&typeof item.approvedBy==='string'&&Array.isArray(item.candidateIds)&&item.candidateIds.includes(candidateId)
  })
  if(!grant)return false
  // A persisted consent cannot survive revocation of the approving administrator.
  const approver=await db.query("SELECT id FROM public.app_users WHERE id=$1 AND is_active=TRUE AND role='yux_admin'",[grant.approvedBy])
  return approver.rows.length>0
}
