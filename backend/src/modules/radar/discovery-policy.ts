import {z} from 'zod'
import type pg from 'pg'
import type {AuthUser} from '../../auth/routes.js'
const positive=z.number().int().positive().safe()
const norm=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR').trim()
export const radarDiscoverySourcesV2=['osm_extract','serper_places','brave_place_search','serper_web_search','brave_web_search','cnpja_advanced_search','perplexity_search_fast','perplexity_search_web'] as const
const tag=z.object({key:z.string().regex(/^[a-zA-Z0-9_:.-]{1,80}$/),values:z.array(z.string().min(1).max(100)).min(1).max(50)}).strict()
const mapping=z.object({key:z.string().regex(/^[a-z][a-z0-9_]{0,79}$/),terms:z.array(z.string().trim().min(1).max(160)).min(1).max(50),anyTags:z.array(tag).min(1).max(50)}).strict()
export const radarDiscoveryPolicySchema=z.object({windowSize:positive.default(50),osm:z.object({maxSnapshotAgeDays:positive.default(90),pageSize:positive.default(100),mappings:z.array(mapping).max(1000).default([])}).strict().default(()=>({maxSnapshotAgeDays:90,pageSize:100,mappings:[]}))}).strict().superRefine((policy,ctx)=>{
 const keys=new Set<string>(),terms=new Set<string>()
 for(const [index,item]of policy.osm.mappings.entries()){
  if(keys.has(item.key))ctx.addIssue({code:'custom',path:['osm','mappings',index,'key'],message:'duplicate_mapping_key'})
  keys.add(item.key)
  for(const term of item.terms){const normalized=norm(term);if(terms.has(normalized))ctx.addIssue({code:'custom',path:['osm','mappings',index,'terms'],message:'ambiguous_segment_alias'});terms.add(normalized)}
 }
})
export const radarCampaignDiscoverySchema=z.object({enabled:z.boolean().default(false),sourceOrder:z.array(z.enum(radarDiscoverySourcesV2)).min(1).max(8).refine(values=>new Set(values).size===values.length,'duplicate_discovery_source').default(['cnpja_advanced_search']),terms:z.array(z.string().trim().min(1).max(160)).max(50).default([])}).strict()
export type RadarDiscoveryPolicy=z.infer<typeof radarDiscoveryPolicySchema>
export type RadarOsmMapping=z.infer<typeof mapping>
export const resolveRadarOsmMapping=(policy:RadarDiscoveryPolicy,segment:string)=>policy.osm.mappings.find(item=>item.terms.some(term=>norm(term)===norm(segment)))
export const matchConfiguredRadarOsmTags=(tags:Record<string,string>,mapping:RadarOsmMapping)=>mapping.anyTags.some(item=>item.values.includes(tags[item.key]))
export async function loadRadarDiscoveryPolicy(db:Pick<pg.Pool,'query'>){
 const row=(await db.query('SELECT version,configuration FROM public.radar_discovery_policy WHERE singleton=TRUE')).rows[0]
 if(!row)throw Error('radar_discovery_policy_unavailable')
 return{version:Number(row.version),configuration:radarDiscoveryPolicySchema.parse(row.configuration)}
}
export async function saveRadarDiscoveryPolicy(pool:pg.Pool,user:AuthUser,raw:unknown){
 if(user.role!=='yux_admin')throw Object.assign(Error('radar_source_admin_required'),{statusCode:403})
 const parsed=z.object({expectedVersion:positive,configuration:radarDiscoveryPolicySchema}).strict().safeParse(raw)
 if(!parsed.success)throw Object.assign(Error('radar_discovery_policy_invalid'),{statusCode:400})
 const input=parsed.data
 const row=(await pool.query('UPDATE public.radar_discovery_policy SET configuration=$2::jsonb,version=version+1,updated_at=NOW() WHERE singleton=TRUE AND version=$1 RETURNING version,configuration',[input.expectedVersion,JSON.stringify(input.configuration)])).rows[0]
 if(!row)throw Object.assign(Error('radar_discovery_policy_changed'),{statusCode:409})
 return{version:Number(row.version),configuration:radarDiscoveryPolicySchema.parse(row.configuration)}
}
