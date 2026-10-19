import {z} from 'zod'
import type {AuthUser} from '../../auth/routes.js'
import {projectRadarCompanyFacts} from './company-projection.js'
import {radarCommercialStatusSchema} from './commercial-status.js'

export const canViewRadarInternals=(user:Pick<AuthUser,'role'>)=>user.role==='yux_admin'
const object=(value:unknown):Record<string,unknown>=>value!==null&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{}
const text=z.string().optional().catch(undefined)
const number=z.number().finite().optional().catch(undefined)
const bool=z.boolean().optional().catch(undefined)
// Applied only to generated narratives/operational notes, never company identity or user campaign copy.
const internalNarrative=/\b(?:openrouter|openai|serper|cnpj[aá]|jina|brave|gemini|qwen|playwright|bullmq|redis|tokens?|embeddings?)(?:\b|_)|radar_[a-z_]+|api[_ -]?key|provider[_ -]|stacktrace|robots_unavailable/i
export const radarCommercialText=(value:unknown)=>typeof value==='string'&&!internalNarrative.test(value)?value:undefined
// Business identity/contact/evidence is not an operational provider disclosure.
export function radarCommercialCompanyText(value:unknown,identities:string[]=[]){
 if(typeof value!=='string')return
 const cleaned=value.replace(/https?:\/\/[^\s\])]+/gi,link=>radarCommercialUrl(link)??'')
 let inspected=cleaned.replace(/https?:\/\/[^\s\])]+/gi,'').replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g,'')
 for(const identity of identities.filter(name=>name.length>=3))inspected=inspected.replace(new RegExp(identity.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'gi'),'')
 return radarCommercialText(inspected)===undefined?undefined:cleaned
}
const narrative=text.transform(radarCommercialText)
const texts=z.array(z.string()).optional().catch(undefined)
const narratives=z.array(narrative).optional().catch(undefined).transform(items=>items?.filter((item):item is string=>item!==undefined))
export function radarCommercialUrl(value:unknown){
 if(typeof value!=='string')return
 try{const url=new URL(value);if(!['http:','https:'].includes(url.protocol)||url.username||url.password)return
  if(/(^|\.)(?:brave\.com|serper\.dev|jina\.ai|openrouter\.ai|cnpja\.com|cnpja\.ws|openai\.com)$/.test(url.hostname))return
  if([...url.searchParams.keys()].some(key=>/^(?:api[_-]?key|token|secret|key|signature|authorization)$/i.test(key)))return
  return value
 }catch{return}
}
const url=text.transform(radarCommercialUrl)
const claim=z.object({value:narrative,sourceUrl:url,observedAt:text,referenceDate:text,scope:text}).strip()
const claims=z.array(claim).optional().catch(undefined).transform(items=>items?.filter(item=>!!item.value))
const profile=z.object({summary:claim.optional().catch(undefined),services:claims,customerSegments:claims,operatingRegions:claims,
 scaleSignals:z.array(z.object({value:narrative,sourceUrl:url,referenceDate:text,scope:text}).strip()).optional().catch(undefined)}).strip()
const contact=z.object({kind:text,value:text,association:text,scope:text,sourceUrl:url,observedAt:text,purpose:text,preferred:bool,
 sources:z.array(z.object({sourceUrl:url,observedAt:text}).strip()).optional().catch(undefined)}).strip()
const contacts=z.array(contact).optional().catch(undefined)
const activity=z.object({status:text,limitation:narrative,signals:z.array(z.object({excerpt:narrative,sourceUrl:url,observedAt:text,publishedDate:text}).strip()).optional().catch(undefined),
 presenceSignals:z.array(z.object({kind:text,excerpt:narrative,sourceUrl:url,observedAt:text,association:text,scope:text}).strip()).optional().catch(undefined)}).strip()
