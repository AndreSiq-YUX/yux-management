import {createHash} from 'node:crypto'
import {z} from 'zod'
import {radarStateSchema,normalizeRadarText} from './search-configuration.js'

export const radarDiscoverySources=['osm_extract','serper_places','brave_place_search','serper_web_search','brave_web_search','cnpja_advanced_search','perplexity_search_fast','perplexity_search_web'] as const
export type RadarDiscoverySource=typeof radarDiscoverySources[number]
const source=z.enum(radarDiscoverySources),terms=z.array(z.string().trim().min(1).max(160)).max(50)
const city=z.object({city:z.string().trim().min(1).max(100),state:radarStateSchema,municipalityCode:z.string().regex(/^\d{7}$/).optional()}).strict()
const inputSchema=z.object({pipelineVersion:z.literal(2),segment:z.string().trim().min(1).max(160),states:z.array(radarStateSchema).min(1).max(27),cities:z.array(city).max(6000),terms,excludedTerms:terms,
 window:z.object({size:z.number().int().positive().safe(),offset:z.number().int().nonnegative().safe()}).strict(),
 sourceOrder:z.array(source).min(1).max(radarDiscoverySources.length).refine(values=>new Set(values).size===values.length,'duplicate_discovery_source'),
 sources:z.array(z.object({key:source,enabled:z.boolean(),canPersist:z.boolean(),canDeliver:z.boolean(),available:z.boolean()}).strict()).max(radarDiscoverySources.length).refine(values=>new Set(values.map(value=>value.key)).size===values.length,'duplicate_source_capability'),
 geography:z.object({cities:z.array(city).max(6000),completeStates:z.array(radarStateSchema).max(27),catalogVersion:z.string().min(1).max(120)}).strict()}).strict()
export type RadarDiscoveryScopeV2={key:string;source:RadarDiscoverySource;state:string;city?:string;municipalityCode?:string;term:string;query:string}
export type RadarAdaptiveDiscoveryPlan={pipelineVersion:2;countingMode:'qualified';catalogVersion:string;scopes:RadarDiscoveryScopeV2[];nextScopeOffset:number|null;totalPlannedScopes:number;marketExhausted:false;
 omittedSources:Array<{source:RadarDiscoverySource;reason:'disabled'|'unavailable'|'persistence_not_authorized'|'delivery_not_authorized'}>;coverageGaps:Array<{source:RadarDiscoverySource;state:string;reason:'coverage_unavailable'|'coverage_partial'}>}
