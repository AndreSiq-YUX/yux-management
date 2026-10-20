import type {BusinessMentionV1} from '../../contracts/generated/radarResearch.js'
import {searchRadarWeb,normalizeSavedRadarWeb,type RadarWebHit} from './web-search.js'
import {searchRadarPlaces,normalizeSavedRadarPlaces,type RadarPlaceSearchInput} from './place-providers.js'
import {searchCnpjaAdvancedPage,normalizeSavedCnpjaSearchPage,type CnpjaAdvancedSearchInput,type CnpjaCandidate} from './cnpjaClient.js'
import {normalizeValidRadarCnpj,type RadarBusinessVerification,type RadarExternalIdentity} from './entity-resolution.js'
import type {RadarDiscoveryScopeV2} from './discovery-plan.js'
import {publicRadarDiscoveryUrl} from './discovery-extraction.js'

export type DiscoveryCandidate={mention:BusinessMentionV1;verification?:RadarBusinessVerification;externalKey?:RadarExternalIdentity;registry?:CnpjaCandidate}
export type RadarDiscoveryPage={candidates:DiscoveryCandidate[];documents:RadarWebHit[];continuation?:Record<string,unknown>;exhaustion:'more'|'exhausted'|'unknown'}
export type RadarDiscoveryTransportInput={scope:RadarDiscoveryScopeV2;pageSize:number;apiKey:string;continuation?:Record<string,unknown>;registryFilters?:Partial<CnpjaAdvancedSearchInput>;onResponse?:(body:unknown)=>Promise<void>}
const mention=(name:string,sourceUrl:string,location?:BusinessMentionV1['location']):BusinessMentionV1=>({schemaVersion:1,name,sourceUrl,observedAt:new Date().toISOString(),subjectScope:'establishment',needsVerification:true,contacts:[],evidenceSpans:[{field:'name',evidenceId:'discovery-record',excerpt:name}],...(location?{location}:{})})
export function radarRegistryDiscoveryCandidate(item:CnpjaCandidate):DiscoveryCandidate|undefined{
 const name=item.tradeName||item.legalName;if(!name)return
 const taxId=normalizeValidRadarCnpj(item.taxId),sourceUrl=item.sourceUrl&&publicRadarDiscoveryUrl(item.sourceUrl)?item.sourceUrl:`https://cnpja.com/office/${item.taxId??''}`
 const result=mention(name,sourceUrl,{...(item.city?{city:item.city}:{}),...(item.state?{state:item.state}:{}),...(item.address?{address:item.address}:{})})
 if(taxId){result.claimedTaxId=taxId;result.evidenceSpans.push({field:'claimedTaxId',evidenceId:'registry-record',excerpt:taxId})}
 return{mention:result,registry:item,...(taxId?{verification:{taxId:{value:taxId,subjectName:name,subjectScope:'establishment',sourceRole:'registry',evidenceId:'registry-record',location:result.location}}}: {})}
}
/** Transport/normalization only. Caller owns reservation, rights and durable
 * response capture. No legacy repository admission is called here. */
export async function discoverRadarProviderPage(input:RadarDiscoveryTransportInput,dependencies:{web?:typeof searchRadarWeb;places?:typeof searchRadarPlaces;registry?:typeof searchCnpjaAdvancedPage;osm?:()=>Promise<RadarDiscoveryPage>}={}):Promise<RadarDiscoveryPage>{
 if(input.continuation?.restartAuthorization)input={...input,continuation:undefined}
 const {scope}=input
 if(scope.source==='osm_extract'){
  if(!dependencies.osm)throw Error('radar_osm_coverage_unavailable')
  return dependencies.osm()
 }
 if(scope.source==='cnpja_advanced_search'){
  const token=input.continuation?.token
  if(token!==undefined&&typeof token!=='string')throw Error('radar_discovery_continuation_invalid')
  const result=await(dependencies.registry??searchCnpjaAdvancedPage)({...input.registryFilters,apiKey:input.apiKey,state:scope.state,city:scope.city,limit:input.pageSize,token:token as string|undefined,onResponse:input.onResponse,preserveAllResults:true})
  return{candidates:result.candidates.flatMap(item=>{const value=radarRegistryDiscoveryCandidate(item);return value?[value]:[]}),documents:[],...(result.nextToken?{continuation:{token:result.nextToken}}:{}),exhaustion:result.nextToken?'more':'exhausted'}
 }
 if(scope.source==='brave_place_search'||scope.source==='serper_places'){
  if(!scope.city)throw Error('radar_discovery_city_coverage_required')
  if(input.continuation)throw Error('radar_discovery_continuation_unsupported')
  const places=await(dependencies.places??searchRadarPlaces)({provider:scope.source,apiKey:input.apiKey,query:scope.term,city:scope.city,state:scope.state,limit:Math.min(10,input.pageSize),onResponse:input.onResponse,preserveAllResults:true} as RadarPlaceSearchInput)
  return{candidates:places.flatMap(place=>{
   const sourceUrl=place.sourceUrl||place.websiteUrl
   if(!sourceUrl||!publicRadarDiscoveryUrl(sourceUrl))return[]
   const value=mention(place.name,sourceUrl)
   if(place.websiteUrl&&publicRadarDiscoveryUrl(place.websiteUrl)){value.claimedWebsite=place.websiteUrl;value.evidenceSpans.push({field:'claimedWebsite',evidenceId:'discovery-record',excerpt:place.websiteUrl})}
   // Place IDs may be temporary; never make them registry/business identities.
   return[{mention:value}]
  }),documents:[],exhaustion:'unknown'}
 }
 if(input.continuation)throw Error('radar_discovery_continuation_unsupported')
 const documents=await(dependencies.web??searchRadarWeb)({provider:scope.source,apiKey:input.apiKey,query:scope.query,limit:Math.min(10,input.pageSize),onResponse:input.onResponse})
 return{candidates:[],documents,exhaustion:'unknown'}
}
/** Free normalization of a captured reply. No transport, credential or debit. */
export async function normalizeSavedRadarDiscoveryPage(input:RadarDiscoveryTransportInput,body:unknown){
 if(body===null||typeof body!=='object')throw Error('radar_discovery_response_invalid')
 const row=body as Record<string,unknown>
 if('unparsed' in row||'truncated' in row)throw Error('radar_discovery_response_invalid')
 const recordArray=(value:unknown)=>Array.isArray(value)||!!value&&typeof value==='object'&&['data','results','items','offices','records'].some(key=>Array.isArray((value as Record<string,unknown>)[key]))
 if(input.scope.source==='cnpja_advanced_search'&&!recordArray(body)&&![row.records,row.offices,row.results,row.items,row.data].some(recordArray))throw Error('radar_discovery_response_invalid')
 return discoverRadarProviderPage({...input,apiKey:''},{registry:async()=>normalizeSavedCnpjaSearchPage(body),places:async value=>normalizeSavedRadarPlaces(value.provider,body),web:async value=>normalizeSavedRadarWeb(value,body)})
}