const size=z.object({score:number,evidenceCoverage:number,direction:text,contributions:z.array(z.object({metric:text,amount:number,points:number,weight:number,sourceUrl:url,referenceDate:text}).strip()).optional().catch(undefined)}).strip()
const quality=z.object({identity:text,contactability:text,fit:text,readyForReview:bool,missing:texts,potential:z.object({score:number,coverage:number}).strip().optional().catch(undefined)}).strip()
const previousFacts=z.object({websiteUrl:url,observedAt:text,contacts,profile:profile.optional().catch(undefined)}).strip()
const factsSchema=z.object({cnpj:text,legalName:text,tradeName:text,city:text,state:text,address:text,cnaes:texts,cnaeMain:text,registrationStatus:text,openingDate:text,
 refreshIncomplete:bool,siteObservedAt:text,previousResearch:previousFacts.optional().catch(undefined),
 websiteUrl:url,websiteStatus:text,registryPhone:text,contacts,profile:profile.optional().catch(undefined),activity:activity.optional().catch(undefined),sizeAssessment:size.optional().catch(undefined),
 documents:z.array(z.object({url,sourceUrl:url}).strip()).optional().catch(undefined),
 targetStatus:text,productFit:text,quality:quality.optional().catch(undefined),reasons:narratives}).strip()
export type RadarCommercialFacts=z.infer<typeof factsSchema>
export function radarCommercialFactsSchemaForCompany(identities:string[]){
 const value=text.transform(input=>radarCommercialCompanyText(input,identities)),companyClaim=claim.extend({value})
 const companyClaims=z.array(companyClaim).optional().catch(undefined).transform(items=>items?.filter(item=>!!item.value))
 return factsSchema.extend({profile:profile.extend({summary:companyClaim.optional().catch(undefined),services:companyClaims,customerSegments:companyClaims,operatingRegions:companyClaims,
  scaleSignals:z.array(z.object({value,sourceUrl:url,referenceDate:text,scope:text}).strip()).optional().catch(undefined)}).optional().catch(undefined),
  activity:activity.extend({limitation:value,signals:z.array(z.object({excerpt:value,sourceUrl:url,observedAt:text,publishedDate:text}).strip()).optional().catch(undefined),
   presenceSignals:z.array(z.object({kind:text,excerpt:value,sourceUrl:url,observedAt:text,association:text,scope:text}).strip()).optional().catch(undefined)}).optional().catch(undefined)})
}
export function projectRadarCommercialFacts(payload:unknown):RadarCommercialFacts{
 const data=projectRadarCompanyFacts(object(payload)),presence=object(data.publicPresence),website=object(presence.website)
 const identities=[data.legalName,data.tradeName].filter((value):value is string=>typeof value==='string')
 const prior=object(data.previousResearch)
 return radarCommercialFactsSchemaForCompany(identities).parse({...data,websiteUrl:website.url??data.siteFinalUrl??data.websiteUrl,registryPhone:data.phoneRaw,
  siteObservedAt:website.observedAt??data.siteCheckedAt,refreshIncomplete:data.researchRefreshIncomplete,previousResearch:prior.belongsToCurrentIdentity===true?{websiteUrl:prior.websiteUrl,observedAt:prior.siteCheckedAt,contacts:prior.publicContacts,profile:prior.companyProfile}:undefined,
  contacts:data.publicContacts??presence.contacts,profile:data.companyProfile,activity:data.activityAssessment??data.activity,quality:data.researchQuality,reasons:data.triageReasons})
}
const base={id:text,organizationId:text,campaignId:text,status:text,createdAt:text,updatedAt:text}
const campaignSchema=z.object({...base,name:text,campaignType:text,targetSegment:text,targetCity:text,targetState:text,targetStates:texts,targetKeywords:texts,targetCnaes:texts,productFocus:texts,offerType:text,configurationRevision:number,commercialCriteriaRevision:number,
 criteria:z.object({cities:z.array(z.object({city:text,state:text}).strip()).optional().catch(undefined),includeAnyTerms:texts,includeAllTerms:texts,excludeTerms:texts,productTerms:texts,productMatch:text,openingFrom:text,openingTo:text}).strip()}).strip()