export function resolveRadarCapturePipeline(input:{storedVersion?:1|2;requestedVersion?:1|2;resuming:boolean}){
 if(input.resuming&&input.storedVersion===undefined)throw Error('radar_capture_pipeline_unknown')
 const pipelineVersion=input.storedVersion??input.requestedVersion??1
 return{pipelineVersion,countingMode:pipelineVersion===1?'admitted' as const:'qualified' as const}
}
/** Frozen plan, not spending permission. Source rights are server-side input. */
export function buildRadarAdaptiveDiscoveryPlan(raw:z.input<typeof inputSchema>):RadarAdaptiveDiscoveryPlan{
 const input=inputSchema.parse(raw),states=[...new Set(input.states)],scopes:RadarDiscoveryScopeV2[]=[],omittedSources:RadarAdaptiveDiscoveryPlan['omittedSources']=[],coverageGaps:RadarAdaptiveDiscoveryPlan['coverageGaps']=[]
 let ordinal=0
 if(input.cities.some(location=>!states.includes(location.state)))throw Error('radar_discovery_city_outside_requested_states')
 const uniqueTerms=[...new Map([input.segment,...input.terms].map(term=>[normalizeRadarText(term),term])).values()]
 for(const key of input.sourceOrder){
  const sourceTerms=key==='osm_extract'||key==='cnpja_advanced_search'?[input.segment]:uniqueTerms
  const capability=input.sources.find(item=>item.key===key)
  const reason=!capability?.enabled?'disabled':!capability.available?'unavailable':!capability.canPersist?'persistence_not_authorized':!capability.canDeliver?'delivery_not_authorized':undefined
  if(reason){omittedSources.push({source:key,reason});continue}
  const cityOnly=['osm_extract','serper_places','brave_place_search'].includes(key)
  for(const state of states){
   const explicit=input.cities.filter(location=>location.state===state)
   // An explicit city list is the requested coverage, not all municipalities.
   if(input.cities.length&&!explicit.length)continue
   const catalog=input.geography.cities.filter(location=>location.state===state)
   const locations:Array<{state:string;city?:string;municipalityCode?:string}>=explicit.length?explicit:cityOnly?catalog:[{state}]
   if(cityOnly&&!explicit.length){
    if(!locations.length)coverageGaps.push({source:key,state,reason:'coverage_unavailable'})
    else if(!input.geography.completeStates.includes(state))coverageGaps.push({source:key,state,reason:'coverage_partial'})
   }
   const uniqueLocations=[...new Map(locations.map(location=>[normalizeRadarText(location.city??''),location])).values()]
   for(const location of uniqueLocations){
    if(ordinal+sourceTerms.length<=input.window.offset||scopes.length>=input.window.size){ordinal+=sourceTerms.length;continue}
    for(const term of sourceTerms){
    const current=ordinal++;if(current<input.window.offset||scopes.length>=input.window.size)continue
    const tuple=[key,state,normalizeRadarText(location.city??''),normalizeRadarText(term)],identity=JSON.stringify(tuple)
    const query=[term,location.city,state,'Brasil',...input.excludedTerms.map(value=>`-"${value.replace(/["\\]/g,' ')}"`)].filter(Boolean).join(' ')
    // Never silently truncate terms/geography into a different paid query.
    if(query.length>600)throw Error('radar_discovery_query_too_long')
    scopes.push({key:`v2:${createHash('sha256').update(identity).digest('hex')}`,source:key,state,...(location.city?{city:location.city}:{}),...(location.municipalityCode?{municipalityCode:location.municipalityCode}:{}),term,query})
    }
   }
  }
 }
 if(input.window.offset>ordinal)throw Error('radar_discovery_scope_window_invalid')
 return{pipelineVersion:2,countingMode:'qualified',catalogVersion:input.geography.catalogVersion,scopes,nextScopeOffset:input.window.offset+scopes.length<ordinal?input.window.offset+scopes.length:null,totalPlannedScopes:ordinal,omittedSources,coverageGaps,marketExhausted:false}
}
export type RadarAdaptiveDiscoveryItem={candidateId?:string;isNew:boolean;qualification:'confirmed'|'review'|'not_target'|'insufficient';state:'pending'|'running'|'completed'|'waiting'}
export function radarAdaptiveDiscoveryCounts(items:RadarAdaptiveDiscoveryItem[]){
 const seen=new Set<string>();let qualifiedNew=0,duplicates=0,outsideProfile=0,pending=0
 for(const item of items){
  const duplicate=!item.isNew||!!item.candidateId&&seen.has(item.candidateId)
  if(item.candidateId)seen.add(item.candidateId)
  if(duplicate){duplicates++;continue}
  if(item.qualification==='not_target')outsideProfile++
  else if(item.qualification==='confirmed')qualifiedNew++
  if(item.qualification!=='not_target'&&['pending','running'].includes(item.state))pending++
 }
 return{examined:items.length,qualifiedNew,duplicates,outsideProfile,pending}
}
export type RadarDiscoveryPageState={id:string;scopeKey:string;status:'reserved'|'received'|'admitted'|'uncertain'|'rejected';exhaustion:'more'|'exhausted'|'unknown';continuation?:Record<string,unknown>}
/** One choice per turn; executor must independently reserve rights/capacity. */
export function planRadarAdaptiveDiscoveryTurn(input:{plan:RadarAdaptiveDiscoveryPlan;requestedCount:number;items:RadarAdaptiveDiscoveryItem[];pages:RadarDiscoveryPageState[]}){
 z.number().int().positive().safe().parse(input.requestedCount)
 const counts=radarAdaptiveDiscoveryCounts(input.items)
 // Full-stage processing is not skipped just because the desired count is met.
 if(counts.pending)return{action:'research_pending' as const}
 if(input.items.some(item=>item.isNew&&item.qualification!=='not_target'&&item.state==='waiting'))return{stop:'awaiting_research_attention' as const,marketExhausted:false as const}
 if(counts.qualifiedNew>=input.requestedCount)return{stop:'target_reached' as const,marketExhausted:false as const}
 const saved=input.pages.find(page=>page.status==='received')
 if(saved)return{action:'admit_saved_page' as const,pageId:saved.id}
 if(input.pages.some(page=>page.status==='uncertain'))return{stop:'awaiting_reconciliation' as const,marketExhausted:false as const}
 if(input.pages.some(page=>page.status==='reserved'))return{stop:'awaiting_source_response' as const,marketExhausted:false as const}
 const eligible=input.plan.scopes.map((scope,order)=>({scope,order,pages:input.pages.filter(page=>page.scopeKey===scope.key)})).filter(item=>!item.pages.length||item.pages.at(-1)?.status==='admitted'&&item.pages.at(-1)?.exhaustion==='more')
 // Fair bounded turns within each configured source, not an endless first city.
 const priority=new Map<RadarDiscoverySource,number>()
 input.plan.scopes.forEach((scope,index)=>{if(!priority.has(scope.source))priority.set(scope.source,index)})
 eligible.sort((left,right)=>(priority.get(left.scope.source)??0)-(priority.get(right.scope.source)??0)||left.pages.length-right.pages.length||left.order-right.order)
 const next=eligible[0]
 if(next){
  const previous=next.pages.at(-1)
  if(previous&&!previous.continuation)return{stop:'awaiting_continuation' as const,marketExhausted:false as const}
  return{action:'discover' as const,scope:next.scope,...(previous?.continuation?{continuation:previous.continuation}:{})}
 }
 if(input.plan.nextScopeOffset!==null)return{action:'expand_plan_window' as const,offset:input.plan.nextScopeOffset}
 const incomplete=input.plan.coverageGaps.length||input.plan.omittedSources.length||input.pages.some(page=>page.status==='rejected'||page.exhaustion==='unknown')
 return{stop:incomplete?'coverage_incomplete' as const:'consulted_sources_exhausted' as const,marketExhausted:false as const}
}
