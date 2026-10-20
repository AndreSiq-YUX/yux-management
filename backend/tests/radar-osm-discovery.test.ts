import {it,expect} from 'vitest'
import {discoverRadarOsmPage} from '../src/modules/radar/osm-discovery.js'
import {radarDiscoveryPolicySchema} from '../src/modules/radar/discovery-policy.js'
const mapping={key:'custom_segment',terms:['Segmento configurável'],anyTags:[{key:'cuisine',values:['catering']}]}
const policy=radarDiscoveryPolicySchema.parse({osm:{pageSize:1,mappings:[mapping]}})
const id='11111111-1111-4111-8111-111111111111'
const snapshot={id,extracted_at:new Date().toISOString(),segment_coverage:{custom_segment:{mapping}}}
const input={city:'Cidade de teste',state:'PR',segment:'Segmento configurável',policy}
it('pages a verified configurable snapshot by stable OSM tuple rather than a fixed first slice',async()=>{
 const db={query:async(sql:string,params:unknown[])=>{
  if(sql.includes('radar_osm_snapshots'))return{rows:[snapshot]}
  expect(sql).toContain('(osm_type,osm_id)>');expect(params[4]).toBe(2)
  return{rows:[{osm_type:'node',osm_id:'20',name:'Empresa Alfa',source_url:'https://www.openstreetmap.org/node/20',tags:{cuisine:'catering'}},{osm_type:'way',osm_id:'30',name:'Empresa Beta',tags:{cuisine:'catering'}}]}
 }}
 expect(await discoverRadarOsmPage(db as never,input)).toMatchObject({candidates:[{mention:{name:'Empresa Alfa',contacts:[]}}],exhaustion:'more',continuation:{snapshotId:id,afterType:'node',afterId:'20'}})
})
it('does not confuse missing mapping, stale snapshot or changed index coverage with market exhaustion',async()=>{
 let current:Record<string,unknown>=snapshot
 const db={query:async()=>({rows:[current]})}
 await expect(discoverRadarOsmPage(db as never,{...input,segment:'Não mapeado'})).rejects.toThrow('radar_osm_segment_mapping_missing')
 current={...snapshot,extracted_at:'2000-01-01'};await expect(discoverRadarOsmPage(db as never,input)).rejects.toThrow('radar_osm_coverage_unavailable')
 current={...snapshot,segment_coverage:{}};await expect(discoverRadarOsmPage(db as never,input)).rejects.toThrow('radar_osm_segment_coverage_unavailable')
 current=snapshot;await expect(discoverRadarOsmPage(db as never,{...input,continuation:{snapshotId:'22222222-2222-4222-8222-222222222222',afterType:'node',afterId:'20'}})).rejects.toThrow('radar_osm_snapshot_changed')
})