export type RadarCommercialCampaign=z.infer<typeof campaignSchema>
const candidateSchema=z.object({...base,title:text,configurationRevision:number,approvedAt:text,crmLeadId:text,importedOpportunityId:text,importedCompanyRecordId:text,
 targetStatus:text,productFit:text,pendingMessage:text,facts:factsSchema}).strip()
export type RadarCommercialCandidate=z.infer<typeof candidateSchema>
const countShape={requested:number,admitted:number,researching:number,completed:number,insufficient:number,blocked:number}
const captureSchema=z.object({...base,configurationRevision:number,counts:z.object(countShape).strip(),pendingMessage:text}).strip()
export type RadarCommercialCapture=z.infer<typeof captureSchema>
const assessmentSchema=z.object({targetStatus:text,productFit:text,reasons:narratives}).strip()
const researchSchema=z.object({configurationRevision:number,status:text,updatedAt:text,pendingMessage:text,facts:factsSchema,feedback:radarCommercialStatusSchema.optional().catch(undefined),assessment:assessmentSchema.optional().catch(undefined)}).strip()
export type RadarCommercialResearch=z.infer<typeof researchSchema>
const metricSchema=z.object({companies:number,opportunities:number,enriched:number,reviewPending:number,approved:number,converted:number,optedOut:number,
 identified:number,withUsefulContact:number,readyForReview:number,period:z.object({from:text,to:text,timeZone:text}).strip().optional().catch(undefined)}).strip()
export type RadarCommercialMetrics=z.infer<typeof metricSchema>
const map=(value:unknown,fn:(item:unknown)=>unknown)=>Array.isArray(value)?value.map(fn):fn(value)
const pending='Pesquisa aguardando a equipe responsável'
const candidate=(value:unknown)=>{const row=object(value)
 // This source requires attribution. Do not silently strip its license while redistributing its facts.
 const restricted=row.sourceType==='osm_extract'
 const raw=object(row.normalizedPayload??row.facts),facts=restricted?{}:projectRadarCommercialFacts({...raw,tradeName:raw.tradeName??row.title})
 // facts were already deeply projected using the company's own identity context.
 return {...candidateSchema.omit({facts:true}).parse({...row,pendingMessage:restricted?'Dados aguardam liberação para entrega':undefined}),facts}
}
const companySchema=z.object({id:text,organizationId:text,cnpj:text,legalName:text,tradeName:text,cnaeMain:text,city:text,state:text,address:text,phoneRaw:text,emailRaw:text,websiteUrl:url,createdAt:text,updatedAt:text}).strip()
const diagnosticSchema=z.object({id:text,summary:narrative,detectedServices:narratives,detectedChannels:narratives,painHypotheses:narratives,recommendedOffer:narrative,riskFlags:narratives,createdAt:text}).strip()
const opportunitySchema=z.object({...base,companyRecordId:text,priority:text,convertedLeadId:text,canConvertToLead:bool,company:companySchema.optional().catch(undefined),latestDiagnostic:diagnosticSchema.optional().catch(undefined),
 latestScore:z.object({id:text,totalScore:number,fitScore:number,timingScore:number,painScore:number,contactabilityScore:number,budgetScore:number,personalizationScore:number,explanation:narrative}).strip().optional().catch(undefined),
 latestMessageSuggestion:z.object({id:text,channel:text,subject:narrative,body:narrative,status:text,createdAt:text}).strip().optional().catch(undefined)}).strip()
const opportunity=(value:unknown)=>{const row=object(value),message=object(row.latestMessageSuggestion),policy=object(message.policyDecision)
 return opportunitySchema.parse({...row,canConvertToLead:row.status==='approved'&&!row.convertedLeadId&&message.status==='approved'&&policy.canSendAutomatically===false&&policy.canConvertToLead===true,...(object(row.company).sourceType==='osm_extract'?{company:undefined}: {})})}
