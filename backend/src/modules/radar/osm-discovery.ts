import type pg from 'pg'
import {z} from 'zod'
import type {RadarDiscoveryPage,DiscoveryCandidate} from './discovery-providers.js'
import {resolveRadarOsmMapping,matchConfiguredRadarOsmTags,type RadarDiscoveryPolicy} from './discovery-policy.js'
const cursorSchema=z.object({snapshotId:z.uuid(),afterType:z.enum(['node','way']),afterId:z.string().regex(/^\d+$/)}).strict()
export async function discoverRadarOsmPage(db:Pick<pg.Pool,'query'>,input:{city?:string;state:string;segment:string;policy:RadarDiscoveryPolicy;continuation?:Record<string,unknown>}):Promise<RadarDiscoveryPage>{
 if(!input.city)throw Error('radar_osm_coverage_unavailable')
 const mapping=resolveRadarOsmMapping(input.policy,input.segment)
 if(!mapping)throw Error('radar_osm_segment_mapping_missing')
 const cursor=input.continuation?cursorSchema.parse(input.continuation):undefined
 const snapshot=(await db.query(`SELECT id,extracted_at,attribution,segment_coverage FROM public.radar_osm_snapshots WHERE state=$1 AND lower(city)=lower($2) AND status='active' ORDER BY extracted_at DESC,id LIMIT 1`,[input.state,input.city])).rows[0]
 if(!snapshot||Date.now()-new Date(snapshot.extracted_at).getTime()>input.policy.osm.maxSnapshotAgeDays*86400000)throw Error('radar_osm_coverage_unavailable')
 if(cursor&&cursor.snapshotId!==snapshot.id)throw Error('radar_osm_snapshot_changed')
 const indexed=snapshot.segment_coverage?.[mapping.key]
 if(!indexed?.mapping||JSON.stringify(indexed.mapping)!==JSON.stringify(mapping))throw Error('radar_osm_segment_coverage_unavailable')
 const rows=(await db.query(`SELECT * FROM public.radar_osm_places WHERE snapshot_id=$1 AND segment_key=$2 AND ($3::text IS NULL OR (osm_type,osm_id)>($3,$4::bigint)) ORDER BY osm_type,osm_id LIMIT $5`,[snapshot.id,mapping.key,cursor?.afterType??null,cursor?.afterId??'0',input.policy.osm.pageSize+1])).rows
 const slice=rows.slice(0,input.policy.osm.pageSize),last=slice.at(-1)
 const candidates:DiscoveryCandidate[]=slice.filter(row=>matchConfiguredRadarOsmTags(row.tags??{},mapping)).map(row=>({
  mention:{schemaVersion:1,name:row.name,location:{city:input.city!,state:input.state,...(row.address?{address:row.address}:{})},sourceUrl:row.source_url,subjectScope:'establishment',contacts:[],needsVerification:true,observedAt:new Date(snapshot.extracted_at).toISOString(),evidenceSpans:[{field:'name',evidenceId:'osm-record',excerpt:row.name}]},
  externalKey:{namespace:'osm',value:`${row.osm_type}:${row.osm_id}`}
 }))
 const more=rows.length>input.policy.osm.pageSize
 return{candidates,documents:[],exhaustion:more?'more':'exhausted',...(more&&last?{continuation:{snapshotId:snapshot.id,afterType:last.osm_type,afterId:String(last.osm_id)}}:{})}
}
