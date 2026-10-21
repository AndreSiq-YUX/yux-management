import type pg from 'pg'
import {classifyRadarSource,isRadarInstitutionalSource,hasRadarOwnershipSignal} from './source-identity.js'
import {validateRadarPresenceResolution,type RadarPresenceEvidence,type RadarPresenceResolution} from './presence-resolution.js'
import { createHash, randomUUID } from 'node:crypto'
import {resolveRadarSearchCapacity,hasRadarSearchCapacity,type RadarSearchCapacity,type RadarSearchSource,type RadarWebSearchSource} from './search-capacity.js'
import {sanitizeRadarEffectBody} from './effect-receipts.js'
import type { AppEnv } from '../../config/env.js'
import type { AuthUser } from '../../auth/routes.js'
import { requireRadarScope } from './access.js'
import { findRadarDataSource, evaluateRadarSourceGovernance, recordRadarSourceUsage, isRadarEnabledOrganization } from './repository.js'
import { getRadarResearchAvailability } from './research-availability.js'
import { normalizeRadarText,resolveRadarSearchConfiguration, type RadarSearchConfiguration } from './search-configuration.js'
import {extractRadarCnpjIdentifiers,normalizeRadarCnpjIdentifier} from './cnpj-identifier.js'
import { discoverRadarBusinessPresence, matchRadarBusinessIdentity, isRadarReferenceUrl, type RadarBusinessIdentity, type RadarPresenceDiscovery } from './site-discovery.js'
import { collectRadarSiteEvidence, radarHtmlLinks, isRetryableRadarPage, RADAR_READER_VERSION, type RadarSiteEvidence } from './site-evidence.js'
import { extractRadarContacts,isRadarContactSource, type RadarContactEvidence } from './contact-evidence.js'
import { assessRadarBusinessActivity } from './business-activity.js'
import { searchRadarWeb,normalizeSavedRadarWeb, type RadarWebHit,type RadarWebSearchProvider } from './web-search.js'
import { searchRadarPlaces } from './place-providers.js'
import { loadPlatformProviderSecret } from '../platform/adminRepository.js'
import { assertLicensedBraveRetention } from './licensed-brave.js'
import { invokeAgentRuntime } from '../../lib/agent-runtime-client.js'
import { triageRadarBusiness } from './business-triage.js'
import { validateRadarCompanyProfileClaims, type RadarCompanyProfile } from './company-profile.js'
import { assessRadarCompanySize, registryRadarSizeFacts, type RadarSizeFact } from './company-size.js'
import {getRadarTlsReadOptions,listRadarTlsExceptions,radarTlsDiagnosticId} from './tls-exception-service.js'
import type {RadarTlsReadOptions} from './site-tls-exception.js'
import {projectRadarPublicPresence,radarPublicPresenceFromDossier} from './public-presence.js'
import {collectRadarPublicSocialEvidence,isRadarPublicProfile} from './public-social-evidence.js'
import {pendingRadarReadUrls,canonicalRadarReadUrl} from './research-checkpoint.js'
import {reconcileRadarCaptureItems} from './capture-reconciliation.js'
import {assessRadarCaptureResearch,assessRadarFunnelResearch} from './capture-research-state.js'
import {projectRadarCommercialResearchStatus} from './commercial-status.js'
import {radarEvidenceContentHash,radarEvidenceBindings,radarEvidenceBindingMatch,remapRadarEvidenceResult,persistedRadarEvidenceVersion,canonicalRadarAnalysisEvidence,radarAnalysisDependencies,radarDependencyBindingMatch,radarResearchDependencyVersions,type RadarEvidenceVersion,type RadarEvidenceBindings} from './evidence-version.js'
import {mergeRadarCompanyResearch,radarCompanyProjectionVersion,projectRadarCompanyFacts,radarPayloadIdentityHash} from './company-projection.js'
import {resolveRadarAnalysisRetry,type RadarAnalysisRetryBinding} from './analysis-retry-authorizations.js'
import {loadRadarResearchIntentBudget,frozenRadarCostPolicy} from './research-budget.js'
import {loadRadarOperationalLimits} from './operational-limits.js'
import {estimateRadarCostBrl,compareRadarDecimal,addRadarDecimal,radarReportedCostAmount,type RadarCostEstimate,type RadarCostPolicy} from './cost-conversion.js'
import {hasUsefulRadarHits,planRadarResearch} from './research-planner.js'
import {consolidateRadarContacts} from './contact-consolidation.js'
import {evaluateRadarResearchQuality,usefulRadarDeliveryContacts,type RadarResearchQuality} from './research-quality.js'
import {decideRadarAction,radarDecisionHash} from './decision-service.js'
import type {DecisionContextV1} from './decision-contracts.js'
import {planRadarAdaptiveResearch,RadarAdaptiveTurnYield,rethrowRadarAdaptiveYield} from './adaptive-research.js'
import {researchRadarGaps} from './deep-research.js'
import {inspectRadarBusinessSite} from './b2b-site-inspection.js'
import {runRadarFunnelDiscovery,isRadarFunnelAgentEligible,type RadarFunnelResearchState,type RadarFunnelDecision} from './funnel-discovery.js'
import {evaluateRadarRegistryRules,type RadarRegistryGateResult} from './registry-gate.js'
import type {RadarEmailDomainPolicy} from './email-domain.js'
import type {RadarFunnelOverride} from './funnel-gates.js'
import {radarPurposeEnrichmentUrls,selectRadarQualificationEvidence} from './funnel-enrichment.js'
import {buildRadarFunnelEvidence,radarFunnelDecisionCriteria} from './funnel-context.js'
import {applyRadarFunnelRegistryGate,applyRadarFunnelGateDecision,applyRadarFunnelNextAction,markRadarFunnelInitialGate,radarScopedFunnelOverrides} from './funnel-gate-application.js'
import {loadRadarEmailDomainPolicy} from './email-domain-policy.js'

export type RadarQualification = { targetStatus: 'confirmed'|'review'|'not_target'|'insufficient'; productFit:'high'|'possible'|'low'|'unknown';
  claims?:Array<{reason:string;evidenceId:string;excerpt:string}>;
  reasons: string[]; evidenceIds: string[]; evidenceSources?:Array<{id:string;sourceUrl:string}>; limitations: string[]; provider?: string; model?: string; profile?:RadarCompanyProfile;profileRejections?:Array<{field:string;code:string}>;usage?:RadarPresenceResolution['usage'] }
function validatedQualificationProfile(result:RadarQualification,pages:RadarSiteEvidence[]){
 if(result.profile){
  const checked=validateRadarCompanyProfileClaims(result.profile,pages)
  // A rejected profile cannot serve as the only support for a positive/negative
  // verdict. Only an independently evidenced qualification can survive it.
  if(checked.rejections.length&&(result.targetStatus==='confirmed'||result.targetStatus==='not_target'||result.productFit!=='unknown')
    &&(!result.reasons.length||!result.evidenceIds.some(id=>/^page-\d+$/.test(id)&&!!pages[Number(id.slice(5))]?.text)))throw new Error('radar_profile_unverifiable')
  result={...result,profile:checked.profile}
  if(checked.rejections.length)result={...result,profileRejections:checked.rejections,limitations:[...new Set([...(result.limitations??[]),'radar_profile_claims_rejected'])]}
 }
 return result
}
export type RadarResearchDossier = { discovery: RadarPresenceDiscovery; pages: RadarSiteEvidence[]; contacts: RadarContactEvidence[];
  funnel?:RadarFunnelResearchState;
  deepResearchCompleted?:boolean;deepResearchStop?:string;
  decisionExcluded?:boolean;decisionReview?:boolean;
  historicalDerivedConclusions?:{presenceResolution?:RadarPresenceResolution;qualification?:RadarQualification;profile?:RadarCompanyProfile;sizeAssessment?:ReturnType<typeof assessRadarCompanySize>};
  quality?:RadarResearchQuality;targetedQueries?:string[];
  historicalEvidence?:{pages:RadarSiteEvidence[];contacts:RadarContactEvidence[]};
  methodVersion?:number; associationVersion?:number;
  registryPhone?: string; registryEmail?: string; siteAssociation: 'confirmed'|'review'; activity: ReturnType<typeof assessRadarBusinessActivity>;
  qualification?: RadarQualification; qualificationEvidenceHash?:string; profile?:RadarCompanyProfile;
  presenceResolution?:RadarPresenceResolution; presenceEvidenceHash?:string;
  analysisEvidence?:{presence?:RadarEvidenceVersion;semantic?:RadarEvidenceVersion};
  documents?:Array<{url:string;sourceUrl:string;observedAt:string;status:'not_read'}>;
  sizeAssessment?:ReturnType<typeof assessRadarCompanySize>; limitations: string[] }
type Output = Partial<RadarResearchDossier> & { deepResearchCompleted?:boolean;deepResearchStop?:string;historicalRevision?:number;analysisOnly?:boolean;discoveryHits?: RadarWebHit[]; discoveryQueries?: number; readingComplete?: boolean; readerVersion?:number; qualificationEvidenceHash?:string;discoveryLocked?:boolean }
type PipelineDependencies = { local?: () => Promise<RadarWebHit[]>; web: (query: string,source?:RadarWebSearchSource) => Promise<RadarWebHit[]>;
  deepResearch?:(gaps:string[],pages:RadarSiteEvidence[])=>Promise<RadarWebHit[]>;
  decisionMemo?:Map<DecisionContextV1['task'],{action:string}>;
  decide?:(task:DecisionContextV1['task'],pages:RadarSiteEvidence[],options:DecisionContextV1['options'],meta?:{step?:number;associatedWebsite?:string})=>Promise<RadarFunnelDecision>;
  registryPayload?:Record<string,unknown>;targetCnaes?:string[];emailPolicy?:RadarEmailDomainPolicy;
  funnelOverrides?:RadarFunnelOverride[];configurationRevision?:number;
  onRegistryGate?:(result:RadarRegistryGateResult,blocked:boolean)=>Promise<boolean>;
  onInitialGate?:(blocked:boolean)=>Promise<void>;
  sourceCostsBrl?:Partial<Record<RadarSearchSource,number>>;maxDecisionCalls?:number;
  searchCapacity?:()=>RadarSearchCapacity;searchAttempted?:(source:RadarSearchSource,query:string)=>boolean;
  resolvePresence?:(evidence:RadarPresenceEvidence[],evidenceHash:string,version:RadarEvidenceVersion)=>Promise<unknown>;
  collect?: typeof collectRadarSiteEvidence; qualify?: (pages: RadarSiteEvidence[],evidenceHash:string,version:RadarEvidenceVersion) => Promise<RadarQualification>;
  analysisCriteria?:unknown;
  registrySizeFacts?:RadarSizeFact[];
  queriesUsed?:()=>number;
  collectSocial?:typeof collectRadarPublicSocialEvidence;
  tlsOptions?:(hostname:string)=>Promise<RadarTlsReadOptions|undefined>;
  checkpoint: (stage: string, output: Output) => Promise<void>; signal?: AbortSignal }
export const RADAR_RESEARCH_METHOD_VERSION=2
const RADAR_ASSOCIATION_VERSION=2
function sameRadarOrigin(left:string,right:string){
  try{return new URL(left).origin===new URL(right).origin}catch{return false}
}
function uniqueRadarPages(pages:RadarSiteEvidence[]){
  const byUrl=new Map<string,RadarSiteEvidence>()
  for(const page of pages){
    const previous=byUrl.get(page.url)
    const time=Date.parse(page.observedAt)||0,prior=previous?Date.parse(previous.observedAt)||0:0
    if(!previous||time>prior||time===prior&&((!!previous.limitation&&!page.limitation)
      ||previous.limitation===page.limitation&&!previous.html&&!!page.html))byUrl.set(page.url,page)
  }
  return [...byUrl.values()]
}
function cnpjConflict(identity:RadarBusinessIdentity,text:string,group=false){
  const expected=normalizeRadarCnpjIdentifier(identity.cnpj)
  return !!expected&&extractRadarCnpjIdentifiers(text)
    .some(value=>group?value.slice(0,8)!==expected.slice(0,8):value!==expected)
}
function currentDossierProjection(output:Output,currentRevision?:number,dossierRevision?:number,contactPurpose:RadarSearchConfiguration['research']['contactPurpose']='general',identity?:RadarBusinessIdentity,identityChanged=false):Output{
  const historical=currentRevision!==undefined&&dossierRevision!==currentRevision
  const unprovenOwnership=identity&&output.siteAssociation==='confirmed'&&radarPublicPresenceFromDossier(output,dossierRevision??0,identity)?.website?.association!=='confirmed'
  const contacts=(Array.isArray(output.contacts)?output.contacts:[]).filter(contact=>{
    if(!contact||typeof contact!=='object'||typeof contact.sourceUrl!=='string'||typeof contact.value!=='string')return false
    const page=output.pages?.find(item=>canonicalRadarReadUrl(item.url)===canonicalRadarReadUrl(contact.sourceUrl))
    const official=output.siteAssociation==='confirmed'?output.discovery?.websiteUrl:undefined
    if(official&&!sameRadarOrigin(contact.sourceUrl,official)&&!(contact.linkedFromUrl&&sameRadarOrigin(contact.linkedFromUrl,official)))return false
    return isRadarInstitutionalSource(contact.sourceUrl,{text:page?.text})||!!page?.linkedFromUrl&&page.linkedFromUrl===contact.linkedFromUrl&&isRadarContactSource(contact,output.discovery?.websiteUrl)
    }).map(contact=>historical||unprovenOwnership?{...contact,association:'review' as const,scope:'unresolved' as const,preferred:false}:contact)
  const selectedEvidence=output.pages?.find(page=>canonicalRadarReadUrl(page.url)===canonicalRadarReadUrl(output.discovery?.websiteUrl??''))
  const invalid=identityChanged||output.discovery?.websiteUrl&&!isRadarInstitutionalSource(output.discovery.websiteUrl,{text:selectedEvidence?.text,html:selectedEvidence?.html})
  const readable=(output.pages??[]).filter(page=>!!page.text&&!page.limitation&&isRadarInstitutionalSource(page.url,{text:page.text}))
  const associated=!historical&&!unprovenOwnership&&output.siteAssociation==='confirmed'&&!invalid?readable.filter(page=>output.discovery?.websiteUrl&&new URL(page.url).origin===new URL(output.discovery.websiteUrl).origin):[]
  const activity=assessRadarBusinessActivity(associated,contacts??[],{pages:readable,scope:output.presenceResolution?.scope})
  return{...output,contacts:contacts?consolidateRadarContacts(contacts,contactPurpose):contacts,...(historical?{historicalRevision:dossierRevision}:{}),siteAssociation:invalid||historical||unprovenOwnership?'review':output.siteAssociation,
    ...(invalid||historical||unprovenOwnership?{historicalDerivedConclusions:output.historicalDerivedConclusions??{presenceResolution:output.presenceResolution,qualification:output.qualification,profile:output.profile,sizeAssessment:output.sizeAssessment},presenceResolution:undefined,qualification:undefined,profile:undefined,sizeAssessment:undefined}:{}),
    quality:invalid||historical||unprovenOwnership?undefined:output.quality,
    limitations:invalid||unprovenOwnership?[...(output.limitations??[]),'A associação anterior não sustenta as conclusões derivadas. Identidade, perfil e qualificação aguardam nova conferência; as evidências históricas foram preservadas.']:output.limitations,
    activity:output.activity&&!invalid?{...output.activity,presenceSignals:activity.presenceSignals}:activity,
    discovery:output.discovery?{...output.discovery,...(invalid?{websiteUrl:undefined,association:'review' as const}:historical?{association:'review' as const}:{})}:undefined,
    pages:output.pages?.map(({html:_html,...page})=>page)}
}

function safeResearchError(cause:unknown) {
  const code=cause instanceof Error?cause.message:''
  const runtime=/^agent_runtime_(\d{3})(?::(.*))?$/.exec(code)
  if(runtime){
    const detail=runtime[2]??''
    return /^(?:(?:radar_|llm_|credits_)[a-z0-9_]{1,100}|openrouter_credit_required|insufficient_ai_credits_or_invalid_wallet)$/.test(detail)
      ?detail:`agent_runtime_${runtime[1]}`
  }
  return /^[a-z][a-z0-9_]{2,100}$/.test(code)?code:'radar_qualification_failed'
}
const preProviderErrors=new Set(['radar_ai_wallet_missing','radar_ai_credits_insufficient','radar_request_invalid'])
function canRetryPreProviderRejection(call:ResearchRun['calls'][string]){
  return call.status==='rejected_before_provider'&&(call.retryProvenByReceipt===true||!!call.error&&preProviderErrors.has(call.error))
}