const historySchema=z.object({id:text,candidateId:text,companyName:text,configurationRevision:number,status:text,updatedAt:text,actionLabel:text}).strip()
const feedbackSchema=z.object({id:text,candidateId:text,configurationRevision:number,kind:text,note:narrative,createdAt:text,contact:z.object({kind:text,value:text}).strip().optional().catch(undefined)}).strip()
export type RadarCommercialSurface='campaigns'|'candidates'|'opportunities'|'duplicates'|'research'|'capture'|'researchHistory'|'feedback'|'metrics'|'researchMetrics'|'crmDelivery'|'import'|'review'|'lead'|'destinations'|'progress'|'researchRequest'|'latestResearchRequest'
export function projectRadarCommercialResponse(surface:RadarCommercialSurface,payload:unknown):unknown{
 if(payload===null)return null
 const row=object(payload)
 switch(surface){
  case 'latestResearchRequest':return{request:row.request?projectRadarCommercialResponse('researchRequest',row.request):null}
  case 'researchRequest':return z.object({requestId:z.uuid(),campaignId:z.uuid().optional(),state:z.enum(['accepted','running','waiting','unchanged','completed']),items:z.array(z.object({candidateId:z.uuid(),state:z.enum(['accepted','running','waiting','unchanged','completed']),message:narrative,feedback:radarCommercialStatusSchema.optional().catch(undefined)}).strip())}).strip().parse(row)
  case 'campaigns':if('campaign' in row)return{campaign:projectRadarCommercialResponse('campaigns',row.campaign),criteriaChanged:row.criteriaChanged===true}
   return map(payload,item=>{const r=object(item),config=object(r.searchConfiguration);return campaignSchema.parse({...r,criteria:{...object(config.qualification),cities:config.cities,openingFrom:config.openingFrom,openingTo:config.openingTo}})})
  case 'candidates':return map(payload,candidate)
  case 'opportunities':case 'review':return map(payload,opportunity)
  case 'metrics':case 'researchMetrics':return metricSchema.parse(row)
  case 'capture':if('operation' in row)return{operation:row.operation===null?null:projectRadarCommercialResponse('capture',row.operation)}
   return captureSchema.parse({...row,pendingMessage:row.status==='blocked'?pending:undefined})
  case 'research':{const run=object(row.run),out=object(run.output),qualification=object(out.qualification),identity=object(row.companyIdentity)
   const priorFacts=projectRadarCommercialFacts({previousResearch:row.previousResearch,researchRefreshIncomplete:row.researchRefreshIncomplete})
   const facts=projectRadarCommercialFacts({tradeName:identity.tradeName,legalName:identity.legalName,websiteUrl:object(out.discovery).websiteUrl,websiteStatus:object(out.discovery).websiteUrl?(out.siteAssociation==='confirmed'?'verified_present':'unverified'):undefined,phoneRaw:out.registryPhone,documents:out.documents,publicContacts:out.contacts,companyProfile:out.profile,activityAssessment:out.activity,sizeAssessment:out.sizeAssessment,researchQuality:out.quality})
   return {...researchSchema.omit({facts:true}).parse({configurationRevision:row.configurationRevision,status:run.status,updatedAt:run.updated_at,pendingMessage:run.status==='blocked'||run.status==='failed'?pending:undefined,assessment:qualification,feedback:row.commercialStatus}),facts:{...facts,previousResearch:priorFacts.previousResearch,refreshIncomplete:priorFacts.refreshIncomplete}}}
  case 'researchHistory':return map(payload,item=>{const r=object(item);return historySchema.parse({...r,actionLabel:({complete:'Pesquisa completa',resume:'Retomada da pesquisa',refresh:'Atualização da pesquisa',reanalyze:'Reavaliação dos dados salvos'} as Record<string,string>)[String(r.operation)]??'Pesquisa da empresa'})})
  case 'feedback':return map(payload,item=>{const r=object(item);return feedbackSchema.parse({...r,candidateId:r.candidateId??r.candidate_id,configurationRevision:r.configurationRevision??r.configuration_revision,createdAt:r.createdAt??r.created_at})})
  case 'duplicates':return map(payload,item=>z.object({...base,duplicateType:text,companyRecordId:text,matchedCompanyRecordId:text,confidence:number}).strip().parse(item))
  case 'destinations':return map(payload,item=>z.object({crmInstanceId:text,pipelineId:text,stageId:text,pipelineName:text,stageName:text}).strip().parse(item))
  case 'progress':return z.object({candidates:number,checked:number,confirmed:number,approved:number}).strip().parse(row)
  case 'crmDelivery':return{items:(Array.isArray(row.items)?row.items:[]).map(item=>{const r=object(item);return z.object({candidateId:text,status:text,leadId:text,pipelineId:text,message:text}).strip().parse({...r,message:r.status==='blocked'?'Revise a empresa e a autorização de entrega antes de enviar.':undefined})})}
  case 'lead':return z.object({...base,leadId:text,name:text,company:text,email:text,phone:text,pipelineId:text,stageId:text}).strip().parse(row)
  case 'import':return{candidate:row.candidate?candidate(row.candidate):undefined,company:row.company?companySchema.parse(row.company):undefined,opportunity:row.opportunity?opportunity(row.opportunity):undefined,
   imported:Array.isArray(row.imported)?row.imported.map(opportunity):undefined,analyzed:Array.isArray(row.analyzed)?row.analyzed.map(opportunity):undefined,enriched:Array.isArray(row.enriched)?row.enriched.map(opportunity):undefined}
 }
}

