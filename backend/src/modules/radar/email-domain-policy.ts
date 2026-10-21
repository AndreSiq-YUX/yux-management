import {z} from 'zod'
import type pg from 'pg'
import type {AuthUser} from '../../auth/routes.js'
export const radarEmailDomainPolicySchema=z.object({
 genericProviders:z.array(z.string().trim().toLowerCase().regex(/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/)).max(1000),
 accountantTokens:z.array(z.string().trim().toLowerCase().min(2).max(80)).max(200),
}).strict()
const failure=(code:string,statusCode:number)=>Object.assign(Error(code),{statusCode})
export async function loadRadarEmailDomainPolicy(db:Pick<pg.Pool,'query'>){
 const row=(await db.query('SELECT version,configuration FROM public.radar_email_domain_policy WHERE singleton=TRUE')).rows[0]
 if(!row)throw failure('radar_email_domain_policy_unavailable',503)
 return{version:Number(row.version),configuration:radarEmailDomainPolicySchema.parse(row.configuration)}
}
export async function saveRadarEmailDomainPolicy(db:Pick<pg.Pool,'query'>,user:AuthUser,raw:unknown){
 if(user.role!=='yux_admin')throw failure('radar_source_admin_required',403)
 const input=z.object({expectedVersion:z.number().int().positive(),configuration:radarEmailDomainPolicySchema}).strict().parse(raw)
 const row=(await db.query('UPDATE public.radar_email_domain_policy SET configuration=$2::jsonb,version=version+1,updated_at=NOW() WHERE singleton=TRUE AND version=$1 RETURNING version,configuration',[input.expectedVersion,JSON.stringify(input.configuration)])).rows[0]
 if(!row)throw failure('radar_email_domain_policy_changed',409)
 return{version:Number(row.version),configuration:radarEmailDomainPolicySchema.parse(row.configuration)}
}
