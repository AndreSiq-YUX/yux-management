import {z} from 'zod'
import {isIP} from 'node:net'
import {isPublicRadarSiteIp} from './osm-site-check.js'
import {validateRadarResearchContract} from './effect-receipts.js'
import type {BusinessMentionV1} from '../../contracts/generated/radarResearch.js'
const field=z.enum(['name','city','state','address','claimedTaxId','claimedWebsite','contact'])
const span=z.object({field,evidenceId:z.string().min(1).max(80),excerpt:z.string().min(2).max(1200)}).strict()
const contact=z.object({kind:z.enum(['email','phone','whatsapp','social']),value:z.string().min(1).max(300)}).strict()
const mention=z.object({name:z.string().min(2).max(240),location:z.object({city:z.string().min(1).max(200).optional(),state:z.string().min(1).max(80).optional(),address:z.string().min(1).max(500).optional()}).strict().nullish(),
 claimedTaxId:z.string().min(1).max(24).nullish(),claimedWebsite:z.string().max(2000).nullish(),contacts:z.array(contact).max(12),evidenceSpans:z.array(span).min(1).max(24),subjectScope:z.enum(['company','group','establishment']),
 schemaVersion:z.literal(1).optional(),needsVerification:z.literal(true).optional(),sourceUrl:z.string().nullish(),observedAt:z.string().nullish()}).strict()