function presenceMaterial(pages:RadarSiteEvidence[],hits:RadarWebHit[]):RadarPresenceEvidence[]{
 const pageEvidence=pages.filter(page=>!!page.text&&!page.limitation).map((page,index)=>({id:`page-${index}`,url:page.url,text:page.text.slice(0,12000),observedAt:page.observedAt,kind:classifyRadarSource(page.url,{text:page.text}).kind})).slice(0,8)
 return[...pageEvidence,...hits.slice(0,10-pageEvidence.length).map((hit,index)=>({id:`search-${index}`,url:hit.url,text:`${hit.title} ${hit.snippets.join(' ')}`.slice(0,12000),observedAt:hit.observedAt,kind:'third_party' as const}))]
}
function legacyQualifiedMaterial(identity:RadarBusinessIdentity,saved:Output):RadarSiteEvidence[]{
 const pages=saved.pages??[],scope=saved.presenceResolution?.scope
 const origin=pages.find(page=>!page.limitation&&matchRadarBusinessIdentity(identity,page.text)==='confirmed'&&hasRadarOwnershipSignal(page.url,identity,page))?.url??saved.presenceResolution?.websiteUrl
 if(!origin)return[]
 const same=(url:string)=>sameRadarOrigin(url,origin)&&isRadarInstitutionalSource(url)
 const associated=pages.filter(page=>sameRadarOrigin(page.url,origin)&&isRadarInstitutionalSource(page.url,{text:page.text})&&!cnpjConflict(identity,page.text,scope==='group')&&!page.limitation&&!!page.text)
 const hits=(saved.discovery?.hits??[]).filter(hit=>same(hit.url)&&matchRadarBusinessIdentity(identity,`${hit.title} ${hit.snippets.join(' ')}`)==='confirmed'&&!pages.some(page=>page.url===hit.url&&!page.limitation&&cnpjConflict(identity,page.text,scope==='group')))
  .filter(hit=>isRadarInstitutionalSource(hit.url,{title:hit.title,text:hit.snippets.join(' ')})).map(hit=>({url:hit.url,text:`${hit.title} ${hit.snippets.join(' ')}`,observedAt:hit.observedAt}))
 return[...associated,...hits].slice(0,10)
}