// Explicit route matrix. New endpoints are internal until a commercial schema is chosen.
const surfaces:Record<string,RadarCommercialSurface>={
 'GET /campaigns':'campaigns','POST /campaigns':'campaigns','PATCH /campaigns/:id':'campaigns','POST /campaigns/:id/duplicate':'campaigns',
 'POST /campaigns/:id/research-requests':'researchRequest','GET /campaigns/:id/research-requests/:requestId':'researchRequest','POST /candidates/:id/research':'researchRequest',
 'GET /campaigns/:id/research-requests/latest':'latestResearchRequest',
 'GET /campaigns/:id/candidates':'candidates','GET /campaigns/:id/b2b-prospects':'candidates','POST /candidates/:id/discard':'candidates',
 'GET /campaigns/:id/capture-operations/latest':'capture','GET /capture-operations/:id':'capture','GET /candidates/:id/research':'research',
 'GET /campaigns/:id/research-history':'researchHistory','GET /campaigns/:id/metrics':'metrics','GET /campaigns/:id/research-metrics':'researchMetrics',
 'GET /campaigns/:id/b2b-progress':'progress','GET /campaigns/:id/opportunities':'opportunities','GET /campaigns/:id/duplicates':'duplicates','PATCH /duplicates/:id':'duplicates',
 'GET /candidates/:id/feedback':'feedback','POST /candidates/:id/feedback':'feedback','GET /crm-destinations':'destinations','POST /campaigns/:id/deliver-to-crm':'crmDelivery',
 'POST /campaigns/:id/companies':'import','POST /campaigns/:id/import-csv':'import','POST /campaigns/:id/import-urls':'import','POST /candidates/:id/import':'import',
 'PATCH /opportunities/:id/review':'review','POST /opportunities/:id/opt-out':'review','POST /opportunities/:id/convert-to-lead':'lead',
 'POST /opportunities/:id/run-analysis':'import','POST /opportunities/batch/analyze':'import','POST /opportunities/batch/enrich':'import',
}
export function radarCommercialSurface(method:string,path:string):RadarCommercialSurface|null{return surfaces[`${method==='HEAD'?'GET':method} ${path.replace(/^\/api\/radar/,'')}`]??null}
