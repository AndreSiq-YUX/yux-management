import type pg from 'pg'
import {classifyRadarSource,isRadarInstitutionalSource} from './source-identity.js'
import {validateRadarPresenceResolution,type RadarPresenceEvidence,type RadarPresenceResolution} from './presence-resolution.js'
import { createHash, randomUUID } from 'node:crypto'
import type { AppEnv } from '../../config/env.js'
import type { AuthUser } from '../../auth/routes.js'
import { requireRadarScope } from './access.js'
import { findRadarDataSource, evaluateRadarSourceGovernance, recordRadarSourceUsage, isRadarEnabledOrganization } from './repository.js'
import { getRadarResearchAvailability } from './research-availability.js'
import { normalizeRadarText,resolveRadarSearchConfiguration, type RadarSearchConfiguration } from './search-configuration.js'
import { discoverRadarBusinessPresence, matchRadarBusinessIdentity, isRadarReferenceUrl, type RadarBusinessIdentity, type RadarPresenceDiscovery } from './site-discovery.js'
import { collectRadarSiteEvidence, radarHtmlLinks, isRetryableRadarPage, RADAR_READER_VERSION, type RadarSiteEvidence } from './site-evidence.js'
import { extractRadarContacts,isRadarContactSource, type RadarContactEvidence } from './contact-evidence.js'
import { assessRadarBusinessActivity } from './business-activity.js'
import { searchRadarWeb, type RadarWebHit } from './web-search.js'
import { searchRadarPlaces } from './place-providers.js'
import { loadPlatformProviderSecret } from '../platform/adminRepository.js'
import { assertLicensedBraveRetention } from './licensed-brave.js'
import { invokeAgentRuntime } from '../../lib/agent-runtime-client.js'
import { triageRadarBusiness } from './business-triage.js'
import { validateRadarCompanyProfile, type RadarCompanyProfile } from './company-profile.js'
import { assessRadarCompanySize, registryRadarSizeFacts, type RadarSizeFact } from './company-size.js'
import {getRadarTlsReadOptions,listRadarTlsExceptions,radarTlsDiagnosticId} from './tls-exception-service.js'
import type {RadarTlsReadOptions} from './site-tls-exception.js'
import {projectRadarPublicPresence} from './public-presence.js'
import {collectRadarPublicSocialEvidence,isRadarPublicProfile} from './public-social-evidence.js'

export type RadarQualification = { targetStatus: 'confirmed'|'review'|'not_target'|'insufficient'; productFit:'high'|'possible'|'low'|'unknown';
  reasons: string[]; evidenceIds: string[]; evidenceSources?:Array<{id:string;sourceUrl:string}>; limitations: string[]; provider?: string; model?: string; profile?:RadarCompanyProfile }
export type RadarResearchDossier = { discovery: RadarPresenceDiscovery; pages: RadarSiteEvidence[]; contacts: RadarContactEvidence[];
  methodVersion?:number; associationVersion?:number;
  registryPhone?: string; registryEmail?: string; siteAssociation: 'confirmed'|'review'; activity: ReturnType<typeof assessRadarBusinessActivity>;
  qualification?: RadarQualification; qualificationEvidenceHash?:string; profile?:RadarCompanyProfile;
  presenceResolution?:RadarPresenceResolution; presenceEvidenceHash?:string;
  documents?:Array<{url:string;sourceUrl:string;observedAt:string;status:'not_read'}>;
  sizeAssessment?:ReturnType<typeof assessRadarCompanySize>; limitations: string[] }
type Output = Partial<RadarResearchDossier> & { historicalRevision?:number;analysisOnly?:boolean;discoveryHits?: RadarWebHit[]; discoveryQueries?: number; readingComplete?: boolean; readerVersion?:number; qualificationEvidenceHash?:string;discoveryLocked?:boolean }
type PipelineDependencies = { local?: () => Promise<RadarWebHit[]>; web: (query: string) => Promise<RadarWebHit[]>;
  resolvePresence?:(evidence:RadarPresenceEvidence[],evidenceHash:string)=>Promise<unknown>;
  collect?: typeof collectRadarSiteEvidence; qualify?: (pages: RadarSiteEvidence[],evidenceHash:string) => Promise<RadarQualification>;
  registrySizeFacts?:RadarSizeFact[];
  collectSocial?:typeof collectRadarPublicSocialEvidence;
  tlsOptions?:(hostname:string)=>Promise<RadarTlsReadOptions|undefined>;
  checkpoint: (stage: string, output: Output) => Promise<void>; signal?: AbortSignal }