// The facts pipeline is deliberately independent of offer fit and has no outreach dependency.
export async function runRadarResearchPipeline(identity: RadarBusinessIdentity, configuration: RadarSearchConfiguration,
  saved: Output, dependencies: PipelineDependencies): Promise<RadarResearchDossier> {
  const output = { ...saved }
  const readerUpgrade=typeof saved.readerVersion==='number'&&saved.readerVersion<RADAR_READER_VERSION
  if(readerUpgrade&&!saved.analysisOnly&&!output.historicalEvidence)output.historicalEvidence={
    pages:uniqueRadarPages(saved.pages??[]).map(({html:_html,...page})=>page),contacts:saved.contacts??[]}
  if(output.pages)output.pages=uniqueRadarPages(output.pages)
  const readingDeadline=Date.now()+110_000
  if (output.pages?.some(isRetryableRadarPage)) {
    output.pages=output.pages.filter(page=>!isRetryableRadarPage(page));output.readingComplete=false
  }
  const limits: string[] = []
  const funnel=configuration.funnel.enabled&&!output.analysisOnly
  const checkpoint = async (stage: string) => { dependencies.signal?.throwIfAborted(); await dependencies.checkpoint(stage, output) }
  const decisionMemo=dependencies.decisionMemo??new Map<DecisionContextV1['task'],{action:string}>()
  const decide=async(task:DecisionContextV1['task'],material:RadarSiteEvidence[],options:DecisionContextV1['options'])=>{
    if(!dependencies.decide)return undefined
    if(!decisionMemo.has(task))decisionMemo.set(task,await dependencies.decide(task,material,options))
    return decisionMemo.get(task)
  }
  let pages = [...(output.pages ?? [])]
  const exclude=async(gate:'g0'|'g1'|'g5')=>{
    output.funnel={...output.funnel,blockedGate:gate}
    const excluded:RadarResearchDossier={...output,decisionExcluded:true,discovery:output.discovery??{hits:[],suggestions:[],queries:0,association:'review',limitations:[]},pages,contacts:output.contacts??[],siteAssociation:output.siteAssociation??'review',activity:output.activity??assessRadarBusinessActivity([],[]),limitations:['A atividade comprovada não atende ao público configurado; a classificação pode ser revista.']}
    Object.assign(output,excluded);await checkpoint('review');return excluded
  }
  if(funnel){
    output.funnel??={}
    const registry=evaluateRadarRegistryRules({payload:dependencies.registryPayload??{},targetCnaes:dependencies.targetCnaes??[],configuration})
    const override=dependencies.funnelOverrides?.some(item=>item.gate==='g0'&&item.configurationRevision===dependencies.configurationRevision)
    const proposed=configuration.funnel.g0.mode==='enforce'&&registry.outcome==='block'&&!override
    const blocked=await dependencies.onRegistryGate?.(registry,proposed)??proposed
    if(blocked)return exclude('g0')
    const triage=configuration.funnel.g1.mode==='off'?{action:'continue',effectiveMode:'off'}:await dependencies.decide?.('radar_initial_triage',[],[])
    output.funnel.initial=triage??{action:'continue',effectiveMode:'shadow'}
    const excluded=configuration.funnel.g1.mode==='enforce'&&triage?.effectiveMode==='enforce'&&triage.action==='exclude'
    await dependencies.onInitialGate?.(excluded)
    if(excluded)return exclude('g1')
    // An old gate result must not survive a scoped reopening.
    output.decisionExcluded=false;output.funnel.blockedGate=undefined
    await checkpoint('discovery')
  }
  const triageDecision=funnel?undefined:await decide('radar_initial_triage',pages,[])
  if(triageDecision?.action==='exclude'){
    const excluded:RadarResearchDossier={...output,decisionExcluded:true,discovery:output.discovery??{hits:[],suggestions:[],queries:0,association:'review',limitations:[]},pages,contacts:output.contacts??[],siteAssociation:output.siteAssociation??'review',activity:output.activity??assessRadarBusinessActivity([],[]),limitations:['A atividade comprovada não atende ao público configurado; a classificação pode ser revista.']}
    Object.assign(output,excluded);await checkpoint('review');return excluded
  }
  const sourceOptions=configuration.research.webSearchEnabled?configuration.research.webSearchProviders.filter(source=>!dependencies.searchCapacity||hasRadarSearchCapacity(dependencies.searchCapacity(),source)).map(source=>({id:source,description:`Pesquisa web elegível: ${source}; usar apenas a capacidade e licenças já autorizadas.`})):[]
  const readOptions=pages.filter(page=>!page.limitation).slice(0,Math.max(0,8-sourceOptions.length)).map(page=>({id:`read_${radarDecisionHash(page.url).slice(0,16)}`,description:`Priorizar leitura da página pública ${page.url}`}))
  const nextDecision=funnel?undefined:await decide('radar_next_action',pages,[...sourceOptions,...readOptions])
  const decisionSource=sourceOptions.some(item=>item.id===nextDecision?.action)?nextDecision!.action as RadarWebSearchSource:undefined
  const search=(query:string,source?:RadarWebSearchSource)=>{
    const selected=decisionSource&&(!dependencies.searchCapacity||hasRadarSearchCapacity(dependencies.searchCapacity(),decisionSource))&&!dependencies.searchAttempted?.(decisionSource,query)?decisionSource:source
    return selected?dependencies.web(query,selected):dependencies.web(query)
  }
  if(!output.analysisOnly&&pendingRadarReadUrls([...(output.discoveryHits??[]),...(output.discovery?.hits??[]),...(output.discovery?.suggestions??[])],pages,configuration.research.maxPagesPerCandidate).length)
    output.readingComplete=false
  const mentionsIdentity=(text:string)=>!cnpjConflict(identity,text,true)&&[identity.name,identity.legalName].some(name=>!!name&&normalizeRadarText(name).length>=5&&normalizeRadarText(text).includes(normalizeRadarText(name)))
  const directlyOwns=(page:RadarSiteEvidence)=>!page.limitation&&matchRadarBusinessIdentity(identity,page.text)==='confirmed'&&hasRadarOwnershipSignal(page.url,identity,page)
  if(funnel){
    await runRadarFunnelDiscovery(identity,configuration,output,{
      web:dependencies.web,local:dependencies.local,collect:dependencies.collect,deepResearch:dependencies.deepResearch,
      registryPayload:dependencies.registryPayload,emailPolicy:dependencies.emailPolicy,sourceCostsBrl:dependencies.sourceCostsBrl,
      searchCapacity:dependencies.searchCapacity,searchAttempted:dependencies.searchAttempted,maxDecisionCalls:dependencies.maxDecisionCalls,
      signal:dependencies.signal,tlsOptions:dependencies.tlsOptions,deadlineAt:readingDeadline,
      choose:dependencies.decide?(material,options,step)=>dependencies.decide!('radar_next_action',material,options,{step}):undefined,
      checkpoint:()=>checkpoint('discovery'),
    })
    pages=[...(output.pages??[])]
  }
  if (!output.discovery || !output.discoveryLocked && output.discovery.limitations.length) {
    output.discovery = await discoverRadarBusinessPresence(identity, configuration.research, {
      search, local: dependencies.local, initialHits: output.discoveryHits ?? output.discovery?.hits, initialQueries: output.discoveryQueries,
      queriesUsed:dependencies.queriesUsed,
      searchCapacity:dependencies.searchCapacity,searchAttempted:dependencies.searchAttempted,
      checkpoint: async (hits, queries) => { output.discoveryHits = hits; output.discoveryQueries = queries; await checkpoint('discovery') },
      inspectCandidates:output.analysisOnly?undefined:async hits=>{
        if(pendingRadarReadUrls(hits,pages,configuration.research.maxPagesPerCandidate).length)output.readingComplete=false
        let plausible=false
        for(const hit of hits.filter(item=>isRadarInstitutionalSource(item.url,{title:item.title,text:item.snippets.join(' ')}))){
          const root=new URL('/',hit.url).toString()
          if(!pages.some(page=>new URL(page.url).origin===new URL(root).origin)&&pages.length<Math.max(1,configuration.research.maxPagesPerCandidate-1)){
            const collected=await (dependencies.collect??collectRadarSiteEvidence)(root,{maxPagesPerCandidate:1,maxAttemptsPerCandidate:1},{signal:dependencies.signal,tlsOptions:dependencies.tlsOptions,deadlineAt:readingDeadline})
            pages.push(...collected);output.pages=pages;await checkpoint('discovery')
          }
          const readable=pages.filter(page=>new URL(page.url).origin===new URL(root).origin&&!page.limitation&&isRadarInstitutionalSource(page.url,{text:page.text}))
          if(readable.some(directlyOwns))return true
          if(readable.some(page=>mentionsIdentity(page.text)))plausible=true
        }
        return plausible
      },
    })
    await checkpoint('identity')
  }
  const mergedHits=[...new Map([...(output.discovery.hits??[]),...(output.discoveryHits??[])].map(hit=>[canonicalRadarReadUrl(hit.url)??hit.url,hit])).values()]
  output.discovery={...output.discovery,hits:mergedHits,suggestions:[...new Map([...(output.discovery.suggestions??[]),...mergedHits.filter(hit=>canonicalRadarReadUrl(hit.url)!==canonicalRadarReadUrl(output.discovery!.websiteUrl??''))].map(hit=>[canonicalRadarReadUrl(hit.url)??hit.url,hit])).values()]}
  const discovery = output.discovery
  let website = pages.find(directlyOwns)?.url??discovery.websiteUrl ?? identity.websiteUrl
    ?? discovery.suggestions.find(hit=>!isRadarReferenceUrl(hit.url))?.url
  const deferAmbiguousDepth=configuration.research.presenceResolutionEnabled
    &&!pages.some(directlyOwns)
    &&new Set(pages.filter(page=>!page.limitation&&isRadarInstitutionalSource(page.url,{text:page.text})&&!cnpjConflict(identity,page.text,true)).map(page=>new URL(page.url).origin)).size>1
  if (!output.readingComplete&&!funnel) {
    const candidates = [website,...discovery.suggestions.map(item=>item.url)].filter((value):value is string => !!value && !isRadarReferenceUrl(value))
    const pending=pendingRadarReadUrls([...discovery.hits,...discovery.suggestions,...(website?[{url:website,title:identity.name,snippets:[],observedAt:''}]:[])],pages,configuration.research.maxPagesPerCandidate)
    const pendingUrls=pending.flatMap(value=>{const root=new URL('/',value).toString();return pages.some(page=>canonicalRadarReadUrl(page.url)===root)?[value]:[root,value]})
    const urls = [...new Set([...pendingUrls,...(!saved.readingComplete||readerUpgrade?candidates.flatMap(value=>{try{return [new URL('/',value).toString(),value]}catch{return []}}):[])])]
    const options=urls.slice(0,8).map(url=>({id:`read_${radarDecisionHash(url).slice(0,16)}`,description:`Ler a página pública elegível ${url}`}))
    const selectedIndex=options.findIndex(item=>item.id===nextDecision?.action)
    if(selectedIndex>0)urls.unshift(...urls.splice(selectedIndex,1))
    for (const url of urls) {
      if(deferAmbiguousDepth)break
      if (pages.filter(page=>!page.limitation).length >= configuration.research.maxPagesPerCandidate || pages.length>=configuration.research.maxPagesPerCandidate*2 || dependencies.signal?.aborted) break
      const other=pages.filter(page=>new URL(page.url).origin!==new URL(url).origin)
      const remaining = configuration.research.maxPagesPerCandidate - other.filter(page=>!page.limitation).length
      const maxAttemptsPerCandidate=configuration.research.maxPagesPerCandidate*2-other.length
      const prior=pages.filter(page=>new URL(page.url).origin===new URL(url).origin)
      let collected = await (dependencies.collect ?? collectRadarSiteEvidence)(url, {maxPagesPerCandidate:Math.min(remaining,prior.filter(page=>!page.limitation).length+1),maxAttemptsPerCandidate}, {signal:dependencies.signal,tlsOptions:dependencies.tlsOptions,deadlineAt:readingDeadline,
        initialPages:pages.filter(page=>new URL(page.url).origin===new URL(url).origin),checkpoint:async value => {
          output.pages=[...pages.filter(page=>new URL(page.url).origin!==new URL(url).origin),...value];await checkpoint('reading')
        }})
      pages=[...pages.filter(page=>new URL(page.url).origin!==new URL(url).origin),...collected]
      if (collected.some(page=>isRadarInstitutionalSource(page.url,{text:page.text})&&(directlyOwns(page)
        ||!configuration.research.presenceResolutionEnabled&&mentionsIdentity(page.text)))) {
        website=url
        if(collected.filter(page=>!page.limitation).length<remaining) {
          collected=await (dependencies.collect??collectRadarSiteEvidence)(url,{maxPagesPerCandidate:remaining,maxAttemptsPerCandidate},{signal:dependencies.signal,tlsOptions:dependencies.tlsOptions,deadlineAt:readingDeadline,initialPages:collected,
            checkpoint:async value=>{output.pages=[...pages.filter(page=>new URL(page.url).origin!==new URL(url).origin),...value];await checkpoint('reading')}})
          pages=[...pages.filter(page=>new URL(page.url).origin!==new URL(url).origin),...collected]
        }
        break
      }
    }
    output.pages = pages; output.readingComplete = !pages.some(isRetryableRadarPage); output.readerVersion=RADAR_READER_VERSION
    await checkpoint('consolidation')
  }
  const buildPresenceEvidence=()=>presenceMaterial(pages,discovery.hits)
  let presenceEvidence=buildPresenceEvidence()
  const {websiteUrl:_inferredWebsite,...stableIdentity}=identity
  const dependencyInput=(evidence:RadarPresenceEvidence[],criteria:unknown)=>({identity:stableIdentity,criteria,evidence,contacts:pages.flatMap(page=>extractRadarContacts(page,'review'))})
  const oldPresence=presenceMaterial(saved.pages??[],saved.discovery?.hits??saved.discoveryHits??[])
  const presenceVersion=():RadarEvidenceVersion=>({hashVersion:2,hash:radarEvidenceContentHash({identity:stableIdentity,criteria:{},purpose:'presence',evidence:presenceEvidence}),bindings:radarEvidenceBindings(presenceEvidence),dependencies:radarAnalysisDependencies(dependencyInput(presenceEvidence,{}),'presence'),
    ...(oldPresence.length?{legacy:{hashVersion:1 as const,hash:createHash('sha256').update(JSON.stringify({identity:stableIdentity,evidence:oldPresence})).digest('hex'),contentHash:radarEvidenceContentHash({identity:stableIdentity,criteria:{},purpose:'presence',evidence:oldPresence}),bindings:radarEvidenceBindings(oldPresence)}}:{})})
  let presenceContext=presenceVersion(),presenceEvidenceHash=presenceContext.hash
  let presenceOriginHash=saved.analysisEvidence?.presence?.derivedFromHash??saved.presenceEvidenceHash
  let presenceResolution:RadarPresenceResolution|undefined
  const savedPresenceBindings=radarEvidenceBindingMatch({evidenceHash:saved.presenceEvidenceHash,evidenceVersion:saved.analysisEvidence?.presence},presenceContext)
  const presenceDependencies=radarDependencyBindingMatch(saved.analysisEvidence?.presence,presenceContext)
  if(saved.presenceResolution&&(savedPresenceBindings||presenceDependencies))try{
    const mapped=savedPresenceBindings?remapRadarEvidenceResult(saved.presenceResolution,savedPresenceBindings,presenceContext.bindings):remapRadarEvidenceResult(saved.presenceResolution,presenceDependencies!.from,presenceDependencies!.to)
    presenceResolution=validateRadarPresenceResolution({candidateId:presenceEvidence.find(item=>item.url===mapped.websiteUrl)?.id??null,scope:mapped.scope,reason:mapped.reason,
      claims:mapped.claims.map(claim=>({evidenceId:claim.evidenceId,excerpt:claim.excerpt})),provider:mapped.provider,model:mapped.model,usage:mapped.usage},identity,presenceEvidence)
  }catch{limits.push('radar_analysis_saved_citations_require_review')}
  // A dependency-derived validation is not an alias for a different paid input.
  if(presenceResolution)output.analysisEvidence={...output.analysisEvidence,presence:persistedRadarEvidenceVersion({...presenceContext,...(!savedPresenceBindings?{derivedFromHash:saved.presenceEvidenceHash}:{})},savedPresenceBindings?saved.presenceEvidenceHash:undefined)}
  let directlyAssociated=pages.find(directlyOwns)
  if(configuration.research.presenceResolutionEnabled&&!directlyAssociated&&!presenceResolution){
    if(dependencies.resolvePresence&&presenceEvidence.some(item=>item.kind==='institutional_candidate')){
      try{
        presenceResolution=validateRadarPresenceResolution(await dependencies.resolvePresence(presenceEvidence,presenceEvidenceHash,presenceContext),identity,presenceEvidence)
        presenceOriginHash=presenceEvidenceHash
        output.presenceResolution=presenceResolution;output.presenceEvidenceHash=presenceEvidenceHash
        output.analysisEvidence={...output.analysisEvidence,presence:persistedRadarEvidenceVersion(presenceContext)}
        await checkpoint('identity')
      }catch(cause){rethrowRadarAdaptiveYield(cause);limits.push(`Identificação do site pendente (${safeResearchError(cause)}). As evidências foram preservadas.`)}
    }else limits.push(presenceEvidence.some(item=>item.kind==='institutional_candidate')?'radar_presence_service_unavailable':'radar_presence_waiting_public_read')
  }
  const selectedWebsite=directlyAssociated?.url??presenceResolution?.websiteUrl
  if(!funnel&&(deferAmbiguousDepth||configuration.research.presenceResolutionEnabled&&!saved.readingComplete||readerUpgrade)&&selectedWebsite&&!output.analysisOnly){
    const origin=new URL(selectedWebsite).origin,prior=pages.filter(page=>new URL(page.url).origin===origin)
    const other=pages.filter(page=>new URL(page.url).origin!==origin)
    const maximum=configuration.research.maxPagesPerCandidate-other.filter(page=>!page.limitation).length
    if(maximum>0&&(readerUpgrade||prior.filter(page=>!page.limitation).length<maximum)){
      const selected=await(dependencies.collect??collectRadarSiteEvidence)(selectedWebsite,
        {maxPagesPerCandidate:maximum,maxAttemptsPerCandidate:configuration.research.maxPagesPerCandidate*2-other.length},{signal:dependencies.signal,tlsOptions:dependencies.tlsOptions,deadlineAt:readingDeadline,
          initialPages:prior.filter(page=>readerUpgrade?!!page.html:page.url!==selectedWebsite||!!page.html)})
      const byUrl=new Map(selected.map(page=>[page.url,page]))
      pages=[...new Map([...pages.map(page=>byUrl.get(page.url)??page),...selected.filter(page=>!pages.some(old=>old.url===page.url))].map(page=>[page.url,page])).values()]
      output.pages=pages;output.readingComplete=!pages.some(isRetryableRadarPage);output.readerVersion=RADAR_READER_VERSION
      presenceEvidence=buildPresenceEvidence();presenceContext=presenceVersion();presenceEvidenceHash=presenceContext.hash
      directlyAssociated=pages.find(directlyOwns)
      if(presenceResolution?.websiteUrl){
        try{
          const candidate=presenceEvidence.find(item=>item.url===presenceResolution!.websiteUrl&&item.kind==='institutional_candidate')
          const claims=presenceResolution.claims.map(claim=>({evidenceId:presenceEvidence.find(item=>item.url===claim.sourceUrl&&item.text.includes(claim.excerpt))?.id??'missing',excerpt:claim.excerpt}))
          presenceResolution=validateRadarPresenceResolution({candidateId:candidate?.id??'missing',scope:presenceResolution.scope,
            reason:presenceResolution.reason,claims,provider:presenceResolution.provider,model:presenceResolution.model},identity,presenceEvidence)
        }catch{presenceResolution=undefined;limits.push('As evidências atualizadas não sustentam a associação anterior do site. Identidade e contatos exigem revisão.')}
      }
      if(selected.some(page=>!page.limitation&&(cnpjConflict(identity,page.text,presenceResolution?.scope==='group')
        ||page.url===selectedWebsite&&!isRadarInstitutionalSource(page.url,{text:page.text})))){
        presenceResolution=undefined;directlyAssociated=undefined;limits.push('As páginas adicionais contradizem a identidade procurada. Site e contatos exigem revisão.')
      }
      output.presenceResolution=presenceResolution;output.presenceEvidenceHash=presenceResolution?presenceEvidenceHash:undefined
      if(presenceResolution)output.analysisEvidence={...output.analysisEvidence,presence:persistedRadarEvidenceVersion({...presenceContext,...(presenceOriginHash&&presenceOriginHash!==presenceContext.hash?{derivedFromHash:presenceOriginHash}:{})})}
      await checkpoint('consolidation')
    }
  }
  const associatedOrigin=directlyAssociated?.url??presenceResolution?.websiteUrl
  const associated=!!associatedOrigin
  if(funnel){
    const fit=configuration.funnel.g5.mode==='off'?{action:'continue',effectiveMode:'off'}:await dependencies.decide?.('radar_fit_gate',pages,[],{associatedWebsite:presenceResolution?.scope==='group'?undefined:associatedOrigin})
    output.funnel!.fit=fit??{action:'continue',effectiveMode:'shadow'}
    if(configuration.funnel.g5.mode==='enforce'&&fit?.effectiveMode==='enforce'&&fit.action==='exclude'&&associatedOrigin&&presenceResolution?.scope!=='group')return exclude('g5')
    const short=output.funnel!.initial?.action==='short_investigation'&&output.funnel!.initial.effectiveMode==='enforce'||fit?.action==='short_investigation'&&fit.effectiveMode==='enforce'
    if(!short&&associatedOrigin){
      output.funnel!.enrichmentUrls??=[]
      for(const url of radarPurposeEnrichmentUrls(associatedOrigin,pages,configuration.research.contactPurpose)){
        if(output.funnel!.enrichmentUrls.includes(url))continue
        if(pages.filter(page=>!page.limitation).length>=configuration.research.maxPagesPerCandidate||pages.length>=configuration.research.maxPagesPerCandidate*2)break
        const collected=await(dependencies.collect??collectRadarSiteEvidence)(url,{maxPagesPerCandidate:1,maxAttemptsPerCandidate:1},{signal:dependencies.signal,tlsOptions:dependencies.tlsOptions,deadlineAt:readingDeadline,checkpoint:async value=>{output.pages=uniqueRadarPages([...pages,...value]);await checkpoint('reading')}})
        pages=uniqueRadarPages([...pages,...collected]);output.pages=pages;output.funnel!.enrichmentUrls.push(url)
        await checkpoint('reading')
      }
    }
  }
  const associatedPages=pages.filter(page=>associatedOrigin && new URL(page.url).origin===new URL(associatedOrigin).origin
    &&isRadarInstitutionalSource(page.url,{text:page.text})&&!cnpjConflict(identity,page.text,presenceResolution?.scope==='group'))
  // Recompute from preserved facts; do not retain an obsolete identity association from a previous run.
  const sameInstitutionalOrigin=(url:string)=>!!associatedOrigin&&isRadarInstitutionalSource(url)&&new URL(url).origin===new URL(associatedOrigin).origin
  const candidatePage=(page:RadarSiteEvidence)=>!page.limitation&&isRadarInstitutionalSource(page.url,{text:page.text})&&!cnpjConflict(identity,page.text,true)
    &&(!associatedOrigin||sameRadarOrigin(page.url,associatedOrigin))
  const shortFit=funnel&&(output.funnel!.initial?.effectiveMode==='enforce'&&output.funnel!.initial.action==='short_investigation'||output.funnel!.fit?.effectiveMode==='enforce'&&output.funnel!.fit.action==='short_investigation')
  if(configuration.research.inspectLinkedSocialProfiles&&!output.analysisOnly&&!shortFit) {
    const social=await(dependencies.collectSocial??collectRadarPublicSocialEvidence)({linkedPages:associated?pages.filter(candidatePage):[],
      remainingPages:Math.max(0,configuration.research.maxPagesPerCandidate-pages.filter(page=>!page.limitation).length),
      remainingAttempts:Math.max(0,configuration.research.maxPagesPerCandidate*2-pages.length),deadlineAt:readingDeadline,existingPages:pages},
      {signal:dependencies.signal,checkpoint:async page=>{output.pages=[...pages,page];await checkpoint('reading');pages.push(page)}})
    for(const page of social)if(!pages.some(old=>old.url===page.url))pages.push(page)
    output.pages=pages
  }
  const contacts:RadarContactEvidence[] = pages.filter(candidatePage).flatMap(page => extractRadarContacts(page, associatedPages.includes(page) ? 'confirmed' : 'review').map(contact=>({...contact,
    scope:associatedPages.includes(page)?presenceResolution?.scope??'establishment': 'unresolved' as const})))
  // Link-only contacts are preserved as sourced facts: stored pages intentionally omit raw HTML.
  const unchangedContactPage=(page:RadarSiteEvidence)=>{
    const prior=saved.analysisEvidence?.presence
    if(prior)return radarEvidenceBindings(presenceMaterial([page],[])).some(binding=>prior.bindings.some(old=>old.key===binding.key))
    return saved.pages?.some(old=>old.url===page.url&&page.text===old.text&&page.observedAt===old.observedAt)===true
  }
  contacts.push(...(output.contacts??[]).filter(contact=>pages.some(page=>page.url===contact.sourceUrl&&candidatePage(page)&&!page.html&&unchangedContactPage(page))).map(contact=>({...contact,
    association:associatedPages.some(page=>page.url===contact.sourceUrl)?'confirmed' as const:'review' as const,
    scope:associatedPages.some(page=>page.url===contact.sourceUrl)?presenceResolution?.scope??'establishment':'unresolved' as const})))
  for(const page of pages.filter(page=>!page.limitation&&!!page.linkedFromUrl&&isRadarPublicProfile(page.url))) {
    const parent=pages.find(parent=>parent.url===page.linkedFromUrl&&candidatePage(parent))
    if(!parent)continue
    const parentLinks=extractRadarContacts(parent,'review').some(contact=>contact.kind==='social'&&contact.value===page.url)
    const priorLinks=(saved.contacts??[]).some(contact=>contact.kind==='social'&&contact.value===page.url&&contact.sourceUrl===parent.url)
    if(!parentLinks&&!priorLinks)continue
    const association=associatedPages.includes(parent)?'confirmed' as const:'review' as const
    const extracted=extractRadarContacts(page,association,{linkedFromUrl:parent.url})
    const prior=page.html||!unchangedContactPage(page)?[]:(saved.contacts??[]).filter(contact=>contact.sourceUrl===page.url&&contact.linkedFromUrl===parent.url)
    contacts.push(...[...extracted,...prior].map(contact=>({...contact,association,scope:association==='confirmed'?presenceResolution?.scope??'establishment':'unresolved' as const})))
  }
  // Contacts in search snippets remain useful when there is no website; identity must be corroborated independently.
  const trustedSearchHits=discovery.hits.filter(hit=>sameInstitutionalOrigin(hit.url)&&matchRadarBusinessIdentity(identity,`${hit.title} ${hit.snippets.join(' ')}`)==='confirmed'
    &&!pages.some(page=>canonicalRadarReadUrl(page.url)===canonicalRadarReadUrl(hit.url)&&!page.limitation&&!!page.text)
    &&!pages.some(page=>page.url===hit.url&&!page.limitation&&cnpjConflict(identity,page.text,presenceResolution?.scope==='group')))
  for (const hit of trustedSearchHits) contacts.push(...extractRadarContacts({ url:hit.url, text:`${hit.title} ${hit.snippets.join(' ')}`, observedAt:hit.observedAt }, 'confirmed')
    .map(contact=>({...contact,scope:presenceResolution?.scope??'establishment' as const})))
  const uniqueContacts = consolidateRadarContacts(contacts,configuration.research.contactPurpose)
  if(!funnel&&configuration.research.completion.enabled&&!output.analysisOnly&&associatedOrigin&&presenceResolution?.scope!=='group'
    &&usefulRadarDeliveryContacts({contacts:uniqueContacts},configuration.research).length<configuration.research.completion.minimumUsefulContacts){
    const next=planRadarResearch({identity,policy:configuration.research,hits:[],pages:associatedPages,
      queriesUsed:dependencies.queriesUsed?.()??output.discoveryQueries??discovery.queries,missing:['contact'],attemptedQueries:output.targetedQueries??[],
      searchCapacity:dependencies.searchCapacity?.(),searchAttempted:dependencies.searchAttempted}).next
    if(next?.kind==='web'&&next.query?.startsWith('site:')){
      output.targetedQueries=[...(output.targetedQueries??[]),next.query]
      await checkpoint('discovery')
      try{
        const hits=await search(next.query,next.source)
        output.discovery={...discovery,hits:[...discovery.hits,...hits],suggestions:[...discovery.suggestions,...hits]}
        output.discoveryQueries=dependencies.queriesUsed?.()??(output.discoveryQueries??discovery.queries)+1
        const pending=pendingRadarReadUrls(hits,pages,configuration.research.maxPagesPerCandidate).filter(url=>sameRadarOrigin(url,associatedOrigin))
        for(const url of pending){
          if(pages.filter(page=>!page.limitation).length>=configuration.research.maxPagesPerCandidate)break
          pages=uniqueRadarPages([...pages,...await(dependencies.collect??collectRadarSiteEvidence)(url,{maxPagesPerCandidate:1,maxAttemptsPerCandidate:1},
            {signal:dependencies.signal,tlsOptions:dependencies.tlsOptions,deadlineAt:readingDeadline})])
        }
        output.pages=pages;output.discoveryLocked=true;output.readingComplete=true
        return runRadarResearchPipeline(identity,configuration,output,{...dependencies,decisionMemo})
      }catch(cause){rethrowRadarAdaptiveYield(cause);limits.push(`Pesquisa complementar: ${safeResearchError(cause)}.`)}
    }
  }
  if(configuration.research.deepResearchEnabled&&dependencies.deepResearch&&!output.deepResearchCompleted&&!output.analysisOnly&&(!funnel||isRadarFunnelAgentEligible(configuration,output.funnel!))){
    const gaps=[...(!associated?['identity']:[]),...(usefulRadarDeliveryContacts({contacts:uniqueContacts},configuration.research).length<(configuration.research.completion.enabled?configuration.research.completion.minimumUsefulContacts:1)?['contact']:[])]
    const plan=planRadarAdaptiveResearch({missing:gaps,outsideProfile:false,contentHash:radarEvidenceContentHash({identity,criteria:{},purpose:'adaptive',evidence:pages}),availableActions:[{id:'deep_research',kind:'deep_research',inputHash:radarDecisionHash(gaps)}],effects:[]})
    if(plan.next){
      try{
        const hits=await dependencies.deepResearch(funnel?[...new Set([...gaps,'identity','website','contact','whatsapp','official_socials'])]:gaps,pages)
        output.deepResearchCompleted=true
        if(funnel){output.funnel!.agentAttempted=true;output.funnel!.agentCompleted=true}
        output.discoveryHits=[...(output.discoveryHits??[]),...hits]
        output.discovery={...discovery,hits:[...discovery.hits,...hits],suggestions:[...discovery.suggestions,...hits]}
        output.discoveryLocked=false;output.readingComplete=false
        await checkpoint('discovery')
        return runRadarResearchPipeline(identity,configuration,output,{...dependencies,decisionMemo})
      }catch(cause){rethrowRadarAdaptiveYield(cause);if(funnel)output.funnel!.agentAttempted=true;output.deepResearchStop=safeResearchError(cause);limits.push(`Pesquisa complementar: ${output.deepResearchStop}.`)}
    }else output.deepResearchStop=plan.stop
  }
  output.contacts=uniqueContacts
  await checkpoint('consolidation')
  const confirmedSearchPages=trustedSearchHits.filter(hit=>isRadarInstitutionalSource(hit.url,{title:hit.title,text:hit.snippets.join(' ')}))
    .map(hit=>({url:hit.url,text:`${hit.title} ${hit.snippets.join(' ')}`,observedAt:hit.observedAt}))
  const qualificationPages=[...associatedPages.filter(page=>!page.limitation&&!!page.text),...confirmedSearchPages]
  const qualifiedEvidence=configuration.funnel.enabled?selectRadarQualificationEvidence(qualificationPages,{maxPages:configuration.research.qualificationEvidenceMaxPages,maxChars:configuration.research.qualificationEvidenceMaxChars}):qualificationPages.slice(0,10)
  const activity = assessRadarBusinessActivity(qualifiedEvidence,uniqueContacts,{pages:pages.filter(candidatePage),scope:presenceResolution?.scope})
  if (!website && !pages.length) limits.push('Site não encontrado nas fontes consultadas; isso não comprova inexistência.')
  if (website && !associated) limits.push('A identidade do site exige revisão; contatos não são tratados como confirmados.')
  if(presenceResolution?.scope==='group')limits.push('Presença e canais associados ao grupo; vínculo com este estabelecimento ainda requer conferência.')
  limits.push(...discovery.limitations, ...pages.flatMap(page => page.limitation ? [`${page.url}: ${page.limitation}`] : []))
  const criteria={campaign:dependencies.analysisCriteria,qualification:configuration.qualification,profile:configuration.research.profileEnabled,size:configuration.research.sizeAssessment.enabled}
  const semanticMaterial=(value:RadarSiteEvidence[])=>value.map(page=>({...page,text:page.text.slice(0,12000)}))
  const semanticHash=(value:RadarSiteEvidence[])=>radarEvidenceContentHash({identity:stableIdentity,criteria,purpose:'qualification',evidence:semanticMaterial(value)})
  const oldQualified=legacyQualifiedMaterial(identity,saved)
  const semanticContext:RadarEvidenceVersion={hashVersion:2,hash:semanticHash(qualifiedEvidence),bindings:radarEvidenceBindings(semanticMaterial(qualifiedEvidence)),dependencies:radarAnalysisDependencies({identity:stableIdentity,criteria,evidence:semanticMaterial(qualifiedEvidence),contacts:uniqueContacts},'qualification'),
    ...(oldQualified.length?{legacy:{hashVersion:1 as const,hash:createHash('sha256').update(JSON.stringify({pages:oldQualified.map(page=>({url:page.url,text:page.text.slice(0,12000)})),profile:configuration.research.profileEnabled,size:configuration.research.sizeAssessment.enabled})).digest('hex'),contentHash:semanticHash(oldQualified),bindings:radarEvidenceBindings(semanticMaterial(oldQualified))}}:{})}
  const evidenceHash=semanticContext.hash
  let qualification:RadarQualification|undefined
  const savedQualificationBindings=radarEvidenceBindingMatch({evidenceHash:saved.qualificationEvidenceHash,evidenceVersion:saved.analysisEvidence?.semantic},semanticContext)
  if(saved.qualification&&savedQualificationBindings)try{qualification=validatedQualificationProfile(remapRadarEvidenceResult(saved.qualification,savedQualificationBindings,semanticContext.bindings),qualifiedEvidence)}catch{limits.push('radar_analysis_saved_citations_require_review')}
  const qualificationDependencies=radarDependencyBindingMatch(saved.analysisEvidence?.semantic,semanticContext)
  if(!qualification&&saved.qualification?.claims?.length&&qualificationDependencies)try{
    const mapped=remapRadarEvidenceResult(saved.qualification,qualificationDependencies.from,qualificationDependencies.to)
    if(mapped.claims!.some(claim=>!qualifiedEvidence[Number(claim.evidenceId.replace('page-',''))]?.text.includes(claim.excerpt)))throw Error('radar_analysis_saved_citations_require_review')
    if(mapped.reasons.some(reason=>!mapped.claims!.some(claim=>claim.reason===reason)))throw Error('radar_analysis_saved_citations_require_review')
    // Reasons are generated narrative, not necessarily literal excerpts. Never
    // carry an obsolete email/phone inside that narrative into the new result.
    const currentText=qualifiedEvidence.map(page=>page.text).join(' ').replace(/\D/g,'')
    const obsolete=(saved.contacts??[]).filter(contact=>!uniqueContacts.some(current=>current.kind===contact.kind&&current.value===contact.value))
    if(obsolete.some(contact=>mapped.reasons.some(reason=>contact.kind==='email'?reason.toLowerCase().includes(contact.value.toLowerCase()):['phone','whatsapp'].includes(contact.kind)&&reason.replace(/\D/g,'').includes(contact.value.replace(/\D/g,'').replace(/^55/,''))&&!currentText.includes(contact.value.replace(/\D/g,'').replace(/^55/,'')))))throw Error('radar_analysis_saved_citations_require_review')
    qualification=validatedQualificationProfile(mapped,qualifiedEvidence)
    if(qualification.profileRejections?.length)throw Error('radar_analysis_saved_citations_require_review')
  }catch{qualification=undefined;limits.push('radar_analysis_saved_citations_require_review')}
  if(qualification)output.analysisEvidence={...output.analysisEvidence,semantic:persistedRadarEvidenceVersion({...semanticContext,...(!savedQualificationBindings?{derivedFromHash:saved.qualificationEvidenceHash}:{})},savedQualificationBindings?saved.qualificationEvidenceHash:undefined)}
  const readableInstitutional=pages.some(page=>!!page.text&&!page.limitation&&isRadarInstitutionalSource(page.url,{text:page.text}))
  if ((configuration.research.semanticQualificationEnabled||configuration.research.profileEnabled||configuration.research.sizeAssessment.enabled) && !qualification) {
    if(!readableInstitutional)limits.push('radar_qualification_waiting_public_read')
    else if(!qualifiedEvidence.length)limits.push('radar_qualification_waiting_identity')
    else if (dependencies.qualify) {
      try {
        qualification = await dependencies.qualify(qualifiedEvidence,evidenceHash,semanticContext)
        qualification=validatedQualificationProfile(qualification,qualifiedEvidence)
        output.qualification = qualification;output.qualificationEvidenceHash=evidenceHash
        output.analysisEvidence={...output.analysisEvidence,semantic:persistedRadarEvidenceVersion(semanticContext)}
      }
      catch (cause) { rethrowRadarAdaptiveYield(cause);qualification=undefined;output.qualification=undefined;output.qualificationEvidenceHash=undefined;
        limits.push(`Qualificação semântica pendente (${safeResearchError(cause)}). Os fatos foram preservados.`) }
    } else limits.push('radar_qualification_service_unavailable')
  }
  limits.push(...(qualification?.limitations??[]))
  const profile=qualification?.profile
  if(configuration.research.profileEnabled&&!profile)limits.push(!readableInstitutional?'radar_profile_waiting_public_read':!qualifiedEvidence.length?'radar_profile_waiting_identity':'radar_profile_waiting_analysis')
  if(configuration.research.profileEnabled&&profile&&!profile.summary&&!profile.services.length&&!profile.customerSegments.length&&!profile.operatingRegions.length)
    limits.push('A análise não encontrou informações suficientes para descrever a empresa nas fontes lidas.')
  const sizeAssessment=configuration.research.sizeAssessment.enabled?assessRadarCompanySize(configuration.research.sizeAssessment,
    [...(dependencies.registrySizeFacts??[]),...(profile?.scaleSignals??[])]):undefined
  const documents=[...new Map([...(output.documents??[]).filter(item=>associatedPages.some(page=>page.url===item.sourceUrl)),...associatedPages.flatMap(page=>radarHtmlLinks(page.html??'').flatMap(link=>{
    try {
      const url=new URL(link,page.url)
      return !url.username&&!url.password&&url.origin===new URL(page.url).origin&&/\.pdf(?:$|\?)/i.test(url.toString())&&/balan[cç]o|demonstra|financ|annual|anual|relatorio/i.test(url.pathname)
        ?[{url:url.toString(),sourceUrl:page.url,observedAt:page.observedAt,status:'not_read' as const}]:[]
    }catch{return []}
  }))].map(item=>[item.url,item])).values()].slice(0,20)
  const dossier = { methodVersion:RADAR_RESEARCH_METHOD_VERSION,associationVersion:RADAR_ASSOCIATION_VERSION,
    ...(configuration.funnel.enabled?{funnel:output.funnel}:{}),
    deepResearchCompleted:output.deepResearchCompleted,deepResearchStop:output.deepResearchStop,
    historicalEvidence:output.historicalEvidence,targetedQueries:output.targetedQueries,analysisEvidence:output.analysisEvidence,
    discovery:{...discovery,websiteUrl:associatedOrigin??(discovery.websiteUrl&&isRadarInstitutionalSource(discovery.websiteUrl,{text:pages.find(page=>canonicalRadarReadUrl(page.url)===canonicalRadarReadUrl(discovery.websiteUrl!))?.text})?discovery.websiteUrl:undefined),association:associatedOrigin?'confirmed' as const:discovery.websiteUrl?'review' as const:discovery.association}, pages, contacts: uniqueContacts, registryPhone: identity.phone, siteAssociation:associated?'confirmed' as const:'review' as const, activity, qualification,
    qualificationEvidenceHash:qualification?evidenceHash:undefined,presenceResolution,presenceEvidenceHash:presenceResolution?presenceEvidenceHash:undefined,profile,sizeAssessment,documents,limitations: limits }
  const qualityDecision=configuration.funnel.enabled?undefined:await decide('radar_quality_gate',pages,[])
  const result={...dossier,decisionReview:qualityDecision?.action==='review',quality:evaluateRadarResearchQuality({dossier,policy:configuration.research,currentRevision:true})}
  if(result.decisionReview){result.quality={...result.quality,readyForReview:false};result.limitations.push('A avaliação encontrou evidências que precisam de conferência antes da aprovação.')}
  Object.assign(output, result); await checkpoint('review')
  return result
}