export type RadarDiscoveryDocument={id:string;source_url:string;text:string;kind:'institutional_candidate'|'directory'|'third_party'|'social';observed_at:string;canPersist?:boolean}
function isBusinessMention(value:unknown):value is BusinessMentionV1{return validateRadarResearchContract(value)&&value!==null&&typeof value==='object'&&'needsVerification' in value}
const documentSchema=z.object({id:z.string().min(1).max(60),source_url:z.string().max(2000),text:z.string().min(1),kind:z.enum(['institutional_candidate','directory','third_party','social']),observed_at:z.iso.datetime(),canPersist:z.boolean().optional()}).strict()
export function publicRadarDiscoveryUrl(value:string){
 try{const url=new URL(value),hostname=url.hostname.toLowerCase().replace(/\.$/,'');return ['http:','https:'].includes(url.protocol)&&!url.username&&!url.password&&(!url.port||['80','443'].includes(url.port))&&/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i.test(hostname)&&!hostname.endsWith('.localhost')&&!hostname.endsWith('.local')&&!hostname.endsWith('.internal')&&(!isIP(hostname)||isPublicRadarSiteIp(hostname))}catch{return false}
}
function validContact(value:z.infer<typeof contact>){
 const phone=/^\+?[\d(). -]+$/.test(value.value)&&value.value.replace(/\D/g,'').length>=8&&value.value.replace(/\D/g,'').length<=15
 if(value.kind==='email')return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.value)
 if(value.kind==='phone')return phone
 if(value.kind==='social')return publicRadarDiscoveryUrl(value.value)
 if(phone)return true
 if(!publicRadarDiscoveryUrl(value.value))return false
 return ['wa.me','api.whatsapp.com','whatsapp.com','www.whatsapp.com'].includes(new URL(value.value).hostname.toLowerCase())
}
/** Pure validation, not admission. Even a quoted contact still needs identity verification. */
export function validateRadarBusinessMentions(value:unknown,document:RadarDiscoveryDocument):BusinessMentionV1[]{
 const parsed=z.object({mentions:z.array(mention).max(50)}).strict().safeParse(value)
 if(!parsed.success)throw Error('radar_discovery_extraction_invalid_response')
 if(!publicRadarDiscoveryUrl(document.source_url))throw Error('radar_discovery_document_unsafe')
 return parsed.data.mentions.flatMap(item=>{
  const spans=item.evidenceSpans.filter(proof=>proof.evidenceId===document.id&&document.text.includes(proof.excerpt))
  const supports=(key:z.infer<typeof field>,value:string)=>spans.some(proof=>proof.field===key&&proof.excerpt.includes(value)&&(key==='name'||proof.excerpt.includes(item.name)))
  if(!supports('name',item.name))return[]
  if(item.sourceUrl&&item.sourceUrl!==document.source_url||item.observedAt&&item.observedAt!==document.observed_at)throw Error('radar_discovery_extraction_invalid_response')
  const location=Object.fromEntries(Object.entries(item.location??{}).filter(([key,value])=>supports(key as 'city'|'state'|'address',value)))
  const claimedTaxId=item.claimedTaxId&&supports('claimedTaxId',item.claimedTaxId)?item.claimedTaxId:undefined
  const claimedWebsite=item.claimedWebsite&&supports('claimedWebsite',item.claimedWebsite)&&publicRadarDiscoveryUrl(item.claimedWebsite)&&(document.kind==='institutional_candidate'||new URL(item.claimedWebsite).origin!==new URL(document.source_url).origin)?item.claimedWebsite:undefined
  // Publisher channels, including a short directory's nearby footer, are not
  // prospect contacts. Recover from independently associated sources later.
  const contacts=document.kind==='institutional_candidate'?item.contacts.filter(contact=>supports('contact',contact.value)&&validContact(contact)):[]
  const retained:Record<string,string>={name:item.name,...location,...(claimedTaxId?{claimedTaxId}:{}),...(claimedWebsite?{claimedWebsite}:{})}
  const result={schemaVersion:1 as const,name:item.name,...(Object.keys(location).length?{location}:{}),...(claimedTaxId?{claimedTaxId}:{}),...(claimedWebsite?{claimedWebsite}:{}),contacts,sourceUrl:document.source_url,observedAt:document.observed_at,
   subjectScope:item.subjectScope,needsVerification:true as const,evidenceSpans:spans.filter(proof=>proof.field==='contact'?contacts.some(contact=>proof.excerpt.includes(contact.value)&&proof.excerpt.includes(item.name)):!!retained[proof.field]&&proof.excerpt.includes(retained[proof.field])&&(proof.field==='name'||proof.excerpt.includes(item.name)))}
  if(!isBusinessMention(result))throw Error('radar_discovery_extraction_contract_invalid')
  return[result]
 })
}
export function prepareRadarDiscoveryDocument(value:RadarDiscoveryDocument,offsetBytes=0){
 const document=documentSchema.parse(value)
 if(!publicRadarDiscoveryUrl(document.source_url))throw Error('radar_discovery_document_unsafe')
 const bytes=Buffer.from(document.text)
 if(!Number.isSafeInteger(offsetBytes)||offsetBytes<0||offsetBytes>=bytes.length||(bytes[offsetBytes]&0xc0)===0x80)throw Error('radar_discovery_offset_invalid')
 let end=Math.min(bytes.length,offsetBytes+8000)
 while(end<bytes.length&&(bytes[end]&0xc0)===0x80)end--
 const text=bytes.subarray(offsetBytes,end).toString('utf8')
 let next=end<bytes.length?end-Math.min(2048,Math.floor((end-offsetBytes)/2)):null
 if(next!==null)while(next>offsetBytes&&(bytes[next]&0xc0)===0x80)next--
 return{contentVersion:1 as const,offsetBytes,nextOffsetBytes:next,document:{...document,source_url:new URL(document.source_url).toString(),id:offsetBytes?`${document.id.slice(0,40)}@${offsetBytes}`:document.id,text}}
}
export async function extractRadarBusinesses(input:{document:RadarDiscoveryDocument;offsetBytes?:number;region:Record<string,unknown>;criteria:Record<string,unknown>;requestId:string;tenant:{organizationId:string;clientId?:string;contractId?:string};enabled:boolean},dependencies:{runtime:(path:string,payload:Record<string,unknown>)=>Promise<unknown>}){
 if(!input.enabled||input.document.canPersist!==true)throw Error('radar_discovery_extraction_not_authorized')
 z.uuid().parse(input.tenant.organizationId);z.string().min(1).max(200).parse(input.requestId)
 const prepared=prepareRadarDiscoveryDocument(input.document,input.offsetBytes)
 if(Buffer.byteLength(JSON.stringify({criteria:input.criteria,region:input.region}))>4000)throw Error('radar_discovery_criteria_too_large')
 // Observation time belongs to the read evidence, not the paid model input.
 // Re-reading identical content must not conflict with an existing receipt.
 const {canPersist:_canPersist,observed_at:_observedAt,...document}=prepared.document
 const response=await dependencies.runtime('/radar/extract-businesses',{organization_id:input.tenant.organizationId,client_id:input.tenant.clientId??null,contract_id:input.tenant.contractId??null,enabled:true,request_id:input.requestId,context_version:1,document,region:input.region,criteria:input.criteria})
 const usage=z.object({inputTokens:z.number().int().nonnegative().nullish(),outputTokens:z.number().int().nonnegative().nullish(),costUsd:z.number().finite().nonnegative().nullish()}).strict().nullish().catch(null)
 const envelope=z.object({mentions:z.array(z.unknown()),provider:z.string().max(200).nullish().catch(null),model:z.string().max(200).nullish().catch(null),usage}).strict().parse(response)
 return{...prepared,mentions:validateRadarBusinessMentions({mentions:envelope.mentions},prepared.document),analysis:{provider:envelope.provider??null,model:envelope.model??null,usage:envelope.usage??null}}
}