export const RADAR_RESEARCH_METHOD_VERSION=2
const RADAR_ASSOCIATION_VERSION=2
function sameRadarOrigin(left:string,right:string){
  try{return new URL(left).origin===new URL(right).origin}catch{return false}
}
function cnpjConflict(identity:RadarBusinessIdentity,text:string,group=false){
  const expected=identity.cnpj?.replace(/\D/g,'')
  return !!expected&&[...text.matchAll(/\b\d{2}[. ]?\d{3}[. ]?\d{3}[/ ]?\d{4}[- ]?\d{2}\b/g)]
    .some(match=>{const value=match[0].replace(/\D/g,'');return group?value.slice(0,8)!==expected.slice(0,8):value!==expected})
}
function currentDossierProjection(output:Output,currentRevision?:number,dossierRevision?:number):Output{
  const historical=currentRevision!==undefined&&dossierRevision!==currentRevision
  const contacts=output.contacts?.filter(contact=>{
    const page=output.pages?.find(item=>item.url===contact.sourceUrl)
    const official=output.siteAssociation==='confirmed'?output.discovery?.websiteUrl:undefined
    if(official&&!sameRadarOrigin(contact.sourceUrl,official)&&!(contact.linkedFromUrl&&sameRadarOrigin(contact.linkedFromUrl,official)))return false
    return isRadarInstitutionalSource(contact.sourceUrl,{text:page?.text})||!!page?.linkedFromUrl&&page.linkedFromUrl===contact.linkedFromUrl&&isRadarContactSource(contact,output.discovery?.websiteUrl)
  }).map(contact=>historical?{...contact,association:'review' as const,scope:'unresolved' as const,preferred:false}:contact)
  const invalid=output.discovery?.websiteUrl&&!isRadarInstitutionalSource(output.discovery.websiteUrl)
  const readable=(output.pages??[]).filter(page=>!!page.text&&!page.limitation&&isRadarInstitutionalSource(page.url,{text:page.text}))
  const associated=!historical&&output.siteAssociation==='confirmed'&&!invalid?readable.filter(page=>output.discovery?.websiteUrl&&new URL(page.url).origin===new URL(output.discovery.websiteUrl).origin):[]
  const activity=assessRadarBusinessActivity(associated,contacts??[],{pages:readable,scope:output.presenceResolution?.scope})
  return{...output,contacts,...(historical?{historicalRevision:dossierRevision}:{}),siteAssociation:invalid||historical?'review':output.siteAssociation,
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
const preProviderCreditErrors=new Set(['radar_ai_wallet_missing','radar_ai_credits_insufficient'])
function canRetryCreditRejection(call:ResearchRun['calls'][string]){
  return call.status==='rejected_before_provider'&&!!call.error&&preProviderCreditErrors.has(call.error)
}

// The facts pipeline is deliberately independent of offer fit and has no outreach dependency.
export async function runRadarResearchPipeline(identity: RadarBusinessIdentity, configuration: RadarSearchConfiguration,
  saved: Output, dependencies: PipelineDependencies): Promise<RadarResearchDossier> {
  const output = { ...saved }
  const readingDeadline=Date.now()+110_000
  if (output.pages?.some(isRetryableRadarPage)) {
    output.pages=output.pages.filter(page=>!isRetryableRadarPage(page));output.readingComplete=false
  }
  const limits: string[] = []
  const checkpoint = async (stage: string) => { dependencies.signal?.throwIfAborted(); await dependencies.checkpoint(stage, output) }
  let pages = [...(output.pages ?? [])]
  const mentionsIdentity=(text:string)=>!cnpjConflict(identity,text,true)&&[identity.name,identity.legalName].some(name=>!!name&&normalizeRadarText(name).length>=5&&normalizeRadarText(text).includes(normalizeRadarText(name)))
  if (!output.discovery || !output.discoveryLocked && output.discovery.limitations.length) {
    output.discovery = await discoverRadarBusinessPresence(identity, configuration.research, {
      search: dependencies.web, local: dependencies.local, initialHits: output.discoveryHits ?? output.discovery?.hits, initialQueries: output.discoveryQueries,
      checkpoint: async (hits, queries) => { output.discoveryHits = hits; output.discoveryQueries = queries; await checkpoint('discovery') },
      inspectCandidates:output.analysisOnly||output.readingComplete?undefined:async hits=>{
        let plausible=false
        for(const hit of hits.filter(item=>isRadarInstitutionalSource(item.url,{title:item.title,text:item.snippets.join(' ')}))){
          const root=new URL('/',hit.url).toString()
          if(!pages.some(page=>new URL(page.url).origin===new URL(root).origin)&&pages.length<Math.max(1,configuration.research.maxPagesPerCandidate-1)){
            const collected=await (dependencies.collect??collectRadarSiteEvidence)(root,{maxPagesPerCandidate:1,maxAttemptsPerCandidate:1},{signal:dependencies.signal,tlsOptions:dependencies.tlsOptions,deadlineAt:readingDeadline})
            pages.push(...collected);output.pages=pages;await checkpoint('discovery')
          }
          const readable=pages.filter(page=>new URL(page.url).origin===new URL(root).origin&&!page.limitation&&isRadarInstitutionalSource(page.url,{text:page.text}))
          if(readable.some(page=>matchRadarBusinessIdentity(identity,page.text)==='confirmed'))return true
          if(readable.some(page=>mentionsIdentity(page.text)))plausible=true
        }
        return plausible
      },
    })
    await checkpoint('identity')
  }
  const discovery = output.discovery
  let website = pages.find(page=>isRadarInstitutionalSource(page.url,{text:page.text})&&matchRadarBusinessIdentity(identity,page.text)==='confirmed')?.url??discovery.websiteUrl ?? identity.websiteUrl
    ?? discovery.suggestions.find(hit=>!isRadarReferenceUrl(hit.url))?.url
  const deferAmbiguousDepth=configuration.research.presenceResolutionEnabled
    &&!pages.some(page=>isRadarInstitutionalSource(page.url,{text:page.text})&&matchRadarBusinessIdentity(identity,page.text)==='confirmed')
    &&new Set(pages.filter(page=>!page.limitation&&isRadarInstitutionalSource(page.url,{text:page.text})&&!cnpjConflict(identity,page.text,true)).map(page=>new URL(page.url).origin)).size>1
  if (!output.readingComplete) {
    const candidates = [website,...discovery.suggestions.map(item=>item.url)].filter((value):value is string => !!value && !isRadarReferenceUrl(value))
    const urls = [...new Set(candidates.flatMap(value=>{try{return [new URL('/',value).toString(),value]}catch{return []}}))]
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
      if (collected.some(page=>isRadarInstitutionalSource(page.url,{text:page.text})&&(matchRadarBusinessIdentity(identity,page.text)==='confirmed'||mentionsIdentity(page.text)))) {
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
  const buildPresenceEvidence=():RadarPresenceEvidence[]=>{
    const pageEvidence=pages.filter(page=>!!page.text&&!page.limitation).map((page,index)=>({id:`page-${index}`,url:page.url,text:page.text.slice(0,12000),observedAt:page.observedAt,kind:classifyRadarSource(page.url,{text:page.text}).kind})).slice(0,8)
    // A search snippet reports a third party's observation, not ownership of the linked page.
    return[...pageEvidence,...discovery.hits.slice(0,10-pageEvidence.length).map((hit,index)=>({id:`search-${index}`,url:hit.url,text:`${hit.title} ${hit.snippets.join(' ')}`.slice(0,12000),observedAt:hit.observedAt,kind:'third_party' as const}))]
  }
  let presenceEvidence=buildPresenceEvidence()
  const {websiteUrl:_inferredWebsite,...stableIdentity}=identity
  const hashPresence=()=>createHash('sha256').update(JSON.stringify({identity:stableIdentity,evidence:presenceEvidence})).digest('hex')
  let presenceEvidenceHash=hashPresence()
  let presenceResolution=output.presenceEvidenceHash===presenceEvidenceHash?output.presenceResolution:undefined
  const directlyAssociated=pages.find(page=>isRadarInstitutionalSource(page.url,{text:page.text})&&matchRadarBusinessIdentity(identity,page.text)==='confirmed')
  if(configuration.research.presenceResolutionEnabled&&!directlyAssociated&&!presenceResolution){
    if(dependencies.resolvePresence&&presenceEvidence.some(item=>item.kind==='institutional_candidate')){
      try{
        presenceResolution=validateRadarPresenceResolution(await dependencies.resolvePresence(presenceEvidence,presenceEvidenceHash),identity,presenceEvidence)
        output.presenceResolution=presenceResolution;output.presenceEvidenceHash=presenceEvidenceHash
        await checkpoint('identity')
      }catch(cause){limits.push(`Identificação do site pendente (${safeResearchError(cause)}). As evidências foram preservadas.`)}
    }else limits.push(presenceEvidence.some(item=>item.kind==='institutional_candidate')?'radar_presence_service_unavailable':'radar_presence_waiting_public_read')
  }
  if(deferAmbiguousDepth&&presenceResolution?.websiteUrl&&!output.analysisOnly){
    const origin=new URL(presenceResolution.websiteUrl).origin,prior=pages.filter(page=>new URL(page.url).origin===origin)
    const other=pages.filter(page=>new URL(page.url).origin!==origin)
    const maximum=configuration.research.maxPagesPerCandidate-other.filter(page=>!page.limitation).length
    if(prior.filter(page=>!page.limitation).length<maximum){
      const selected=await(dependencies.collect??collectRadarSiteEvidence)(presenceResolution.websiteUrl,
        {maxPagesPerCandidate:maximum,maxAttemptsPerCandidate:configuration.research.maxPagesPerCandidate*2-other.length},{signal:dependencies.signal,tlsOptions:dependencies.tlsOptions,deadlineAt:readingDeadline,
          initialPages:prior.filter(page=>page.url!==presenceResolution?.websiteUrl||!!page.html)})
      const byUrl=new Map(selected.map(page=>[page.url,page]))
      pages=[...pages.map(page=>byUrl.get(page.url)??page),...selected.filter(page=>!pages.some(old=>old.url===page.url))]
      output.pages=pages;output.readingComplete=!pages.some(isRetryableRadarPage)
      presenceEvidence=buildPresenceEvidence();presenceEvidenceHash=hashPresence()
      if(selected.some(page=>!page.limitation&&(cnpjConflict(identity,page.text,presenceResolution?.scope==='group')
        ||page.url===presenceResolution?.websiteUrl&&!isRadarInstitutionalSource(page.url,{text:page.text})))){
        presenceResolution=undefined;limits.push('As páginas adicionais contradizem a identidade procurada. Site e contatos exigem revisão.')
      }
      output.presenceResolution=presenceResolution;output.presenceEvidenceHash=presenceResolution?presenceEvidenceHash:undefined
      await checkpoint('consolidation')
    }
  }
  const associatedOrigin=directlyAssociated?.url??presenceResolution?.websiteUrl
  const associated=!!associatedOrigin
  const associatedPages=pages.filter(page=>associatedOrigin && new URL(page.url).origin===new URL(associatedOrigin).origin
    &&isRadarInstitutionalSource(page.url,{text:page.text})&&!cnpjConflict(identity,page.text,presenceResolution?.scope==='group'))
  // Recompute from preserved facts; do not retain an obsolete identity association from a previous run.
  const sameInstitutionalOrigin=(url:string)=>!!associatedOrigin&&isRadarInstitutionalSource(url)&&new URL(url).origin===new URL(associatedOrigin).origin
  const candidatePage=(page:RadarSiteEvidence)=>!page.limitation&&isRadarInstitutionalSource(page.url,{text:page.text})&&!cnpjConflict(identity,page.text,true)
    &&(!associatedOrigin||sameRadarOrigin(page.url,associatedOrigin))
  if(configuration.research.inspectLinkedSocialProfiles&&!output.analysisOnly) {
    const social=await(dependencies.collectSocial??collectRadarPublicSocialEvidence)({linkedPages:pages.filter(candidatePage),
      remainingPages:Math.max(0,configuration.research.maxPagesPerCandidate-pages.filter(page=>!page.limitation).length),
      remainingAttempts:Math.max(0,configuration.research.maxPagesPerCandidate*2-pages.length),deadlineAt:readingDeadline,existingPages:pages},
      {signal:dependencies.signal,checkpoint:async page=>{output.pages=[...pages,page];await checkpoint('reading');pages.push(page)}})
    for(const page of social)if(!pages.some(old=>old.url===page.url))pages.push(page)
    output.pages=pages
  }
  const contacts:RadarContactEvidence[] = pages.filter(candidatePage).flatMap(page => extractRadarContacts(page, associatedPages.includes(page) ? 'confirmed' : 'review').map(contact=>({...contact,
    scope:associatedPages.includes(page)?presenceResolution?.scope??'establishment': 'unresolved' as const})))
  // Link-only contacts are preserved as sourced facts: stored pages intentionally omit raw HTML.
  contacts.push(...(output.contacts??[]).filter(contact=>pages.some(page=>page.url===contact.sourceUrl&&candidatePage(page))&&(output.analysisOnly||saved.pages?.some(old=>old.url===contact.sourceUrl&&pages.some(page=>page.url===old.url&&!page.html&&page.text===old.text&&page.observedAt===old.observedAt)))).map(contact=>({...contact,
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
    const prior=page.html?[]:(saved.contacts??[]).filter(contact=>contact.sourceUrl===page.url&&contact.linkedFromUrl===parent.url)
    contacts.push(...[...extracted,...prior].map(contact=>({...contact,association,scope:association==='confirmed'?presenceResolution?.scope??'establishment':'unresolved' as const})))
  }
  // Contacts in search snippets remain useful when there is no website; identity must be corroborated independently.
  const trustedSearchHits=discovery.hits.filter(hit=>sameInstitutionalOrigin(hit.url)&&matchRadarBusinessIdentity(identity,`${hit.title} ${hit.snippets.join(' ')}`)==='confirmed'
    &&!pages.some(page=>page.url===hit.url&&!page.limitation&&cnpjConflict(identity,page.text,presenceResolution?.scope==='group')))
  for (const hit of trustedSearchHits) contacts.push(...extractRadarContacts({ url:hit.url, text:`${hit.title} ${hit.snippets.join(' ')}`, observedAt:hit.observedAt }, 'confirmed')
    .map(contact=>({...contact,scope:presenceResolution?.scope??'establishment' as const})))
  const uniqueContacts = [...new Map(contacts.map(contact => [`${contact.kind}:${contact.value}:${contact.sourceUrl}`, contact])).values()]
  for(const contact of uniqueContacts)if(contact.association==='confirmed'&&configuration.research.contactPurpose!=='general'
    &&contact.purpose===configuration.research.contactPurpose) {
    contact.preferred=true;contact.note='Canal publicado para a finalidade selecionada nesta campanha; atendimento não validado.'
  }
  for(const kind of ['phone','email'] as const) {
    const confirmed=uniqueContacts.filter(contact=>contact.kind===kind&&contact.association==='confirmed')
    const counts=new Map<string,Set<string>>()
    for(const contact of confirmed)counts.set(contact.value,new Set([...(counts.get(contact.value)??[]),contact.sourceUrl]))
    const ranked=[...counts].sort((a,b)=>b[1].size-a[1].size)
    if(ranked.length && (ranked.length===1||ranked[0][1].size>ranked[1][1].size))for(const contact of confirmed.filter(item=>item.value===ranked[0][0])) {
      if(uniqueContacts.some(item=>item.kind===kind&&item.preferred))continue
      contact.preferred=true;contact.note=ranked.length===1?'Preferencial por ser o único canal público corroborado deste tipo; atendimento não validado.':
        `Preferencial por corroboramento em ${ranked[0][1].size} páginas; atendimento não validado.`
    }
  }
  uniqueContacts.sort((a,b)=>Number(!!b.preferred)-Number(!!a.preferred))
  output.contacts=uniqueContacts
  await checkpoint('consolidation')
  const confirmedSearchPages=trustedSearchHits.filter(hit=>isRadarInstitutionalSource(hit.url,{title:hit.title,text:hit.snippets.join(' ')}))
    .map(hit=>({url:hit.url,text:`${hit.title} ${hit.snippets.join(' ')}`,observedAt:hit.observedAt}))
  const qualifiedEvidence=[...associatedPages.filter(page=>!page.limitation&&!!page.text),...confirmedSearchPages].slice(0,10)
  const activity = assessRadarBusinessActivity(qualifiedEvidence,uniqueContacts,{pages:pages.filter(candidatePage),scope:presenceResolution?.scope})
  if (!website && !pages.length) limits.push('Site não encontrado nas fontes consultadas; isso não comprova inexistência.')
  if (website && !associated) limits.push('A identidade do site exige revisão; contatos não são tratados como confirmados.')
  if(presenceResolution?.scope==='group')limits.push('Presença e canais associados ao grupo; vínculo com este estabelecimento ainda requer conferência.')
  limits.push(...discovery.limitations, ...pages.flatMap(page => page.limitation ? [`${page.url}: ${page.limitation}`] : []))
  const evidenceHash=createHash('sha256').update(JSON.stringify({pages:qualifiedEvidence.map(page=>({url:page.url,text:page.text.slice(0,12000)})),
    profile:configuration.research.profileEnabled,size:configuration.research.sizeAssessment.enabled})).digest('hex')
  let qualification = output.qualificationEvidenceHash===evidenceHash?output.qualification:undefined
  const readableInstitutional=pages.some(page=>!!page.text&&!page.limitation&&isRadarInstitutionalSource(page.url,{text:page.text}))
  if ((configuration.research.semanticQualificationEnabled||configuration.research.profileEnabled||configuration.research.sizeAssessment.enabled) && !qualification) {
    if(!readableInstitutional)limits.push('radar_qualification_waiting_public_read')
    else if(!qualifiedEvidence.length)limits.push('radar_qualification_waiting_identity')
    else if (dependencies.qualify) {
      try {
        qualification = await dependencies.qualify(qualifiedEvidence,evidenceHash)
        if(qualification.profile)qualification.profile=validateRadarCompanyProfile(qualification.profile,qualifiedEvidence)
        output.qualification = qualification;output.qualificationEvidenceHash=evidenceHash
      }
      catch (cause) { qualification=undefined;output.qualification=undefined;output.qualificationEvidenceHash=undefined;
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
    discovery:{...discovery,websiteUrl:associatedOrigin??(discovery.websiteUrl&&isRadarInstitutionalSource(discovery.websiteUrl)?discovery.websiteUrl:undefined),association:associatedOrigin?'confirmed' as const:discovery.websiteUrl?'review' as const:discovery.association}, pages, contacts: uniqueContacts, registryPhone: identity.phone, siteAssociation:associated?'confirmed' as const:'review' as const, activity, qualification,
    qualificationEvidenceHash:qualification?evidenceHash:undefined,presenceResolution,presenceEvidenceHash:presenceResolution?presenceEvidenceHash:undefined,profile,sizeAssessment,documents,limitations: limits }
  Object.assign(output, dossier); await checkpoint('review')
  return dossier
}

type ResearchContext = pg.QueryResultRow & { id: string; organization_id: string; campaign_id: string; title: string; status: string;
  normalized_payload: Record<string, unknown>; search_configuration: unknown; configuration_revision: number; campaign_status: string;
  target_segment: string; offer_type: string; product_focus: string[]; target_cnaes: string[] }
type ResearchRun = pg.QueryResultRow & { id:string; organization_id:string; campaign_id:string; candidate_id:string; requested_by:string;
  operation?:'complete'|'resume'|'refresh'|'reanalyze';request_id?:string;
  configuration_revision:number; status:string; stage:string; output:Output; calls:Record<string, { status:string; source:string; result?:unknown; error?:string; evidenceHash?:string;refreshAuthorized?:boolean;previous?:unknown;
    rejections?:Array<{error:string;evidenceHash?:string;observedAt:string}> }>;
  created_at:string; updated_at:string; completed_at?:string; error_code?:string; lease_id?:string; lease_until?:string }
const error = (code: string, statusCode = 409) => Object.assign(new Error(code), { statusCode })
function cachedReadAvailability<T extends {allowed:boolean;reasons:Array<{code:string}>;maximumCostPerCandidate:number;maxQueriesPerCandidate:number}>(availability:T,run:ResearchRun|undefined,revision:number,freshnessDays:number):T {
  const recoverable=run&&run.configuration_revision===revision&&['partial','blocked','failed'].includes(run.status)&&run.output.discovery
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
  return { methodVersion:RADAR_RESEARCH_METHOD_VERSION,availability:{...available,operations:{...available.operations,refresh:{allowed:availability.allowed,reasons:availability.reasons}}}, configurationRevision:context.configuration_revision, run:latest ? {...latest,...(expired?{status:'blocked',error_code:'radar_research_worker_interrupted_retry_available'}:{}),calls:undefined,output:currentDossierProjection(latest.output,context.configuration_revision,latest.configuration_revision)} : null,
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
    if(['refresh','reanalyze'].includes(operation)&&!input.requestId)throw error('radar_research_request_id_required',400)
    if(input.requestId){
      const duplicate=await client.query<ResearchRun>(`SELECT * FROM public.radar_candidate_research_runs WHERE candidate_id=$1 AND organization_id=$2 AND request_id=$3`,[input.candidateId,input.organizationId,input.requestId])
      if(duplicate.rows[0]){await client.query('COMMIT');return{runId:duplicate.rows[0].id,status:duplicate.rows[0].status,reused:true}}
    }
    const previous = await client.query<ResearchRun>(`SELECT * FROM public.radar_candidate_research_runs
      WHERE candidate_id = $1 AND organization_id = $2 AND (configuration_revision = $3 OR $4='reanalyze') ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,[input.candidateId,input.organizationId,input.configurationRevision,operation])
    let run = previous.rows[0]
    const activeRun=await client.query<ResearchRun>(`SELECT * FROM public.radar_candidate_research_runs WHERE candidate_id=$1 AND organization_id=$2 AND status IN ('queued','running') AND configuration_revision=$3 ORDER BY created_at DESC LIMIT 1`,[input.candidateId,input.organizationId,input.configurationRevision])
    if(activeRun.rows[0]){await client.query('COMMIT');return{runId:activeRun.rows[0].id,status:activeRun.rows[0].status,reused:true}}
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
      if (!['queued','running','succeeded'].includes(run.status)) {
        if(input.allowSemanticRefresh&&run.calls.presence?.status==='completed')run.calls.presence.refreshAuthorized=true
        if(input.allowSemanticRefresh&&(run.calls.presence?.status==='completed'||run.calls.semantic?.status==='completed')) {
          if(run.calls.semantic?.status==='completed')run.calls.semantic.refreshAuthorized=true
          await client.query('UPDATE public.radar_candidate_research_runs SET calls=$3::jsonb WHERE id=$1 AND organization_id=$2',
            [run.id,input.organizationId,JSON.stringify(run.calls)])
        }
        const updated = await client.query<ResearchRun>(`UPDATE public.radar_candidate_research_runs SET status='queued', error_code=NULL,
          requested_by=$2, updated_at=NOW() WHERE id=$1 RETURNING *`,[run.id,user.id]); run = updated.rows[0]
      }
    } else {
      const inherited:Output=operation==='reanalyze'&&run?{...run.output,pages:run.output.pages?.filter(page=>!!page.text&&!page.limitation),readingComplete:true,
        discoveryLocked:true,analysisOnly:true,qualification:undefined,qualificationEvidenceHash:undefined,profile:undefined,sizeAssessment:undefined}:{}
      const inserted = await client.query<ResearchRun>(`INSERT INTO public.radar_candidate_research_runs
        (organization_id,campaign_id,candidate_id,requested_by,configuration_revision,request_id,operation,output) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb) RETURNING *`,
      [input.organizationId,context.campaign_id,input.candidateId,user.id,input.configurationRevision,input.requestId??null,operation,JSON.stringify(inherited)]); run = inserted.rows[0]
    }
    await client.query('COMMIT')
    return { runId:run.id,status:run.status,reused:!!fresh }
  } catch (cause) { await client.query('ROLLBACK'); throw cause } finally { client.release() }
}

export async function executeRadarCandidateResearch(pool:pg.Pool,env:AppEnv,input:{runId:string;organizationId:string},signal?:AbortSignal,
  dependencies: { web?:typeof searchRadarWeb; local?:typeof searchRadarPlaces; collect?:typeof collectRadarSiteEvidence;
    loadSecret?:typeof loadPlatformProviderSecret; runtime?:typeof invokeAgentRuntime } = {}) {
  const lease = randomUUID()
  const acquired = await pool.query<ResearchRun>(`UPDATE public.radar_candidate_research_runs SET status='running',lease_id=$2,
    lease_until=NOW()+INTERVAL '6 minutes',updated_at=NOW() WHERE id=$1 AND status <> 'succeeded'
    AND organization_id=$3 AND (lease_until IS NULL OR lease_until < NOW()) RETURNING *`,[input.runId,lease,input.organizationId])
  const run = acquired.rows[0]
  if (!run) return { status:'already_running_or_completed' }
  const checkpoint = async (stage:string, output:Output) => {
    signal?.throwIfAborted()
    const updated = await pool.query(`UPDATE public.radar_candidate_research_runs SET stage=$3,output=$4::jsonb,updated_at=NOW()
      WHERE id=$1 AND lease_id=$2 RETURNING id`,[run.id,lease,stage,JSON.stringify(output)])
    if (!updated.rows[0]) throw error('radar_research_lease_lost')
  }
  try {
    const userResult = await pool.query<{id:string;role:string}>(`SELECT id,role FROM public.app_users WHERE id=$1 AND is_active=TRUE`,[run.requested_by])
    if (userResult.rows[0]?.role !== 'yux_admin' || !await isRadarEnabledOrganization(pool,run.organization_id)) throw error('research_admin_required',403)
    const user = userResult.rows[0] as AuthUser
    const context = await loadContext(pool,run.organization_id,run.candidate_id)
    if (context.configuration_revision !== run.configuration_revision) throw error('radar_campaign_configuration_changed')
    if (context.status !== 'pending_review' || ['paused','archived','completed'].includes(context.campaign_status)) throw error('radar_campaign_or_candidate_inactive')
    const configuration = resolveRadarSearchConfiguration(context.search_configuration)
    if (!configuration.research.enabled) throw error('campaign_research_disabled')
    const payload = context.normalized_payload
    const str = (key:string) => typeof payload[key] === 'string' ? payload[key] as string : undefined
    const identity:RadarBusinessIdentity = {name:str('tradeName') || context.title,legalName:str('legalName'),cnpj:str('cnpj'),
      city:str('city'),state:str('state'),address:str('address'),phone:str('phoneRaw'),websiteUrl:str('websiteUrl')}
    const paid = async <T>(sourceKey:string,queryKey:string,request:(apiKey:string)=>Promise<T>):Promise<T> => {
      if(run.operation==='reanalyze')throw error('radar_reanalysis_does_not_search')
      signal?.throwIfAborted()
      const key = createHash('sha256').update(`${sourceKey}:${queryKey}`).digest('hex')
      const previous = run.calls[key]
      if (previous?.status === 'completed') return previous.result as T
      if (previous) throw error(previous.error || 'radar_research_previous_request_uncertain')
      const reservation = await pool.connect()
      let apiKey:string
      try {
        await reservation.query('BEGIN')
        await reservation.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`radar-research-budget:${run.organization_id}:${run.campaign_id}`])
        await reservation.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`radar:${run.organization_id}:${sourceKey}`])
        const currentCampaign = await reservation.query('SELECT configuration_revision, budget_limit, status FROM public.radar_campaigns WHERE id=$1 AND organization_id=$2 FOR UPDATE',[run.campaign_id,run.organization_id])
        if (currentCampaign.rows[0]?.configuration_revision !== run.configuration_revision) throw error('radar_campaign_configuration_changed')
        if (['paused','archived','completed'].includes(currentCampaign.rows[0]?.status)) throw error('campaign_inactive')
        const source = await findRadarDataSource(reservation as unknown as pg.Pool,run.organization_id,sourceKey)
        if (!source || source.defaultCostPerUnit <= 0) throw error('source_cost_required')
        const governance = await evaluateRadarSourceGovernance(reservation,run.organization_id,run.campaign_id,source,1)
        if (!governance.allowed) throw error(governance.issues[0].code)
        if (Object.values(run.calls).filter(call=>['brave_web_search','serper_web_search','brave_place_search'].includes(call.source)).length >= configuration.research.maxSearchQueriesPerCandidate) throw error('candidate_search_limit_reached')
        const spent = await reservation.query('SELECT COALESCE(SUM(estimated_cost),0) AS cost FROM public.radar_source_usage_counters WHERE organization_id=$1 AND campaign_id=$2 AND usage_date=CURRENT_DATE',[run.organization_id,run.campaign_id])
        const budget = currentCampaign.rows[0]?.budget_limit
        if (budget !== null && budget !== undefined && Number(spent.rows[0]?.cost ?? 0) + source.defaultCostPerUnit > Number(budget)) throw error('source_budget_exceeded')
        const provider = await reservation.query<{id:string;status:string;public_config:Record<string,unknown>}>(`SELECT id,status,public_config FROM public.platform_provider_connections WHERE provider_key=$1
          AND environment='production' ORDER BY is_default DESC,updated_at DESC LIMIT 1`,[sourceKey==='serper_web_search'?'serper':'brave_place'])
        const connection = provider.rows[0]
        if (connection?.status !== 'active') throw error('provider_inactive')
        if(sourceKey!=='serper_web_search')assertLicensedBraveRetention(connection.public_config)
        if (['brave_web_search','serper_web_search'].includes(sourceKey) && connection.public_config.webSearchLicensed !== true) throw error('web_license_required')
        const material = env.PROVIDER_SECRET_ENCRYPTION_KEY_B64 ? `provider-key:${env.PROVIDER_SECRET_ENCRYPTION_KEY_B64}` : env.SESSION_SECRET
        const secret = await (dependencies.loadSecret ?? loadPlatformProviderSecret)(reservation as unknown as pg.Pool,connection.id,'api_key',material)
        if (!secret) throw error('provider_secret_missing')
        apiKey = secret
        await recordRadarSourceUsage(reservation,run.organization_id,run.campaign_id,source,1,source.defaultCostPerUnit)
        run.calls[key] = {status:'reserved',source:sourceKey}
        await reservation.query(`UPDATE public.radar_candidate_research_runs SET calls=$3::jsonb WHERE id=$1 AND lease_id=$2`,[run.id,lease,JSON.stringify(run.calls)])
        await reservation.query('COMMIT')
      } catch (cause) { await reservation.query('ROLLBACK'); throw cause } finally { reservation.release() }
      // No automatic replay after a crash/ambiguous response. Reserved units still count against the cap.
      try { const result = await request(apiKey); run.calls[key] = {status:'completed',source:sourceKey,result}; return result }
      catch (cause) { run.calls[key] = {status:'failed',source:sourceKey,error:cause instanceof Error ? cause.message:'provider_request_failed'}; throw cause }
      finally { await pool.query(`UPDATE public.radar_candidate_research_runs SET calls=$3::jsonb,updated_at=NOW() WHERE id=$1 AND lease_id=$2`,[run.id,lease,JSON.stringify(run.calls)]) }
    }
    // Recover a completed provider response even if the process stopped before the discovery checkpoint.
    const cachedHits=Object.values(run.calls).flatMap(call=>call.status==='completed' && ['brave_web_search','serper_web_search'].includes(call.source) && Array.isArray(call.result)?call.result as RadarWebHit[]:[])
    const cachedLocal=Object.values(run.calls).flatMap(call=>call.status==='completed'&&call.source==='brave_place_search'&&Array.isArray(call.result)
      ? (call.result as Awaited<ReturnType<typeof searchRadarPlaces>>).flatMap(place=>place.sourceUrl?[{url:place.websiteUrl||place.sourceUrl,title:place.name,
        snippets:[place.address,place.phone,place.email].filter((value):value is string=>!!value),observedAt:place.observedAt}]:[]):[])
    const invokeAnalysis=async<T>(key:'presence'|'semantic',path:string,body:Record<string,unknown>):Promise<T>=>{
      try{return await(dependencies.runtime??invokeAgentRuntime)<T>(env,path,body)}
      catch(cause){
        const message=cause instanceof Error?cause.message:''
        // Only the runtime's explicit pre-provider reservation denial proves a safe retry.
        const rejection=/^agent_runtime_402:(radar_ai_wallet_missing|radar_ai_credits_insufficient)$/.exec(message)?.[1]
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
    const dossier = await runRadarResearchPipeline(identity,configuration,{...run.output,
      ...(run.operation==='reanalyze'?{analysisOnly:true,discoveryLocked:true,readingComplete:true}:{}),
      discoveryHits:[...(run.output.discoveryHits??run.output.discovery?.hits??[]),...cachedHits,...cachedLocal],
      discoveryQueries:Object.values(run.calls).filter(call=>['brave_web_search','serper_web_search','brave_place_search'].includes(call.source)).length},{
      signal,checkpoint,registrySizeFacts:registryRadarSizeFacts(payload),collect:run.operation==='reanalyze'||!configuration.sources.inspectWebsite ? async () => [] : dependencies.collect,
      tlsOptions:hostname=>getRadarTlsReadOptions(pool,{organizationId:run.organization_id,candidateId:run.candidate_id,runId:run.id,configurationRevision:run.configuration_revision},hostname),
      local:configuration.sources.enrichWithBrave && identity.city && identity.state ? async () => {
        const places = await paid('brave_place_search',identity.name,key => (dependencies.local ?? searchRadarPlaces)({provider:'brave_place_search',apiKey:key,query:identity.name,city:identity.city!,state:identity.state!,limit:5}))
        return places.flatMap(place => place.sourceUrl ? [{url:place.websiteUrl || place.sourceUrl,title:place.name,
          snippets:[place.address,place.phone,place.email].filter((value):value is string => !!value),observedAt:place.observedAt}] : [])
      } : undefined,
      web: async query => {
        let failure:unknown
        for(const source of configuration.research.webSearchProviders){
          try{
            const hits=await paid(source,query,key=>(dependencies.web??searchRadarWeb)({provider:source,apiKey:key,query,limit:5}))
            if(hits.length)return hits
          }catch(cause){failure=cause}
        }
        if(failure)throw failure
        return []
      },
      resolvePresence:async(evidence,evidenceHash)=>{
        const previous=run.calls.presence
        if(previous?.status==='completed'&&previous.evidenceHash===evidenceHash)return previous.result
        if(previous&&previous.status!=='completed'&&!canRetryCreditRejection(previous))throw error('radar_presence_previous_request_uncertain')
        if(previous?.status==='completed'&&!previous.refreshAuthorized)throw error('radar_presence_refresh_authorization_required')
        const tenant=await pool.query(`SELECT organization.client_id, contract.id AS contract_id FROM public.organizations organization
          LEFT JOIN LATERAL (SELECT id FROM public.contracts WHERE client_id=organization.client_id AND status='active' ORDER BY starts_at DESC,id DESC LIMIT 1) contract ON TRUE
          WHERE organization.id=$1`,[run.organization_id])
        const route=await pool.query(`SELECT id FROM public.model_routing_rules WHERE agent_type='radar_presence_resolution' AND status='active'
          AND routing_tier='default' AND (organization_id IS NULL OR organization_id=$1)
          AND (client_id IS NULL OR client_id=$2) AND (contract_id IS NULL OR contract_id=$3) AND agent_id IS NULL LIMIT 1`,
          [run.organization_id,tenant.rows[0]?.client_id??null,tenant.rows[0]?.contract_id??null])
        if(!route.rows[0])throw error('radar_presence_explicit_route_required')
        run.calls.presence={status:'reserved',source:'radar_presence_resolution',evidenceHash,rejections:previous?.rejections}
        const reserved=await pool.query('UPDATE public.radar_candidate_research_runs SET calls=$3::jsonb WHERE id=$1 AND lease_id=$2 RETURNING id',[run.id,lease,JSON.stringify(run.calls)])
        if(!reserved.rows[0])throw error('radar_research_lease_lost')
        signal?.throwIfAborted()
        const result=await invokeAnalysis<unknown>('presence','/radar/resolve-presence',{
          organization_id:run.organization_id,client_id:tenant.rows[0]?.client_id,contract_id:tenant.rows[0]?.contract_id,enabled:true,
          request_id:`${run.id}:presence:${evidenceHash}`,identity,
          evidence:evidence.map(item=>({id:item.id,source_url:item.url,text:item.text,kind:item.kind})),
        })
        validateRadarPresenceResolution(result,identity,evidence)
        run.calls.presence={status:'completed',source:'radar_presence_resolution',evidenceHash,result,rejections:run.calls.presence.rejections}
        await pool.query('UPDATE public.radar_candidate_research_runs SET calls=$3::jsonb WHERE id=$1 AND lease_id=$2',[run.id,lease,JSON.stringify(run.calls)])
        return result
      },
      qualify: async (pages,evidenceHash) => {
        // Dedicated opt-in route; runtime refuses unconfigured global/legacy inheritance for this case.
        const previousSemantic=run.calls.semantic
        if (previousSemantic?.status==='completed'&&previousSemantic.evidenceHash===evidenceHash) return previousSemantic.result as RadarQualification
        if (previousSemantic&&previousSemantic.status!=='completed'&&!canRetryCreditRejection(previousSemantic)) throw error('radar_qualification_previous_request_uncertain')
        if (previousSemantic?.status==='completed'&&!previousSemantic.refreshAuthorized) throw error('radar_qualification_refresh_authorization_required')
        const tenant = await pool.query(`SELECT organization.client_id, contract.id AS contract_id FROM public.organizations organization
          LEFT JOIN LATERAL (SELECT id FROM public.contracts WHERE client_id=organization.client_id AND status='active' ORDER BY starts_at DESC,id DESC LIMIT 1) contract ON TRUE
          WHERE organization.id=$1`,[run.organization_id])
        const route=await pool.query(`SELECT id FROM public.model_routing_rules WHERE agent_type='radar_business_qualification' AND status='active'
          AND routing_tier='default' AND (organization_id IS NULL OR organization_id=$1)
          AND (client_id IS NULL OR client_id=$2) AND (contract_id IS NULL OR contract_id=$3) AND agent_id IS NULL LIMIT 1`,
        [run.organization_id,tenant.rows[0]?.client_id??null,tenant.rows[0]?.contract_id??null])
        if(!route.rows[0])throw error('radar_qualification_explicit_route_required')
        run.calls.semantic={status:'reserved',source:'radar_business_qualification',evidenceHash,rejections:previousSemantic?.rejections,
          previous:previousSemantic?.status==='completed'?{evidenceHash:previousSemantic.evidenceHash,result:previousSemantic.result}:previousSemantic?.previous}
        await pool.query('UPDATE public.radar_candidate_research_runs SET calls=$3::jsonb WHERE id=$1 AND lease_id=$2',[run.id,lease,JSON.stringify(run.calls)])
        const result = await invokeAnalysis<RadarQualification>('semantic','/radar/qualify',{
          organization_id:run.organization_id,client_id:tenant.rows[0]?.client_id,contract_id:tenant.rows[0]?.contract_id,enabled:true,request_id:`${run.id}:${evidenceHash}`,
          criteria:{segment:context.target_segment,offer:context.offer_type,products:context.product_focus,qualification:configuration.qualification,
            profileEnabled:configuration.research.profileEnabled||configuration.research.sizeAssessment.enabled},
          evidence:pages.map((page,index)=>({id:`page-${index}`,source_url:page.url,text:page.text.slice(0,12000)})),
        })
        if(result.profile)result.profile=validateRadarCompanyProfile(result.profile,pages)
        run.calls.semantic={status:'completed',source:'radar_business_qualification',result,evidenceHash,previous:run.calls.semantic.previous,rejections:run.calls.semantic.rejections}
        await pool.query('UPDATE public.radar_candidate_research_runs SET calls=$3::jsonb WHERE id=$1 AND lease_id=$2',[run.id,lease,JSON.stringify(run.calls)])
        return result
      },
    })
    await persistDossier(pool,run,lease,context,dossier)
    return {runId:run.id,status:dossier.limitations.length ? 'partial':'succeeded'}
  } catch (cause) {
    const code = cause instanceof Error ? cause.message : 'research_failed'
    await pool.query(`UPDATE public.radar_candidate_research_runs SET status='blocked',error_code=$3,lease_id=NULL,lease_until=NULL,updated_at=NOW()
      WHERE id=$1 AND lease_id=$2`,[run.id,lease,code])
    return {runId:run.id,status:'blocked',error:code}
  }
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
    const payload = {...candidate.rows[0].normalized_payload,researchRunId:run.id,researchRevision:run.configuration_revision,
      publicPresence:projectRadarPublicPresence({configurationRevision:run.configuration_revision,...dossier}),
      researchComplete:dossier.limitations.length===0,researchUsesBrave:run.operation==='reanalyze'
        ?context.normalized_payload.researchUsesBrave===true:Object.values(run.calls).some(call=>call.source==='brave_web_search'||call.source==='brave_place_search'),publicContacts:known,
      researchUsesSerper:run.operation==='reanalyze'?context.normalized_payload.researchUsesSerper===true:Object.values(run.calls).some(call=>call.source==='serper_web_search'),
      companyProfile:dossier.profile,sizeAssessment:dossier.sizeAssessment,presenceResolution:dossier.presenceResolution,researchMethodVersion:RADAR_RESEARCH_METHOD_VERSION,
      researchTlsExceptions:dossier.pages.filter(page=>page.tlsException).map(page=>({...page.tlsException,sourceUrl:page.url})),
      activityAssessment:dossier.activity,websiteStatus:verified?'verified_present':'unknown',siteEmails:known.filter(item=>item.kind==='email').map(item=>item.value),
      sitePhones:known.filter(item=>item.kind==='phone').map(item=>item.value),
      ...(verified ? {websiteUrl:associatedPage.url,siteFinalUrl:associatedPage.url,siteCheckedAt:associatedPage.observedAt}:
        {websiteUrl:undefined,siteFinalUrl:undefined,siteCheckedAt:undefined}),
      targetStatus:review.targetStatus,productFit:review.productFit,triageReasons:review.reasons,analysisRevision:run.configuration_revision}
    await client.query('UPDATE public.radar_candidate_records SET normalized_payload=$3::jsonb,updated_at=NOW() WHERE id=$1 AND organization_id=$2',[run.candidate_id,run.organization_id,JSON.stringify(payload)])
    await client.query(`INSERT INTO public.radar_b2b_reviews (candidate_id,organization_id,campaign_id,target_status,product_fit,reasons,configuration_revision)
      VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (candidate_id) DO UPDATE SET target_status=EXCLUDED.target_status,product_fit=EXCLUDED.product_fit,
      reasons=EXCLUDED.reasons,configuration_revision=EXCLUDED.configuration_revision,updated_at=NOW() WHERE radar_b2b_reviews.approved_at IS NULL`,
    [run.candidate_id,run.organization_id,run.campaign_id,review.targetStatus,review.productFit,review.reasons,run.configuration_revision])
    // HTML is needed for crash-safe crawl checkpoints but is not exposed in the final dossier.
    const output = {...dossier,...(run.operation==='reanalyze'?{analysisOnly:true,discoveryLocked:true}:{}),pages:dossier.pages.map(({html:_html,...page})=>page),readingComplete:!dossier.pages.some(isRetryableRadarPage),readerVersion:RADAR_READER_VERSION}
    await client.query(`UPDATE public.radar_candidate_research_runs SET output=$3::jsonb,status=$4,stage='review',completed_at=NOW(),updated_at=NOW(),
      lease_id=NULL,lease_until=NULL WHERE id=$1 AND lease_id=$2`,[run.id,lease,JSON.stringify(output),dossier.limitations.length?'partial':'succeeded'])
    await client.query('COMMIT')
  } catch(cause) {await client.query('ROLLBACK');throw cause} finally {client.release()}
}