type ResearchContext = pg.QueryResultRow & { id: string; organization_id: string; campaign_id: string; title: string; status: string;
  normalized_payload: Record<string, unknown>; search_configuration: unknown; configuration_revision: number; campaign_status: string;
  target_segment: string; offer_type: string; product_focus: string[]; target_cnaes: string[] }
type ResearchRun = pg.QueryResultRow & { id:string; organization_id:string; campaign_id:string; candidate_id:string; requested_by:string;
  operation?:'complete'|'resume'|'refresh'|'reanalyze';request_id?:string;
  configuration_revision:number; status:string; stage:string; output:Output; calls:Record<string, { status:string; source:string; result?:unknown; error?:string; evidenceHash?:string;evidenceVersion?:RadarEvidenceVersion;requestBindings?:RadarEvidenceBindings;effectReceiptId?:string;refreshAuthorized?:boolean;previous?:unknown;retryProvenByReceipt?:boolean;requestId?:string;retryAuthorization?:RadarAnalysisRetryBinding;costEstimate?:RadarCostEstimate;costPolicy?:RadarCostPolicy;budgetRequestId?:string;
    responseBody?:unknown;billingOutcome?:string;queryCount?:number;billableRequestCount?:number;usageDate?:string;query?:string;
    rejections?:Array<{error:string;evidenceHash?:string;observedAt:string}> }>;
  created_at:string; updated_at:string; completed_at?:string; error_code?:string; lease_id?:string; lease_until?:string }
