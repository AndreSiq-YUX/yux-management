import type { Queryable } from './repository.js'
import { RADAR_PROSPECTING_PACK_V1 } from './packs/radar-prospecting-v1.js'
import { publishActionPackVersion } from './repository.js'
import { radarActionEngineEnabled, type RadarActionEngineConfig } from '../radar/action-engine-commands.js'
import { isRadarEnabledOrganization } from '../radar/repository.js'

export async function radarMissionAvailable(pool:Queryable,config:RadarActionEngineConfig,organizationId:string,actorId:string){
 if(!radarActionEngineEnabled(config,organizationId))return false
 const user=(await pool.query("SELECT role,is_active FROM public.app_users WHERE id=$1",[actorId])).rows[0]
 return user?.role==='yux_admin'&&user.is_active===true&&await isRadarEnabledOrganization(pool,organizationId)
}
export async function ensureRadarProspectingPackVersion(pool:Queryable,createdBy:string){
 const {parameters:_schema,...definition}=RADAR_PROSPECTING_PACK_V1
 return publishActionPackVersion(pool,{packKey:definition.key,name:'Radar Comercial',description:'Pesquisa assistida de empresas com revisão e autorização.',semanticVersion:definition.semanticVersion,outcomeType:definition.outcomeType,definition:definition as unknown as Record<string,unknown>,contentHash:definition.contentHash,createdBy})
}