const error = (code: string, statusCode = 409) => Object.assign(new Error(code), { statusCode })
function cachedReadAvailability<T extends {allowed:boolean;reasons:Array<{code:string}>;maximumCostPerCandidate:number;maxQueriesPerCandidate:number}>(availability:T,run:ResearchRun|undefined,revision:number,freshnessDays:number):T {
  const recoverable=run&&run.configuration_revision===revision&&(['partial','blocked','failed','succeeded'].includes(run.status)||run.status==='running'&&!!run.lease_until&&new Date(run.lease_until).getTime()<Date.now())&&(run.output.discovery||run.output.discoveryHits?.length||Object.values(run.calls).some(call=>call.status==='completed'&&Array.isArray(call.result)||!!call.responseBody))
    &&Date.now()-Date.parse(run.completed_at||run.created_at)<freshnessDays*86400000
  if(!availability.allowed&&recoverable&&availability.reasons.every(item=>['source_limit_exceeded','source_budget_exceeded'].includes(item.code)))
    return {...availability,allowed:true,reasons:[],maximumCostPerCandidate:0,maxQueriesPerCandidate:0}
  return availability
}
async function loadContext(pool: Pick<pg.Pool,'query'>, organizationId:string, candidateId:string) {
  const result = await pool.query<ResearchContext>(`SELECT candidate.*, campaign.search_configuration, campaign.configuration_revision,
    campaign.status AS campaign_status, campaign.target_segment, campaign.offer_type, campaign.product_focus, campaign.target_cnaes
    FROM public.radar_candidate_records candidate JOIN public.radar_campaigns campaign ON campaign.id = candidate.campaign_id
    WHERE candidate.id = $1 AND candidate.organization_id = $2 AND campaign.organization_id = $2`, [candidateId, organizationId])
  if (!result.rows[0]) throw error('radar_candidate_not_found',404)
  return result.rows[0]
}
export async function getRadarCandidateResearch(pool:pg.Pool, user:AuthUser, organizationId:string, candidateId:string) {
  await requireRadarScope(pool,user,{ organizationId,candidateId })
  const context = await loadContext(pool,organizationId,candidateId)
  const candidateProjection=projectRadarCompanyFacts(context.normalized_payload,context.title)
  const recordedIdentity=context.normalized_payload.researchDependencyVersions as {version?:number;identityHash?:string}|undefined
  const identityChanged=recordedIdentity?.version===1&&recordedIdentity.identityHash!==radarPayloadIdentityHash(context.normalized_payload,context.title)
  const [runs, availability] = await Promise.all([
    pool.query<ResearchRun>(`SELECT * FROM public.radar_candidate_research_runs WHERE candidate_id = $1 AND organization_id = $2
      ORDER BY created_at DESC LIMIT 5`, [candidateId, organizationId]),
    getRadarResearchAvailability(pool,user,organizationId,context.campaign_id),
  ])
  const latest = runs.rows[0]
  const tlsExceptions=latest?await listRadarTlsExceptions(pool,{organizationId,candidateId,runId:latest.id,configurationRevision:latest.configuration_revision}):[]
  const tlsDiagnostics=latest?.output.pages?.filter(page=>page.diagnostic?.kind==='tls_expired'&&page.certificate)
    .map(page=>({diagnosticId:radarTlsDiagnosticId(latest.id,page),...page.certificate!}))??[]
  const expired=latest?.status==='running'&&latest.lease_until&&Date.parse(latest.lease_until)<Date.now()
  const available=cachedReadAvailability(availability,latest,context.configuration_revision,resolveRadarSearchConfiguration(context.search_configuration).research.freshnessDays)
  const identity={name:String(context.normalized_payload.tradeName||context.title),legalName:typeof context.normalized_payload.legalName==='string'?context.normalized_payload.legalName:undefined,cnpj:typeof context.normalized_payload.cnpj==='string'?context.normalized_payload.cnpj:undefined}
  const projectedOutput=latest?currentDossierProjection(latest.output,context.configuration_revision,latest.configuration_revision,resolveRadarSearchConfiguration(context.search_configuration).research.contactPurpose,identity,identityChanged):undefined
  const policy=resolveRadarSearchConfiguration(context.search_configuration).research
  const requestedFields:Parameters<typeof projectRadarCommercialResearchStatus>[0]['requestedFields']=['website','identity','email','phone',...(policy.contactPurpose==='suppliers'?['supplierChannel' as const]:[]),...(policy.profileEnabled?['companyProfile' as const]:[]),...(policy.sizeAssessment.enabled?['companySize' as const]:[]),...(policy.semanticQualificationEnabled?['fit' as const]:[])]
  return { companyIdentity:{tradeName:context.normalized_payload.tradeName??context.title,legalName:context.normalized_payload.legalName},methodVersion:RADAR_RESEARCH_METHOD_VERSION,
    commercialStatus:projectRadarCommercialResearchStatus({run:latest?{...latest,output:projectedOutput}:undefined,previous:context.normalized_payload.researchRunId===latest?.id?context.normalized_payload.previousResearch:context.normalized_payload,requestedFields}),
    availability:{...available,operations:{...available.operations,refresh:{allowed:availability.allowed,reasons:availability.reasons}}},configurationRevision:context.configuration_revision,
    run:latest?{...latest,...(expired?{status:'blocked',error_code:'radar_research_worker_interrupted_retry_available'}:{}),calls:undefined,output:projectedOutput!}:null,
    previousResearch:candidateProjection.previousResearch,researchRefreshIncomplete:context.normalized_payload.researchRefreshIncomplete,
    tlsExceptions,tlsDiagnostics,tlsCanAuthorize:user.role==='yux_admin'&&context.status==='pending_review'&&latest?.configuration_revision===context.configuration_revision,
    history:runs.rows.slice(1).map(run => ({ id:run.id, status:run.status, updated_at:run.updated_at })) }
}
export async function listRadarResearchHistory(pool:pg.Pool,user:AuthUser,organizationId:string,campaignId:string){
  await requireRadarScope(pool,user,{organizationId,campaignId})
  const result=await pool.query<{id:string;candidateId:string;companyName:string;configurationRevision:number;operation:string;status:string;updatedAt:string}>(`SELECT run.id,run.candidate_id AS "candidateId",candidate.title AS "companyName",run.configuration_revision AS "configurationRevision",run.operation,run.status,run.updated_at AS "updatedAt"
    FROM public.radar_candidate_research_runs run JOIN public.radar_candidate_records candidate ON candidate.id=run.candidate_id AND candidate.organization_id=run.organization_id
    WHERE run.organization_id=$1 AND run.campaign_id=$2 ORDER BY run.created_at DESC,run.id DESC LIMIT 100`,[organizationId,campaignId])
  return result.rows
}
export async function reopenRadarResearchReview(pool:pg.Pool,user:AuthUser,input:{organizationId:string;candidateId:string;configurationRevision:number}){
  await requireRadarScope(pool,user,{organizationId:input.organizationId,candidateId:input.candidateId},true)
  if(user.role!=='yux_admin'||!await isRadarEnabledOrganization(pool,input.organizationId))throw error('radar_source_admin_required',403)
  const client=await pool.connect()
  try{
    await client.query('BEGIN')
    const row=(await client.query(`SELECT campaign.configuration_revision FROM public.radar_campaigns campaign JOIN public.radar_candidate_records candidate ON candidate.campaign_id=campaign.id AND candidate.organization_id=campaign.organization_id WHERE candidate.id=$1 AND candidate.organization_id=$2 FOR UPDATE OF campaign`,[input.candidateId,input.organizationId])).rows[0]
    if(row?.configuration_revision!==input.configurationRevision)throw error('radar_campaign_configuration_changed')
    await client.query(`UPDATE public.radar_b2b_reviews SET approved_at=NULL,approved_by=NULL,updated_at=NOW() WHERE candidate_id=$1 AND organization_id=$2`,[input.candidateId,input.organizationId])
    await client.query('COMMIT');return{candidateId:input.candidateId,approved:false}
  }catch(cause){await client.query('ROLLBACK');throw cause}finally{client.release()}
}
export async function startRadarCandidateResearch(pool:pg.Pool,user:AuthUser,input:{organizationId:string;candidateId:string;configurationRevision:number;requestId?:string;allowSemanticRefresh?:boolean;operation?:'complete'|'resume'|'refresh'|'reanalyze'}) {
  if(input.allowSemanticRefresh&&user.role!=='yux_admin')throw error('research_admin_required',403)
  await requireRadarScope(pool,user,{ organizationId:input.organizationId,candidateId:input.candidateId },true)
  const context = await loadContext(pool,input.organizationId,input.candidateId)
  if (context.configuration_revision !== input.configurationRevision) throw error('radar_campaign_configuration_changed')
  if (context.status !== 'pending_review') throw error('radar_candidate_not_pending')
  const availability = await getRadarResearchAvailability(pool,user,input.organizationId,context.campaign_id)
  const configuration = resolveRadarSearchConfiguration(context.search_configuration)
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`radar-research:${input.candidateId}`])
    const campaign = await client.query('SELECT configuration_revision FROM public.radar_campaigns WHERE id = $1 FOR UPDATE',[context.campaign_id])
    if (campaign.rows[0]?.configuration_revision !== input.configurationRevision) throw error('radar_campaign_configuration_changed')
    const approval = await client.query('SELECT approved_at FROM public.radar_b2b_reviews WHERE candidate_id = $1 FOR UPDATE',[input.candidateId])
    if (approval.rows[0]?.approved_at) throw error('radar_research_approved_candidate_requires_review')
    const operation=input.operation??'complete'
    if(operation==='resume')await client.query(`UPDATE public.radar_candidate_research_runs SET status='blocked',error_code='radar_research_worker_interrupted_retry_available',lease_id=NULL,lease_until=NULL,updated_at=NOW()
      WHERE organization_id=$1 AND candidate_id=$2 AND configuration_revision=$3 AND status='running' AND lease_until<NOW()`,[input.organizationId,input.candidateId,input.configurationRevision])
    if(['refresh','reanalyze'].includes(operation)&&!input.requestId)throw error('radar_research_request_id_required',400)
    if(input.requestId){
      const duplicate=await client.query<ResearchRun>(`SELECT * FROM public.radar_candidate_research_runs WHERE candidate_id=$1 AND organization_id=$2 AND request_id=$3`,[input.candidateId,input.organizationId,input.requestId])
      if(duplicate.rows[0]&&(operation!=='resume'||['queued','running'].includes(duplicate.rows[0].status)||assessRadarCaptureResearch(duplicate.rows[0]).status==='completed')){await reconcileRadarCaptureItems(client,{organizationId:input.organizationId,candidateId:input.candidateId,runId:duplicate.rows[0].id});await client.query('COMMIT');return{runId:duplicate.rows[0].id,status:duplicate.rows[0].status,reused:true}}
    }
    const previous = await client.query<ResearchRun>(`SELECT * FROM public.radar_candidate_research_runs
      WHERE candidate_id = $1 AND organization_id = $2 AND (configuration_revision = $3 OR $4='reanalyze') ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,[input.candidateId,input.organizationId,input.configurationRevision,operation])
    let run = previous.rows[0]
    const activeRun=await client.query<ResearchRun>(`SELECT * FROM public.radar_candidate_research_runs WHERE candidate_id=$1 AND organization_id=$2 AND status IN ('queued','running') AND configuration_revision=$3 ORDER BY created_at DESC LIMIT 1`,[input.candidateId,input.organizationId,input.configurationRevision])
    if(activeRun.rows[0]){await reconcileRadarCaptureItems(client,{organizationId:input.organizationId,candidateId:input.candidateId,runId:activeRun.rows[0].id});await client.query('COMMIT');return{runId:activeRun.rows[0].id,status:activeRun.rows[0].status,reused:true}}
    if(operation==='reanalyze'&&(!run?.output.discovery||!run.output.pages?.some(page=>!!page.text&&!page.limitation)))throw error('radar_research_saved_evidence_required')
    const available=operation==='refresh'?availability:operation==='reanalyze'?{...availability,allowed:availability.operations.reanalyze.allowed}
      :cachedReadAvailability(availability,run,input.configurationRevision,configuration.research.freshnessDays)
    if(!available.allowed)throw Object.assign(error('radar_research_unavailable'),{reasons:available.reasons})
    if(run&&!availability.allowed&&available.allowed) {
      run.output={...run.output,discoveryLocked:true}
      await client.query('UPDATE public.radar_candidate_research_runs SET output = $3::jsonb WHERE id=$1 AND organization_id=$2',
        [run.id,input.organizationId,JSON.stringify(run.output)])
    }
    const fresh = !['refresh','reanalyze'].includes(operation)&&run&&run.configuration_revision===input.configurationRevision
      &&(['queued','running'].includes(run.status) || operation==='resume'||Date.now() - Date.parse(run.completed_at||run.created_at) < configuration.research.freshnessDays * 86400000)
    if (fresh) {
      if (!['queued','running'].includes(run.status)&&assessRadarCaptureResearch(run).status!=='completed') {
        if(input.allowSemanticRefresh&&run.calls.presence?.status==='completed')run.calls.presence.refreshAuthorized=true
        if(input.allowSemanticRefresh&&(run.calls.presence?.status==='completed'||run.calls.semantic?.status==='completed')) {
          if(run.calls.semantic?.status==='completed')run.calls.semantic.refreshAuthorized=true
          await client.query('UPDATE public.radar_candidate_research_runs SET calls=$3::jsonb WHERE id=$1 AND organization_id=$2',
            [run.id,input.organizationId,JSON.stringify(run.calls)])
        }
        const updated = await client.query<ResearchRun>(`UPDATE public.radar_candidate_research_runs SET status='queued', error_code=NULL,funnel_outcome=NULL,
          requested_by=$2, updated_at=NOW() WHERE id=$1 RETURNING *`,[run.id,user.id]); run = updated.rows[0]
      }
    } else {
      const inherited:Output=operation==='reanalyze'&&run?{...run.output,pages:run.output.pages?.filter(page=>!!page.text&&!page.limitation),readingComplete:true,
        discoveryLocked:true,analysisOnly:true,qualification:undefined,qualificationEvidenceHash:undefined,profile:undefined,sizeAssessment:undefined}:{}
      const inserted = await client.query<ResearchRun>(`INSERT INTO public.radar_candidate_research_runs
        (organization_id,campaign_id,candidate_id,requested_by,configuration_revision,request_id,operation,output) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb) RETURNING *`,
      [input.organizationId,context.campaign_id,input.candidateId,user.id,input.configurationRevision,input.requestId??null,operation,JSON.stringify(inherited)]); run = inserted.rows[0]
    }
    await reconcileRadarCaptureItems(client,{organizationId:input.organizationId,candidateId:input.candidateId,runId:run.id})
    await client.query('COMMIT')
    return { runId:run.id,status:run.status,reused:!!fresh }
  } catch (cause) { await client.query('ROLLBACK'); throw cause } finally { client.release() }
}

export async function executeRadarCandidateResearch(pool:pg.Pool,env:AppEnv,input:{runId:string;organizationId:string},signal?:AbortSignal,
  dependencies: { web?:typeof searchRadarWeb; local?:typeof searchRadarPlaces; collect?:typeof collectRadarSiteEvidence;
    loadSecret?:typeof loadPlatformProviderSecret; runtime?:typeof invokeAgentRuntime } = {}) {
  const lease = randomUUID()
  const acquired = await pool.query<ResearchRun>(`UPDATE public.radar_candidate_research_runs SET status='running',lease_id=$2,
    lease_until=NOW()+INTERVAL '6 minutes',updated_at=NOW() WHERE id=$1 AND status IN ('queued','running')
    AND organization_id=$3 AND (lease_until IS NULL OR lease_until < NOW()) RETURNING *`,[input.runId,lease,input.organizationId])
  const run = acquired.rows[0]
  if (!run) return { status:'already_running_or_completed' }
  let adaptiveTurn=false,effectCompleted=false
  const beforeEffect=()=>{if(adaptiveTurn&&effectCompleted)throw new RadarAdaptiveTurnYield()}
  const runtime:typeof invokeAgentRuntime=async<T>(runtimeEnv:AppEnv,path:string,body:Record<string,unknown>,options?:{timeoutMs?:number}):Promise<T>=>{
    if(path!=='/radar/revalidate')beforeEffect()
    try{const result=await(dependencies.runtime??invokeAgentRuntime)<T>(runtimeEnv,path,body,options);if(path!=='/radar/revalidate')effectCompleted=true;return result}
    catch(cause){if(path!=='/radar/revalidate'&&!/agent_runtime_402:(radar_ai_wallet_missing|radar_ai_credits_insufficient)/.test(cause instanceof Error?cause.message:''))effectCompleted=true;throw cause}
  }
  const checkpoint = async (stage:string, output:Output) => {
    signal?.throwIfAborted()
    await updateResearchProgress(pool,run,client=>client.query(`UPDATE public.radar_candidate_research_runs SET stage=$3,output=$4::jsonb,lease_until=NOW()+INTERVAL '6 minutes',updated_at=NOW()
      WHERE id=$1 AND lease_id=$2 AND lease_until>NOW() RETURNING id`,[run.id,lease,stage,JSON.stringify(output)]))
    if(adaptiveTurn&&effectCompleted)throw new RadarAdaptiveTurnYield()
  }
  try {
    const userResult = await pool.query<{id:string;role:string}>(`SELECT id,role FROM public.app_users WHERE id=$1 AND is_active=TRUE`,[run.requested_by])
    if (!userResult.rows[0] || !await isRadarEnabledOrganization(pool,run.organization_id)) throw error('research_admin_required',403)
    const user = userResult.rows[0] as AuthUser
    await requireRadarScope(pool,user,{organizationId:run.organization_id,campaignId:run.campaign_id,candidateId:run.candidate_id},true)
    const context = await loadContext(pool,run.organization_id,run.candidate_id)
    if (context.configuration_revision !== run.configuration_revision) throw error('radar_campaign_configuration_changed')
    if (context.status !== 'pending_review' || ['paused','archived','completed'].includes(context.campaign_status)) throw error('radar_campaign_or_candidate_inactive')
    const configuration = resolveRadarSearchConfiguration(context.search_configuration)
    adaptiveTurn=configuration.discovery.enabled&&(await pool.query(`SELECT EXISTS(SELECT 1 FROM public.radar_capture_items WHERE run_id=$1 AND organization_id=$2 UNION ALL SELECT 1 FROM public.radar_research_request_items WHERE run_id=$1 AND organization_id=$2) AS bound`,[run.id,run.organization_id])).rows[0]?.bound===true
    if (!configuration.research.enabled) throw error('campaign_research_disabled')
    const payload = context.normalized_payload
    const funnelPolicy=configuration.funnel.enabled?await loadRadarOperationalLimits(pool):undefined
    const funnelEmailPolicy=configuration.funnel.enabled?(await loadRadarEmailDomainPolicy(pool)).configuration:undefined
    const funnelReadiness=configuration.funnel.enabled?await getRadarResearchAvailability(pool,user,run.organization_id,run.campaign_id):undefined
    const sourceCostsBrl=funnelReadiness?Object.fromEntries(funnelReadiness.estimates.filter(item=>item.available).map(item=>[item.sourceType,item.costPerQuery])):undefined
    const intentBudget=await loadRadarResearchIntentBudget(pool,{organizationId:run.organization_id,candidateId:run.candidate_id,runId:run.id,configurationRevision:run.configuration_revision})
    const str = (key:string) => typeof payload[key] === 'string' ? payload[key] as string : undefined
    const identity:RadarBusinessIdentity = {name:str('tradeName') || context.title,legalName:str('legalName'),cnpj:str('cnpj'),
      city:str('city'),state:str('state'),address:str('address'),phone:str('phoneRaw'),websiteUrl:str('websiteUrl')}
    const searchCapacity=()=>{
      const capacity=resolveRadarSearchCapacity({calls:run.calls,policy:configuration.research,intent:intentBudget})
      const selected=new Set<string>(configuration.research.webSearchEnabled?configuration.research.webSearchProviders:[])
      if(configuration.sources.enrichWithBrave&&configuration.research.localSearchOrder!=='disabled'&&identity.city&&identity.state)selected.add('brave_place_search')
      for(const source of Object.keys(capacity.bySource))if(!selected.has(source))capacity.bySource[source].remaining=0
      if(sourceCostsBrl)for(const source of Object.keys(capacity.bySource))if(!(source in sourceCostsBrl))capacity.bySource[source].remaining=0
      return capacity
    }
    const searchAttempted=(source:RadarSearchSource,query:string)=>!!run.calls[createHash('sha256').update(`${source}:${query}`).digest('hex')]
    const assertEffectAuthorization=async(queryable:Pick<pg.Pool,'query'>=pool)=>{
      signal?.throwIfAborted()
      const requester=(await queryable.query('SELECT id,role FROM public.app_users WHERE id=$1 AND is_active=TRUE',[run.requested_by])).rows[0]
      if(!requester||!await isRadarEnabledOrganization(queryable,run.organization_id))throw error('research_admin_required',403)
      await requireRadarScope(queryable,requester as AuthUser,{organizationId:run.organization_id,campaignId:run.campaign_id,candidateId:run.candidate_id},true)
      const current=await loadContext(queryable,run.organization_id,run.candidate_id)
      if(current.configuration_revision!==run.configuration_revision)throw error('radar_campaign_configuration_changed')
      if(current.status!=='pending_review'||['paused','archived','completed'].includes(current.campaign_status))throw error('radar_campaign_or_candidate_inactive')
      if(!resolveRadarSearchConfiguration(current.search_configuration).research.enabled)throw error('campaign_research_disabled')
      const approval=(await queryable.query('SELECT approved_at FROM public.radar_b2b_reviews WHERE candidate_id=$1 AND organization_id=$2',[run.candidate_id,run.organization_id])).rows[0]
      if(approval?.approved_at)throw error('radar_research_approved_candidate_requires_review')
    }
    const collect:typeof collectRadarSiteEvidence=async(url,policy,options={})=>{
      if(!adaptiveTurn)return(dependencies.collect??collectRadarSiteEvidence)(url,policy,options)
      const initial=options.initialPages??[],tls=await options.tlsOptions?.(new URL(url).hostname)
      const key=`read_${radarDecisionHash({url,policy,epoch:intentBudget?.requestId??run.request_id??run.id,reader:RADAR_READER_VERSION,tls:tls?.tlsException?.id,initial:radarEvidenceContentHash({identity:{},criteria:{},purpose:'read',evidence:initial})})}`
      const cached=run.calls[key]
      if(cached?.status==='completed'&&Array.isArray(cached.result))return uniqueRadarPages([...initial,...cached.result as RadarSiteEvidence[]])
      beforeEffect();await assertEffectAuthorization()
      const storeRead=async(pages:RadarSiteEvidence[])=>{
        const delta=pages.filter(page=>!initial.some(previous=>previous.url===page.url&&previous.text===page.text&&previous.limitation===page.limitation&&previous.html===page.html))
        if(!delta.length)return
        run.calls[key]={source:'public_read',status:'completed',result:delta}
        const saved=await pool.query('UPDATE public.radar_candidate_research_runs SET calls=$3::jsonb WHERE id=$1 AND lease_id=$2 AND lease_until>NOW() RETURNING id',[run.id,lease,JSON.stringify(run.calls)])
        if(!saved.rows.length)throw error('radar_research_lease_lost')
        effectCompleted=true
      }
      const result=await(dependencies.collect??collectRadarSiteEvidence)(url,policy,{...options,checkpoint:async pages=>{await storeRead(pages);await options.checkpoint?.(pages);if(effectCompleted)throw new RadarAdaptiveTurnYield()}})
      // Injected transports may return a single page without invoking a crawl
      // checkpoint. Persist that effect before the pipeline's next checkpoint.
      await storeRead(result)
      return result
    }
    const paid = async <T>(sourceKey:string,queryKey:string,request:(apiKey:string)=>Promise<T>):Promise<T> => {
      if(run.operation==='reanalyze')throw error('radar_reanalysis_does_not_search')
      signal?.throwIfAborted()
      const key = createHash('sha256').update(`${sourceKey}:${queryKey}`).digest('hex')
      const previous = run.calls[key]
      if (previous?.status === 'completed') return previous.result as T
      if (previous) throw error(previous.error || 'radar_research_previous_request_uncertain')
      beforeEffect()
      const reservation = await pool.connect()
      let apiKey:string
      try {
        await reservation.query('BEGIN')
        await reservation.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`radar-research-budget:${run.organization_id}:${run.campaign_id}`])
        await reservation.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`radar:${run.organization_id}:${sourceKey}`])
        const currentCampaign = await reservation.query('SELECT configuration_revision, budget_limit, status FROM public.radar_campaigns WHERE id=$1 AND organization_id=$2 FOR UPDATE',[run.campaign_id,run.organization_id])
        if (currentCampaign.rows[0]?.configuration_revision !== run.configuration_revision) throw error('radar_campaign_configuration_changed')
        if (['paused','archived','completed'].includes(currentCampaign.rows[0]?.status)) throw error('campaign_inactive')
        await assertEffectAuthorization(reservation)
        const operationalPolicy=await loadRadarOperationalLimits(reservation)
        const effective=resolveRadarSearchCapacity({calls:run.calls,policy:{...configuration.research,maxSearchQueriesPerCandidate:Math.min(configuration.research.maxSearchQueriesPerCandidate,operationalPolicy.limits.maxSearchQueriesPerCompany),maxSearchQueriesBySource:Object.fromEntries(Object.entries(configuration.research.maxSearchQueriesBySource).map(([source,value])=>[source,Math.min(value,operationalPolicy.limits.maxSearchQueriesPerCompany)]))},intent:intentBudget})
        if((effective.bySource[sourceKey]?.remaining??0)===0||effective.totalRemaining===0)throw error('candidate_search_limit_reached')
        const source = await findRadarDataSource(reservation as unknown as pg.Pool,run.organization_id,sourceKey)
        if (!source || source.defaultCostPerUnit <= 0) throw error('source_cost_required')
        const governance = await evaluateRadarSourceGovernance(reservation,run.organization_id,run.campaign_id,source,1,1,true)
        if (!governance.allowed) throw error(governance.issues[0].code)
        if (!hasRadarSearchCapacity(searchCapacity(),sourceKey)) throw error('candidate_search_limit_reached')
        const spent = await reservation.query("SELECT COALESCE(SUM(estimated_cost),0) AS cost FROM public.radar_source_usage_counters WHERE organization_id=$1 AND campaign_id=$2 AND source_type<>'perplexity_agent' AND usage_date=CURRENT_DATE",[run.organization_id,run.campaign_id])
        const budget = currentCampaign.rows[0]?.budget_limit
        if (budget !== null && budget !== undefined && compareRadarDecimal(addRadarDecimal(String(spent.rows[0]?.cost??0),String(source.defaultCostPerUnit)),String(budget))>0) throw error('source_budget_exceeded')
        const approvedUnit=intentBudget?.sourceUnitPricesBrl[sourceKey as keyof typeof intentBudget.sourceUnitPricesBrl]
        if(intentBudget&&(!approvedUnit||compareRadarDecimal(String(source.defaultCostPerUnit),approvedUnit)>0))throw error('radar_intent_source_price_changed')
        const provider = await reservation.query<{id:string;status:string;public_config:Record<string,unknown>}>(`SELECT id,status,public_config FROM public.platform_provider_connections WHERE provider_key=$1
          AND environment='production' ORDER BY is_default DESC,updated_at DESC LIMIT 1`,[sourceKey.startsWith('perplexity_')?'perplexity':sourceKey==='serper_web_search'?'serper':'brave_place'])
        const connection = provider.rows[0]
        if (connection?.status !== 'active') throw error('provider_inactive')
        const internal=(await reservation.query("SELECT kind='yux' AND is_internal_growth_workspace AS internal FROM public.organizations WHERE id=$1",[run.organization_id])).rows[0]?.internal===true
        if(!internal&&connection.public_config.clientDeliveryLicensed!==true)throw error('delivery_license_required')
        if(sourceKey.startsWith('perplexity_')&&connection.public_config.retentionLicensed!==true)throw error('retention_license_required')
        if(sourceKey.startsWith('brave_'))assertLicensedBraveRetention(connection.public_config)
        if (sourceKey!=='brave_place_search' && connection.public_config.webSearchLicensed !== true) throw error('web_license_required')
        const material = env.PROVIDER_SECRET_ENCRYPTION_KEY_B64 ? `provider-key:${env.PROVIDER_SECRET_ENCRYPTION_KEY_B64}` : env.SESSION_SECRET
        const secret = await (dependencies.loadSecret ?? loadPlatformProviderSecret)(reservation as unknown as pg.Pool,connection.id,'api_key',material)
        if (!secret) throw error('provider_secret_missing')
        apiKey = secret
        await recordRadarSourceUsage(reservation,run.organization_id,run.campaign_id,source,1,source.defaultCostPerUnit)
        run.calls[key] = {status:'reserved',source:sourceKey,query:queryKey,usageDate:(await reservation.query('SELECT CURRENT_DATE::text AS usage_date')).rows[0]?.usage_date,costEstimate:estimateRadarCostBrl({amount:String(source.defaultCostPerUnit),currency:'BRL',rateSnapshot:frozenRadarCostPolicy(intentBudget,operationalPolicy.costPolicy)}),...(intentBudget?{budgetRequestId:intentBudget.requestId}:{})}
        const reserved=await reservation.query(`UPDATE public.radar_candidate_research_runs SET calls=$3::jsonb WHERE id=$1 AND lease_id=$2 AND status='running' AND lease_until>NOW() RETURNING id`,[run.id,lease,JSON.stringify(run.calls)])
        if(!reserved.rows[0])throw error('radar_research_lease_lost')
        await reservation.query('COMMIT')
      } catch (cause) { await reservation.query('ROLLBACK');delete run.calls[key];throw cause } finally { reservation.release() }
      // No automatic replay after a crash/ambiguous response. Reserved units still count against the cap.
      try { const result = await request(apiKey); effectCompleted=true;run.calls[key] = {...run.calls[key],status:'completed',result}; return result }
      catch (cause) {
        effectCompleted=true
        const previous=run.calls[key],notBilled=sourceKey.startsWith('perplexity_')&&(cause as {billingOutcome?:string})?.billingOutcome==='not_billed'
        run.calls[key] = {...previous,status:'failed',error:cause instanceof Error ? cause.message:'provider_request_failed',...(sourceKey.startsWith('perplexity_')?{billingOutcome:notBilled?'not_billed':(cause as {billingOutcome?:string}).billingOutcome??'uncertain'}:{}),...(notBilled?{billableRequestCount:0,costEstimate:estimateRadarCostBrl({amount:'0',currency:'BRL',rateSnapshot:previous.costPolicy??previous.costEstimate?.rateSnapshot??null})}:{})}
        if(notBilled&&previous.usageDate){
          const refund=await pool.connect()
          try{
            await refund.query('BEGIN')
            await refund.query('SELECT id FROM public.radar_campaigns WHERE id=$1 AND organization_id=$2 FOR UPDATE',[run.campaign_id,run.organization_id])
            const recorded=await refund.query(`UPDATE public.radar_candidate_research_runs SET calls=jsonb_set(calls,ARRAY[$3],$4::jsonb) WHERE id=$1 AND lease_id=$2 AND lease_until>NOW() AND calls->$3->>'status'='reserved' RETURNING id`,[run.id,lease,key,JSON.stringify(run.calls[key])])
            if(recorded.rows.length)await refund.query(`UPDATE public.radar_source_usage_counters SET estimated_cost=GREATEST(0,estimated_cost-$5::numeric),updated_at=NOW() WHERE organization_id=$1 AND campaign_id=$2 AND source_type=$3 AND usage_date=$4::date`,[run.organization_id,run.campaign_id,sourceKey,previous.usageDate,previous.costEstimate?.amountBrl??'0'])
            await refund.query('COMMIT')
          }catch(failure){await refund.query('ROLLBACK');throw failure}finally{refund.release()}
        }
        throw cause
      }
      finally { const updated=await pool.query(`UPDATE public.radar_candidate_research_runs SET calls=$3::jsonb,updated_at=NOW() WHERE id=$1 AND lease_id=$2 RETURNING id`,[run.id,lease,JSON.stringify(run.calls)]);if(!updated.rows[0])throw error('radar_research_lease_lost') }
    }
    // A received reply belongs to the original reservation. Normalize it for
    // free after a parser/checkpoint failure; never purchase the query again.
    for(const call of Object.values(run.calls)){
      if(call.status==='completed'||!call.responseBody||!call.query||!['perplexity_search_fast','perplexity_search_web'].includes(call.source))continue
      try{call.result=await normalizeSavedRadarWeb({provider:call.source as RadarWebSearchProvider,query:call.query,limit:20},call.responseBody);call.status='completed'}
      catch{continue} // Preserve unreadable raw material and its uncertain hold.
    }
    // Recover a completed provider response even if the process stopped before the discovery checkpoint.
    const cachedHits=Object.values(run.calls).flatMap(call=>call.status==='completed' && ['brave_web_search','serper_web_search','perplexity_search_fast','perplexity_search_web'].includes(call.source) && Array.isArray(call.result)?call.result as RadarWebHit[]:[])
    const cachedLocal=Object.values(run.calls).flatMap(call=>call.status==='completed'&&call.source==='brave_place_search'&&Array.isArray(call.result)
      ? (call.result as Awaited<ReturnType<typeof searchRadarPlaces>>).flatMap(place=>place.sourceUrl?[{url:place.websiteUrl||place.sourceUrl,title:place.name,
        snippets:[place.address,place.phone,place.email].filter((value):value is string=>!!value),observedAt:place.observedAt}]:[]):[])
    const invokeAnalysis=async<T>(key:'presence'|'semantic',path:string,body:Record<string,unknown>):Promise<T>=>{
      try{return await runtime<T>(env,path,body)}
      catch(cause){
        const message=cause instanceof Error?cause.message:''
        // Explicit wallet denial and typed request-validation rejection prove that
        // no provider started. Other 422 responses may follow a paid generation.
        const rejection=/^agent_runtime_402:(radar_ai_wallet_missing|radar_ai_credits_insufficient)$/.exec(message)?.[1]
          ??(message==='agent_runtime_422:radar_request_invalid'?'radar_request_invalid':undefined)
        if(rejection){
          const call=run.calls[key]
          run.calls[key]={...call,status:'rejected_before_provider',error:rejection,
            rejections:[...(call.rejections??[]),{error:rejection,evidenceHash:call.evidenceHash,observedAt:new Date().toISOString()}]}
          const updated=await pool.query('UPDATE public.radar_candidate_research_runs SET calls=$3::jsonb WHERE id=$1 AND lease_id=$2 RETURNING id',[run.id,lease,JSON.stringify(run.calls)])
          if(!updated.rows[0])throw error('radar_research_lease_lost')
        }
        throw cause
      }
    }
    const recoverAnalysis=async(key:'presence'|'semantic',evidenceHash:string)=>{
      const previous=run.calls[key]
      if(!previous||previous.status==='completed'||canRetryPreProviderRejection(previous))return
      const action=key==='presence'?'radar_presence_resolution':'radar_business_qualification'
      const requestId=previous.requestId??(key==='presence'?`${run.id}:presence:${evidenceHash}`:`${run.id}:${evidenceHash}`)
      if(previous.evidenceHash!==evidenceHash)return
      const recovered=await pool.query(`SELECT analysis.*,effect.id AS effect_id,effect.transport_outcome,effect.validation_outcome,effect.failure_code
        FROM public.radar_analysis_receipts analysis LEFT JOIN LATERAL(SELECT id,transport_outcome,validation_outcome,failure_code FROM public.radar_effect_receipts WHERE analysis_receipt_id=analysis.id AND organization_id=analysis.organization_id AND transport_outcome='received' AND response_body IS NOT NULL ORDER BY attempt DESC LIMIT 1) effect ON TRUE
        WHERE analysis.organization_id=$1 AND analysis.action=$2 AND analysis.request_id=$3`,[run.organization_id,action,requestId])
      // Exact tenant/action/request/evidence identity; the runtime also verifies its
      // full input hash before reclaiming a rejection, before debit/provider access.
      const receipt=recovered.rows[0]
      const requestBindings=previous.requestBindings??(previous.evidenceVersion&&previous.evidenceHash===previous.evidenceVersion.hash
        ?[...previous.evidenceVersion.bindings].sort((a,b)=>a.key.localeCompare(b.key)).map((binding,index)=>({...binding,id:`page-${index}`})):undefined)
      const bindResult=(result:unknown)=>requestBindings&&previous.evidenceVersion?remapRadarEvidenceResult(result,requestBindings,previous.evidenceVersion.bindings):result
      if(receipt?.status==='rejected_before_provider'||receipt?.status==='completed'&&receipt.result){run.calls[key]=receipt.status==='completed'?{...previous,status:'completed',result:bindResult(receipt.result)}:{...previous,status:'rejected_before_provider',retryProvenByReceipt:true,error:'radar_analysis_rejected_before_provider'}
        await pool.query('UPDATE public.radar_candidate_research_runs SET calls=$3::jsonb,updated_at=NOW() WHERE id=$1 AND lease_id=$2',[run.id,lease,JSON.stringify(run.calls)])}
      else if(receipt?.transport_outcome==='received'&&receipt.input_hash&&receipt.input_request){
        await assertEffectAuthorization()
        try{
          const result=await(dependencies.runtime??invokeAgentRuntime)<unknown>(env,'/radar/revalidate',{
            organization_id:run.organization_id,action,request_id:requestId,input_hash:receipt.input_hash,
            client_id:receipt.input_request.client_id??null,contract_id:receipt.input_request.contract_id??null})
          run.calls[key]={...previous,status:'completed',result:bindResult(result),effectReceiptId:String(receipt.effect_id)}
        }catch(cause){
          const message=cause instanceof Error?cause.message:''
          const failure=/^agent_runtime_422:((?:radar_[a-z0-9_]+)|output_truncated)$/.exec(message)?.[1]
          run.calls[key]={...previous,status:failure&&failure!=='radar_request_invalid'?'received_invalid':'received_pending_validation',
            error:!failure||failure==='radar_request_invalid'?'radar_analysis_revalidation_unavailable':failure==='output_truncated'?'radar_analysis_output_truncated':failure,effectReceiptId:String(receipt.effect_id)}
        }
        const updated=await pool.query('UPDATE public.radar_candidate_research_runs SET calls=$3::jsonb,updated_at=NOW() WHERE id=$1 AND lease_id=$2 RETURNING id',[run.id,lease,JSON.stringify(run.calls)])
        if(!updated.rows[0])throw error('radar_research_lease_lost')
      }
    }
    const decisionRequester=(await pool.query('SELECT id,role FROM public.app_users WHERE id=$1 AND is_active=TRUE',[run.requested_by])).rows[0] as AuthUser
    const funnelScope={organizationId:run.organization_id,campaignId:run.campaign_id,candidateId:run.candidate_id,runId:run.id,leaseId:lease,configurationRevision:run.configuration_revision,expectedProjectionVersion:radarCompanyProjectionVersion(context.normalized_payload)}
    const decide=async(task:DecisionContextV1['task'],pages:RadarSiteEvidence[],options:DecisionContextV1['options'],meta?:{step?:number;associatedWebsite?:string}):Promise<RadarFunnelDecision>=>{
      if(run.operation==='reanalyze')return{action:'continue'}
      try{
        const {websiteUrl:_website,phone:_phone,...decisionIdentity}=identity
        const decisionContext:DecisionContextV1={schemaVersion:1,organizationId:run.organization_id,campaignId:run.campaign_id,candidateId:run.candidate_id,configurationRevision:run.configuration_revision,task,
          identity:decisionIdentity,criteria:{segment:context.target_segment,offer:context.offer_type,products:context.product_focus,includeTerms:configuration.qualification.includeAnyTerms,includeAllTerms:configuration.qualification.includeAllTerms,excludeTerms:configuration.qualification.excludeTerms,desiredCnaes:context.target_cnaes,cnaeRule:configuration.qualification.requireCnaeMatch?'required':'advisory',requiredContacts:configuration.research.completion.contactTypes,minimumUsefulContacts:String(configuration.research.completion.minimumUsefulContacts),contactPurpose:configuration.research.contactPurpose},
          evidence:pages.filter(page=>!!page.text&&!page.limitation).slice(0,30).map(page=>({id:`ev_${radarDecisionHash({url:page.url,text:page.text}).slice(0,24)}`,sourceUrl:page.url,text:page.text,role:'activity',primary:isRadarInstitutionalSource(page.url,{text:page.text}),contradictory:cnpjConflict(identity,page.text),scope:!cnpjConflict(identity,page.text)&&matchRadarBusinessIdentity(identity,page.text)==='confirmed'?'establishment':'unresolved'})),options,humanReviewed:payload.manualDecisionOverride===true||payload.braveMatchStatus==='manual_matched'}
        if(configuration.funnel.enabled){
          decisionContext.contextVersion='radar-decision-context-v2'
          decisionContext.criteria={...radarFunnelDecisionCriteria(configuration,context),registryFlags:evaluateRadarRegistryRules({payload,targetCnaes:context.target_cnaes,configuration}).flags}
          decisionContext.evidence=buildRadarFunnelEvidence({identity,registryPayload:payload,targetCnaes:context.target_cnaes,pages:task==='radar_initial_triage'?[]:pages,associatedWebsite:meta?.associatedWebsite})
          decisionContext.humanReviewed=false
          if(task==='radar_next_action')decisionContext.step=meta?.step??0
        }
        const result=await decideRadarAction(pool,decisionRequester,decisionContext,{env,runId:run.id,leaseId:lease,runtime,authorize:assertEffectAuthorization,beforeEffect})
        if(configuration.funnel.enabled){
          if(task==='radar_next_action')return applyRadarFunnelNextAction(pool,{...funnelScope,result:result.result,requestId:result.requestId,options,step:meta?.step??0},{authorize:assertEffectAuthorization})
          if(task==='radar_initial_triage'||task==='radar_fit_gate')return applyRadarFunnelGateDecision(pool,{...funnelScope,gate:task==='radar_initial_triage'?'g1':'g5',result:result.result,routeFingerprint:result.routeFingerprint,requestId:result.requestId,evidence:decisionContext.evidence,associatedWebsite:meta?.associatedWebsite},{authorize:assertEffectAuthorization})
        }
        return{action:result.action}
      }catch(cause){
        rethrowRadarAdaptiveYield(cause)
        signal?.throwIfAborted()
        // Optional decisions must not stop facts collection. Uncertain effects
        // remain in their receipts/calls and are never silently repurchased.
        if(cause instanceof Error&&['radar_research_lease_lost','radar_campaign_configuration_changed','radar_research_projection_changed','radar_campaign_or_candidate_inactive','radar_research_approved_candidate_requires_review'].includes(cause.message)||(cause as {statusCode?:number})?.statusCode===403)throw cause
        return{action:'continue'}
      }finally{
        const savedCalls=(await pool.query('SELECT calls FROM public.radar_candidate_research_runs WHERE id=$1 AND lease_id=$2',[run.id,lease])).rows[0]?.calls
        if(savedCalls)run.calls=savedCalls
      }
    }
    const dossier = await runRadarResearchPipeline(identity,configuration,{...run.output,
      ...(run.operation==='reanalyze'?{analysisOnly:true,discoveryLocked:true,readingComplete:true}:{}),
      discoveryHits:[...(run.output.discoveryHits??run.output.discovery?.hits??[]),...cachedHits,...cachedLocal],
      discoveryQueries:Object.values(run.calls).filter(call=>['brave_web_search','serper_web_search','brave_place_search','perplexity_search_fast','perplexity_search_web'].includes(call.source)).length},{
      signal,checkpoint,decide,analysisCriteria:{segment:context.target_segment,offer:context.offer_type,products:context.product_focus},registrySizeFacts:registryRadarSizeFacts(payload),collect:run.operation==='reanalyze'||!configuration.sources.inspectWebsite ? async () => [] : collect,
      registryPayload:payload,targetCnaes:context.target_cnaes,emailPolicy:funnelEmailPolicy,configurationRevision:run.configuration_revision,funnelOverrides:radarScopedFunnelOverrides(payload),
      sourceCostsBrl,maxDecisionCalls:funnelPolicy?.limits.maxDecisionCallsPerCompany,
      onRegistryGate:configuration.funnel.enabled?()=>applyRadarFunnelRegistryGate(pool,funnelScope,{authorize:assertEffectAuthorization}):undefined,
      onInitialGate:configuration.funnel.enabled?blocked=>markRadarFunnelInitialGate(pool,funnelScope,blocked,{authorize:assertEffectAuthorization}):undefined,
      collectSocial:adaptiveTurn?(input,options={})=>collectRadarPublicSocialEvidence(input,{...options,inspect:async url=>{beforeEffect();await assertEffectAuthorization();try{return await inspectRadarBusinessSite(url)}finally{effectCompleted=true}},checkpoint:async page=>{await options.checkpoint?.(page);if(effectCompleted)throw new RadarAdaptiveTurnYield()}}):undefined,
      deepResearch:configuration.research.deepResearchEnabled?async(gaps,pages)=>{
        const {websiteUrl:_website,phone:_phone,...subject}=identity
        const evidence=pages.filter(page=>!page.limitation&&page.text).slice(0,4).map(page=>({url:page.url,text:page.text.slice(0,1500)}))
        try{
          const result=await researchRadarGaps(pool,user,{organizationId:run.organization_id,candidateId:run.candidate_id,revision:run.configuration_revision,gaps,context:{identity:subject,criteria:{segment:context.target_segment,offer:context.offer_type,contactPurpose:configuration.research.contactPurpose},evidence,urls:evidence.map(page=>page.url)}},{env,runId:run.id,leaseId:lease,runtime,authorize:assertEffectAuthorization,beforeEffect})
          return result.evidence.map(item=>({url:item.sourceUrl,title:identity.name,snippets:[item.text],observedAt:item.observedAt,evidenceKind:'search_excerpt' as const}))
        }finally{
          const saved=(await pool.query('SELECT calls FROM public.radar_candidate_research_runs WHERE id=$1 AND lease_id=$2',[run.id,lease])).rows[0]?.calls
          if(saved)run.calls=saved
        }
      }:undefined,
      queriesUsed:()=>Object.values(run.calls).filter(call=>['brave_web_search','serper_web_search','brave_place_search','perplexity_search_fast','perplexity_search_web'].includes(call.source)).length,
      searchCapacity,searchAttempted,
      tlsOptions:hostname=>getRadarTlsReadOptions(pool,{organizationId:run.organization_id,candidateId:run.candidate_id,runId:run.id,configurationRevision:run.configuration_revision},hostname),
      local:configuration.sources.enrichWithBrave && configuration.research.localSearchOrder!=='disabled' && identity.city && identity.state ? async () => {
        const places = await paid('brave_place_search',identity.name,key => (dependencies.local ?? searchRadarPlaces)({provider:'brave_place_search',apiKey:key,query:identity.name,city:identity.city!,state:identity.state!,limit:5}))
        return places.flatMap(place => place.sourceUrl ? [{url:place.websiteUrl || place.sourceUrl,title:place.name,
          snippets:[place.address,place.phone,place.email].filter((value):value is string => !!value),observedAt:place.observedAt}] : [])
      } : undefined,
      web: async (query,selectedSource) => {
        const source=selectedSource??configuration.research.webSearchProviders.find(source=>hasRadarSearchCapacity(searchCapacity(),source))
        if(!source||!configuration.research.webSearchProviders.includes(source))throw error('candidate_search_limit_reached')
        return paid(source,query,key=>(dependencies.web??searchRadarWeb)({provider:source,apiKey:key,query,limit:5,
          ...(source.startsWith('perplexity_')?{onResponse:async(body:unknown)=>{
            const callKey=createHash('sha256').update(`${source}:${query}`).digest('hex')
            run.calls[callKey]={...run.calls[callKey],responseBody:sanitizeRadarEffectBody(body),billingOutcome:'billed',queryCount:1,billableRequestCount:1}
            const stored=await pool.query(`UPDATE public.radar_candidate_research_runs SET calls=$3::jsonb WHERE id=$1 AND lease_id=$2 AND lease_until>NOW() RETURNING id`,[run.id,lease,JSON.stringify(run.calls)])
            if(!stored.rows[0])throw error('radar_research_lease_lost')
          }}:{})}))
      },
      resolvePresence:async(evidence,evidenceHash,version)=>{
        const bindings=run.calls.presence&&radarEvidenceBindingMatch(run.calls.presence,version)
        await recoverAnalysis('presence',bindings?run.calls.presence.evidenceHash??evidenceHash:evidenceHash)
        const previous=run.calls.presence
        if(previous?.status==='completed'&&bindings){
          const result=remapRadarEvidenceResult(previous.result,bindings,version.bindings)
          validateRadarPresenceResolution(result,identity,evidence)
          previous.evidenceVersion={...persistedRadarEvidenceVersion(version,previous.evidenceHash),bindings}
          await pool.query('UPDATE public.radar_candidate_research_runs SET calls=$3::jsonb WHERE id=$1 AND lease_id=$2',[run.id,lease,JSON.stringify(run.calls)])
          return result
        }
        const baseRequestId=`${run.id}:presence:${evidenceHash}`
        const retry=previous&&previous.status!=='completed'&&!canRetryPreProviderRejection(previous)?await resolveRadarAnalysisRetry(pool,{organizationId:run.organization_id,campaignId:run.campaign_id,candidateId:run.candidate_id,runId:run.id,configurationRevision:run.configuration_revision,action:'radar_presence_resolution',previousRequestId:previous.requestId??`${run.id}:presence:${previous.evidenceHash}`,searchConfiguration:context.search_configuration}):previous&&canRetryPreProviderRejection(previous)?previous.retryAuthorization:undefined
        if(previous&&previous.status!=='completed'&&!canRetryPreProviderRejection(previous)&&!retry)throw error(previous.status.startsWith('received_')?previous.error??'radar_analysis_response_invalid':'radar_presence_previous_request_uncertain')
        if(previous?.status==='completed'&&!previous.refreshAuthorized)throw error(!previous.evidenceVersion&&!version.legacy?'radar_analysis_legacy_material_missing':'radar_presence_refresh_authorization_required')
        const tenant=await pool.query(`SELECT organization.client_id, contract.id AS contract_id FROM public.organizations organization
          LEFT JOIN LATERAL (SELECT id FROM public.contracts WHERE client_id=organization.client_id AND status='active' ORDER BY starts_at DESC,id DESC LIMIT 1) contract ON TRUE
          WHERE organization.id=$1`,[run.organization_id])
        const route=await pool.query(`SELECT id FROM public.model_routing_rules WHERE agent_type='radar_presence_resolution' AND status='active'
          AND routing_tier='default' AND (organization_id IS NULL OR organization_id=$1)
          AND (client_id IS NULL OR client_id=$2) AND (contract_id IS NULL OR contract_id=$3) AND agent_id IS NULL LIMIT 1`,
          [run.organization_id,tenant.rows[0]?.client_id??null,tenant.rows[0]?.contract_id??null])
        if(!route.rows[0])throw error('radar_presence_explicit_route_required')
        beforeEffect()
        await assertEffectAuthorization()
        const requestEvidence=canonicalRadarAnalysisEvidence(evidence)
        const requestId=retry?`${baseRequestId}:retry:${retry.authorization_id}`:baseRequestId
        const costPolicy=frozenRadarCostPolicy(intentBudget,(await loadRadarOperationalLimits(pool)).costPolicy)
        run.calls.presence={status:'reserved',source:'radar_presence_resolution',evidenceHash,evidenceVersion:persistedRadarEvidenceVersion(version),requestBindings:radarEvidenceBindings(requestEvidence),rejections:previous?.rejections,...(retry?{requestId,retryAuthorization:retry,previous:{requestId:previous?.requestId,evidenceHash:previous?.evidenceHash,status:previous?.status}}:{})}
        run.calls.presence.costPolicy=costPolicy
        const reserved=await pool.query('UPDATE public.radar_candidate_research_runs SET calls=$3::jsonb WHERE id=$1 AND lease_id=$2 RETURNING id',[run.id,lease,JSON.stringify(run.calls)])
        if(!reserved.rows[0])throw error('radar_research_lease_lost')
        signal?.throwIfAborted()
        const {websiteUrl:_suggested,...requestIdentity}=identity
        const rawResult=await invokeAnalysis<unknown>('presence','/radar/resolve-presence',{
          organization_id:run.organization_id,client_id:tenant.rows[0]?.client_id,contract_id:tenant.rows[0]?.contract_id,enabled:true,
          request_id:requestId,identity:requestIdentity,...(retry?{retry_authorization:retry}:{}),
          evidence:requestEvidence.map(item=>({id:item.id,source_url:item.url,text:item.text,kind:item.kind})),
        })
        const result=remapRadarEvidenceResult(rawResult,radarEvidenceBindings(requestEvidence),version.bindings)
        const checkedPresence=validateRadarPresenceResolution(result,identity,evidence)
        run.calls.presence={...run.calls.presence,status:'completed',result,costEstimate:estimateRadarCostBrl({amount:radarReportedCostAmount(checkedPresence.usage?.costUsd),currency:'USD',rateSnapshot:costPolicy})}
        await pool.query('UPDATE public.radar_candidate_research_runs SET calls=$3::jsonb WHERE id=$1 AND lease_id=$2',[run.id,lease,JSON.stringify(run.calls)])
        return result
      },
      qualify: async (pages,evidenceHash,version) => {
        const bindings=run.calls.semantic&&radarEvidenceBindingMatch(run.calls.semantic,version)
        await recoverAnalysis('semantic',bindings?run.calls.semantic.evidenceHash??evidenceHash:evidenceHash)
        // Dedicated opt-in route; runtime refuses unconfigured global/legacy inheritance for this case.
        const previousSemantic=run.calls.semantic
        if(previousSemantic?.status==='completed'&&bindings){
          const result=validatedQualificationProfile(remapRadarEvidenceResult(previousSemantic.result as RadarQualification,bindings,version.bindings),pages)
          previousSemantic.evidenceVersion={...persistedRadarEvidenceVersion(version,previousSemantic.evidenceHash),bindings}
          await pool.query('UPDATE public.radar_candidate_research_runs SET calls=$3::jsonb WHERE id=$1 AND lease_id=$2',[run.id,lease,JSON.stringify(run.calls)])
          return result
        }
        const baseRequestId=`${run.id}:${evidenceHash}`
        const retry=previousSemantic&&previousSemantic.status!=='completed'&&!canRetryPreProviderRejection(previousSemantic)?await resolveRadarAnalysisRetry(pool,{organizationId:run.organization_id,campaignId:run.campaign_id,candidateId:run.candidate_id,runId:run.id,configurationRevision:run.configuration_revision,action:'radar_business_qualification',previousRequestId:previousSemantic.requestId??`${run.id}:${previousSemantic.evidenceHash}`,searchConfiguration:context.search_configuration}):previousSemantic&&canRetryPreProviderRejection(previousSemantic)?previousSemantic.retryAuthorization:undefined
        if (previousSemantic&&previousSemantic.status!=='completed'&&!canRetryPreProviderRejection(previousSemantic)&&!retry) throw error(previousSemantic.status.startsWith('received_')?previousSemantic.error??'radar_analysis_response_invalid':'radar_qualification_previous_request_uncertain')
        if (previousSemantic?.status==='completed'&&!previousSemantic.refreshAuthorized) throw error(!previousSemantic.evidenceVersion&&!version.legacy?'radar_analysis_legacy_material_missing':'radar_qualification_refresh_authorization_required')
        const tenant = await pool.query(`SELECT organization.client_id, contract.id AS contract_id FROM public.organizations organization
          LEFT JOIN LATERAL (SELECT id FROM public.contracts WHERE client_id=organization.client_id AND status='active' ORDER BY starts_at DESC,id DESC LIMIT 1) contract ON TRUE
          WHERE organization.id=$1`,[run.organization_id])
        const route=await pool.query(`SELECT id FROM public.model_routing_rules WHERE agent_type='radar_business_qualification' AND status='active'
          AND routing_tier='default' AND (organization_id IS NULL OR organization_id=$1)
          AND (client_id IS NULL OR client_id=$2) AND (contract_id IS NULL OR contract_id=$3) AND agent_id IS NULL LIMIT 1`,
        [run.organization_id,tenant.rows[0]?.client_id??null,tenant.rows[0]?.contract_id??null])
        if(!route.rows[0])throw error('radar_qualification_explicit_route_required')
        beforeEffect()
        await assertEffectAuthorization()
        const requestEvidence=canonicalRadarAnalysisEvidence(pages.map(page=>({...page,text:page.text.slice(0,12000)})))
        run.calls.semantic={status:'reserved',source:'radar_business_qualification',evidenceHash,evidenceVersion:persistedRadarEvidenceVersion(version),requestBindings:radarEvidenceBindings(requestEvidence),rejections:previousSemantic?.rejections,
          previous:previousSemantic?.status==='completed'?{evidenceHash:previousSemantic.evidenceHash,result:previousSemantic.result}:previousSemantic?.previous}
        const requestId=retry?`${baseRequestId}:retry:${retry.authorization_id}`:baseRequestId
        const costPolicy=frozenRadarCostPolicy(intentBudget,(await loadRadarOperationalLimits(pool)).costPolicy)
        run.calls.semantic.costPolicy=costPolicy
        if(retry)Object.assign(run.calls.semantic,{requestId,retryAuthorization:retry,previous:{requestId:previousSemantic?.requestId,evidenceHash:previousSemantic?.evidenceHash,status:previousSemantic?.status}})
        await pool.query('UPDATE public.radar_candidate_research_runs SET calls=$3::jsonb WHERE id=$1 AND lease_id=$2',[run.id,lease,JSON.stringify(run.calls)])
        const rawResult = await invokeAnalysis<RadarQualification>('semantic','/radar/qualify',{
          organization_id:run.organization_id,client_id:tenant.rows[0]?.client_id,contract_id:tenant.rows[0]?.contract_id,enabled:true,request_id:requestId,...(retry?{retry_authorization:retry}:{}),
          criteria:{segment:context.target_segment,offer:context.offer_type,products:context.product_focus,qualification:configuration.qualification,
            profileEnabled:configuration.research.profileEnabled||configuration.research.sizeAssessment.enabled},
          evidence:requestEvidence.map(page=>({id:page.id,source_url:page.url,text:page.text})),
        })
        const result=remapRadarEvidenceResult(rawResult,radarEvidenceBindings(requestEvidence),version.bindings)
        const checked=validatedQualificationProfile(result,pages)
        run.calls.semantic={...run.calls.semantic,status:'completed',result:checked,costEstimate:estimateRadarCostBrl({amount:radarReportedCostAmount(checked.usage?.costUsd),currency:'USD',rateSnapshot:costPolicy})}
        await pool.query('UPDATE public.radar_candidate_research_runs SET calls=$3::jsonb WHERE id=$1 AND lease_id=$2',[run.id,lease,JSON.stringify(run.calls)])
        return checked
      },
    })
    await persistDossier(pool,run,lease,context,dossier)
    return {runId:run.id,status:dossier.limitations.length ? 'partial':'succeeded'}
  } catch (cause) {
    if(cause instanceof RadarAdaptiveTurnYield){
      await updateResearchProgress(pool,run,async client=>{
        const updated=await client.query(`UPDATE public.radar_candidate_research_runs SET status='queued',error_code=NULL,lease_id=NULL,lease_until=NULL,updated_at=NOW() WHERE id=$1 AND lease_id=$2 RETURNING id`,[run.id,lease])
        if(updated.rows.length){
          await client.query('UPDATE public.radar_capture_items SET dispatch_generation=dispatch_generation+1 WHERE run_id=$1 AND organization_id=$2',[run.id,run.organization_id])
          await client.query('UPDATE public.radar_research_request_items SET dispatch_generation=dispatch_generation+1 WHERE run_id=$1 AND organization_id=$2',[run.id,run.organization_id])
        }
        return updated
      })
      return{runId:run.id,status:'queued',yielded:true}
    }
    const code = cause instanceof Error ? cause.message : 'research_failed'
    await updateResearchProgress(pool,run,client=>client.query(`UPDATE public.radar_candidate_research_runs SET status='blocked',error_code=$3,funnel_outcome='technical_failure',lease_id=NULL,lease_until=NULL,updated_at=NOW()
      WHERE id=$1 AND lease_id=$2 RETURNING id`,[run.id,lease,code]),false)
    return {runId:run.id,status:'blocked',error:code}
  }
}

async function updateResearchProgress(pool:pg.Pool,run:ResearchRun,update:(client:pg.PoolClient)=>Promise<pg.QueryResult>,requireLease=true){
 const client=await pool.connect()
 try{
  await client.query('BEGIN')
  await client.query('SELECT id FROM public.radar_campaigns WHERE id=$1 AND organization_id=$2 FOR UPDATE',[run.campaign_id,run.organization_id])
  const result=await update(client)
  if(!result.rows[0]&&requireLease)throw error('radar_research_lease_lost')
  if(result.rows[0])await reconcileRadarCaptureItems(client,{organizationId:run.organization_id,candidateId:run.candidate_id,runId:run.id})
  await client.query('COMMIT')
 }catch(cause){await client.query('ROLLBACK');throw cause}finally{client.release()}
}

async function persistDossier(pool:pg.Pool,run:ResearchRun,lease:string,context:ResearchContext,dossier:RadarResearchDossier) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const campaign = await client.query('SELECT configuration_revision FROM public.radar_campaigns WHERE id=$1 AND organization_id=$2 FOR UPDATE',[run.campaign_id,run.organization_id])
    if (campaign.rows[0]?.configuration_revision !== run.configuration_revision) throw error('radar_campaign_configuration_changed')
    const candidate = await client.query('SELECT status,normalized_payload FROM public.radar_candidate_records WHERE id=$1 AND organization_id=$2 FOR UPDATE',[run.candidate_id,run.organization_id])
    if (candidate.rows[0]?.status !== 'pending_review') throw error('radar_candidate_not_pending')
    const approval = await client.query('SELECT approved_at FROM public.radar_b2b_reviews WHERE candidate_id=$1 FOR UPDATE',[run.candidate_id])
    if (approval.rows[0]?.approved_at) throw error('radar_research_approved_candidate_requires_review')
    if(radarCompanyProjectionVersion(candidate.rows[0].normalized_payload)!==radarCompanyProjectionVersion(context.normalized_payload))throw error('radar_research_projection_changed')
    const known = dossier.contacts.filter(contact => contact.association === 'confirmed')
    for (const contact of known) await client.query(`INSERT INTO public.radar_b2b_evidence (organization_id,campaign_id,candidate_id,kind,value,source_url,observed_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (candidate_id,kind,value,source_url) DO UPDATE SET observed_at=EXCLUDED.observed_at`,
    [run.organization_id,run.campaign_id,run.candidate_id,contact.kind,contact.value,contact.sourceUrl,contact.observedAt])
    for (const page of dossier.pages.filter(page => !!page.text)) await client.query(`INSERT INTO public.radar_b2b_evidence (organization_id,campaign_id,candidate_id,kind,value,source_url,observed_at)
      VALUES ($1,$2,$3,'site_excerpt',$4,$5,$6) ON CONFLICT (candidate_id,kind,value,source_url) DO NOTHING`,[run.organization_id,run.campaign_id,run.candidate_id,page.text.slice(0,800),page.url,page.observedAt])
    const identity:RadarBusinessIdentity={name:String(context.normalized_payload.tradeName||context.title),legalName:typeof context.normalized_payload.legalName==='string'?context.normalized_payload.legalName:undefined,
      cnpj:String(context.normalized_payload.cnpj??''),city:String(context.normalized_payload.city??''),state:String(context.normalized_payload.state??''),
      address:String(context.normalized_payload.address??''),phone:String(context.normalized_payload.phoneRaw??'')}
    const associatedPage=dossier.pages.find(page=>isRadarInstitutionalSource(page.url,{text:page.text})&&(matchRadarBusinessIdentity(identity,page.text)==='confirmed'
      ||dossier.presenceResolution?.websiteUrl===page.url))
    const verified = dossier.siteAssociation === 'confirmed' && !!associatedPage
    const associatedPages=associatedPage?dossier.pages.filter(page=>new URL(page.url).origin===new URL(associatedPage.url).origin
      &&isRadarInstitutionalSource(page.url,{text:page.text})&&!cnpjConflict(identity,page.text,dossier.presenceResolution?.scope==='group')):[]
    const review = dossier.qualification ?? triageRadarBusiness({name:context.title,cnpj:String(context.normalized_payload.cnpj ?? ''),
      desiredCnaes:context.target_cnaes,cnaes:Array.isArray(context.normalized_payload.cnaes) ? context.normalized_payload.cnaes as string[]:[],
      configuration:resolveRadarSearchConfiguration(context.search_configuration),website:{status:verified?'verified_present':'unknown',checkedAt:new Date().toISOString(),text:associatedPages.map(page=>page.text).join(' '),emails:[],phones:[]}})
    if(dossier.decisionExcluded){review.targetStatus='not_target';review.productFit='low';review.reasons=['A atividade comprovada não atende ao público configurado. A classificação pode ser revista.']}
    const quality=evaluateRadarResearchQuality({dossier:{...dossier,qualification:dossier.qualification??{...review,evidenceIds:[],limitations:[]}},policy:resolveRadarSearchConfiguration(context.search_configuration).research,currentRevision:true})
    if(dossier.decisionReview||dossier.decisionExcluded)quality.readyForReview=false
    const configuration=resolveRadarSearchConfiguration(context.search_configuration)
    const dependencies=radarResearchDependencyVersions({identity,criteria:configuration.qualification,evidence:dossier.pages,contacts:known})
    const payload = mergeRadarCompanyResearch(candidate.rows[0].normalized_payload,{researchRunId:run.id,researchRevision:run.configuration_revision,researchDependencyVersions:dependencies,
      publicPresence:projectRadarPublicPresence({configurationRevision:run.configuration_revision,identity,...dossier}),
      researchComplete:dossier.limitations.length===0,researchUsesBrave:context.normalized_payload.researchUsesBrave===true||Object.values(run.calls).some(call=>call.source==='brave_web_search'||call.source==='brave_place_search'),publicContacts:known,
      researchUsesSerper:context.normalized_payload.researchUsesSerper===true||Object.values(run.calls).some(call=>call.source.startsWith('serper_')),
      researchUsesPerplexity:context.normalized_payload.researchUsesPerplexity===true||Object.values(run.calls).some(call=>call.source.startsWith('perplexity_')),
      companyProfile:dossier.profile,sizeAssessment:dossier.sizeAssessment,presenceResolution:dossier.presenceResolution,researchMethodVersion:RADAR_RESEARCH_METHOD_VERSION,
      researchQuality:quality,researchIdentityName:identity.name,
      ...(configuration.funnel.enabled?{funnel:{...(candidate.rows[0].normalized_payload.funnel as Record<string,unknown>??{}),...dossier.funnel,...(dossier.funnel?.blockedGate?{lastBlock:{gate:dossier.funnel.blockedGate,configurationRevision:run.configuration_revision,runId:run.id}}:{lastBlock:null})},
        decisionExclusion:{active:dossier.decisionExcluded===true,revision:run.configuration_revision,gate:dossier.funnel?.blockedGate,reason:'outside_profile',runId:run.id},emailDomainSignal:dossier.funnel?.emailSignal??context.normalized_payload.emailDomainSignal}
        :dossier.decisionExcluded&&context.normalized_payload.manualDecisionOverride!==true?{decisionExclusion:{active:true,revision:run.configuration_revision,reason:'outside_profile',runId:run.id}}:context.normalized_payload.decisionExclusion?{decisionExclusion:{...(context.normalized_payload.decisionExclusion as Record<string,unknown>),active:false}}:{}),
      researchLimitations:dossier.limitations,
      researchTlsExceptions:dossier.pages.filter(page=>page.tlsException).map(page=>({...page.tlsException,sourceUrl:page.url})),
      researchContactPurpose:resolveRadarSearchConfiguration(context.search_configuration).research.contactPurpose,
      activityAssessment:dossier.activity,websiteStatus:verified?'verified_present':'unknown',siteEmails:known.filter(item=>item.kind==='email').map(item=>item.value),
      sitePhones:known.filter(item=>item.kind==='phone').map(item=>item.value),
      ...(verified ? {websiteUrl:associatedPage.url,siteFinalUrl:associatedPage.url,siteCheckedAt:associatedPage.observedAt}:
        {websiteUrl:undefined,siteFinalUrl:undefined,siteCheckedAt:undefined}),
      targetStatus:review.targetStatus,productFit:review.productFit,triageReasons:review.reasons,analysisRevision:run.configuration_revision},
      {identityHash:dependencies.identityHash,identityCnpj:identity.cnpj,configurationRevision:run.configuration_revision,freshnessDays:configuration.research.freshnessDays,
       identityConflict:dossier.pages.some(page=>!page.limitation&&dossier.discovery.websiteUrl&&sameRadarOrigin(page.url,dossier.discovery.websiteUrl)&&cnpjConflict(identity,page.text,dossier.presenceResolution?.scope==='group'))})
    const published=await client.query('UPDATE public.radar_candidate_records SET normalized_payload=$3::jsonb,updated_at=NOW() WHERE id=$1 AND organization_id=$2 AND normalized_payload=$4::jsonb RETURNING id',[run.candidate_id,run.organization_id,JSON.stringify(payload),JSON.stringify(candidate.rows[0].normalized_payload)])
    if(!published.rows[0])throw error('radar_research_projection_changed')
    await client.query(`INSERT INTO public.radar_b2b_reviews (candidate_id,organization_id,campaign_id,target_status,product_fit,reasons,configuration_revision)
      VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (candidate_id) DO UPDATE SET target_status=EXCLUDED.target_status,product_fit=EXCLUDED.product_fit,
      reasons=EXCLUDED.reasons,configuration_revision=EXCLUDED.configuration_revision,updated_at=NOW() WHERE radar_b2b_reviews.approved_at IS NULL`,
    [run.candidate_id,run.organization_id,run.campaign_id,review.targetStatus,review.productFit,review.reasons,run.configuration_revision])
    // HTML is needed for crash-safe crawl checkpoints but is not exposed in the final dossier.
    const output = {...dossier,quality,...(run.output.discoveryLocked?{discoveryLocked:true}:{}),...(run.operation==='reanalyze'?{analysisOnly:true,discoveryLocked:true}:{}),pages:dossier.pages.map(({html:_html,...page})=>page),readingComplete:!dossier.pages.some(isRetryableRadarPage),readerVersion:RADAR_READER_VERSION}
    const finalStatus=dossier.limitations.length?'partial':'succeeded'
    const outcome=assessRadarFunnelResearch({...run,status:finalStatus,output}).outcome
    const updated=await client.query(`UPDATE public.radar_candidate_research_runs SET output=$3::jsonb,status=$4,funnel_outcome=$5,stage='review',completed_at=NOW(),updated_at=NOW(),
      lease_id=NULL,lease_until=NULL WHERE id=$1 AND lease_id=$2 RETURNING id`,[run.id,lease,JSON.stringify(output),finalStatus,outcome])
    if(!updated.rows[0])throw error('radar_research_lease_lost')
    await reconcileRadarCaptureItems(client,{organizationId:run.organization_id,candidateId:run.candidate_id,runId:run.id})
    await client.query('COMMIT')
  } catch(cause) {await client.query('ROLLBACK');throw cause} finally {client.release()}
}
