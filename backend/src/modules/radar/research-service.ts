import type pg from 'pg'
import { createHash, randomUUID } from 'node:crypto'
import type { AppEnv } from '../../config/env.js'
import type { AuthUser } from '../../auth/routes.js'
import { requireRadarScope } from './access.js'
import { findRadarDataSource, evaluateRadarSourceGovernance, recordRadarSourceUsage, isRadarEnabledOrganization } from './repository.js'
import { getRadarResearchAvailability } from './research-availability.js'
import { resolveRadarSearchConfiguration, type RadarSearchConfiguration } from './search-configuration.js'
import { discoverRadarBusinessPresence, matchRadarBusinessIdentity, isRadarReferenceUrl, type RadarBusinessIdentity, type RadarPresenceDiscovery } from './site-discovery.js'
import { collectRadarSiteEvidence, type RadarSiteEvidence } from './site-evidence.js'
import { extractRadarContacts, type RadarContactEvidence } from './contact-evidence.js'
import { assessRadarBusinessActivity } from './business-activity.js'
import { searchRadarWeb, type RadarWebHit } from './web-search.js'
import { searchRadarPlaces } from './place-providers.js'
import { loadPlatformProviderSecret } from '../platform/adminRepository.js'
import { assertLicensedBraveRetention } from './licensed-brave.js'
import { invokeAgentRuntime } from '../../lib/agent-runtime-client.js'
import { triageRadarBusiness } from './business-triage.js'

export type RadarQualification = { targetStatus: 'confirmed'|'review'|'not_target'|'insufficient'; productFit:'high'|'possible'|'low'|'unknown';
  reasons: string[]; evidenceIds: string[]; evidenceSources?:Array<{id:string;sourceUrl:string}>; limitations: string[]; provider?: string; model?: string }
export type RadarResearchDossier = { discovery: RadarPresenceDiscovery; pages: RadarSiteEvidence[]; contacts: RadarContactEvidence[];
  registryPhone?: string; registryEmail?: string; siteAssociation: 'confirmed'|'review'; activity: ReturnType<typeof assessRadarBusinessActivity>;
  qualification?: RadarQualification; limitations: string[] }
type Output = Partial<RadarResearchDossier> & { discoveryHits?: RadarWebHit[]; discoveryQueries?: number; readingComplete?: boolean }
type PipelineDependencies = { local?: () => Promise<RadarWebHit[]>; web: (query: string) => Promise<RadarWebHit[]>;
  collect?: typeof collectRadarSiteEvidence; qualify?: (pages: RadarSiteEvidence[]) => Promise<RadarQualification>;
  checkpoint: (stage: string, output: Output) => Promise<void>; signal?: AbortSignal }

// The facts pipeline is deliberately independent of offer fit and has no outreach dependency.
export async function runRadarResearchPipeline(identity: RadarBusinessIdentity, configuration: RadarSearchConfiguration,
  saved: Output, dependencies: PipelineDependencies): Promise<RadarResearchDossier> {
  const output = { ...saved }
  const limits: string[] = []
  const checkpoint = async (stage: string) => { dependencies.signal?.throwIfAborted(); await dependencies.checkpoint(stage, output) }
  if (!output.discovery || output.discovery.limitations.length) {
    output.discovery = await discoverRadarBusinessPresence(identity, configuration.research, {
      search: dependencies.web, local: dependencies.local, initialHits: output.discoveryHits ?? output.discovery?.hits, initialQueries: output.discoveryQueries,
      checkpoint: async (hits, queries) => { output.discoveryHits = hits; output.discoveryQueries = queries; await checkpoint('discovery') },
    })
    await checkpoint('identity')
  }
  const discovery = output.discovery
  let pages = output.pages ?? []
  let website = discovery.websiteUrl ?? identity.websiteUrl
  if (!output.readingComplete) {
    const urls = [...new Set([website,...discovery.suggestions.map(item=>item.url)].filter((value):value is string => !!value && !isRadarReferenceUrl(value)))]
    for (const url of urls) {
      if (pages.length >= configuration.research.maxPagesPerCandidate || dependencies.signal?.aborted) break
      const remaining = configuration.research.maxPagesPerCandidate - pages.filter(page=>new URL(page.url).origin!==new URL(url).origin).length
      const prior=pages.filter(page=>new URL(page.url).origin===new URL(url).origin)
      let collected = await (dependencies.collect ?? collectRadarSiteEvidence)(url, {maxPagesPerCandidate:Math.min(remaining,prior.length+1)}, {signal:dependencies.signal,
        initialPages:pages.filter(page=>new URL(page.url).origin===new URL(url).origin),checkpoint:async value => {
          output.pages=[...pages.filter(page=>new URL(page.url).origin!==new URL(url).origin),...value];await checkpoint('reading')
        }})
      pages=[...pages.filter(page=>new URL(page.url).origin!==new URL(url).origin),...collected]
      if (collected.some(page=>matchRadarBusinessIdentity(identity,page.text)==='confirmed')) {
        website=url
        if(collected.length<remaining) {
          collected=await (dependencies.collect??collectRadarSiteEvidence)(url,{maxPagesPerCandidate:remaining},{signal:dependencies.signal,initialPages:collected,
            checkpoint:async value=>{output.pages=[...pages.filter(page=>new URL(page.url).origin!==new URL(url).origin),...value];await checkpoint('reading')}})
          pages=[...pages.filter(page=>new URL(page.url).origin!==new URL(url).origin),...collected]
        }
        break
      }
    }
    output.pages = pages; output.readingComplete = true
    await checkpoint('consolidation')
  }
  const associated = pages.some(page => matchRadarBusinessIdentity(identity, page.text) === 'confirmed')
  const associatedOrigin = pages.find(page=>matchRadarBusinessIdentity(identity,page.text)==='confirmed')?.url
  const associatedPages=pages.filter(page=>associatedOrigin && new URL(page.url).origin===new URL(associatedOrigin).origin
    && (!/\b\d{2}[. ]?\d{3}[. ]?\d{3}[/ ]?\d{4}[- ]?\d{2}\b/.test(page.text)||matchRadarBusinessIdentity(identity,page.text)==='confirmed'))
  const contacts = [...(output.contacts??[]),...pages.flatMap(page => extractRadarContacts(page, associatedPages.includes(page) ? 'confirmed' : 'review'))]
  // Contacts in search snippets remain useful when there is no website; identity must be corroborated independently.
  for (const hit of discovery.hits) contacts.push(...extractRadarContacts({ url:hit.url, text:`${hit.title} ${hit.snippets.join(' ')}`, observedAt:hit.observedAt }, matchRadarBusinessIdentity(identity, `${hit.title} ${hit.snippets.join(' ')}`)))
  const uniqueContacts = [...new Map(contacts.map(contact => [`${contact.kind}:${contact.value}:${contact.sourceUrl}`, contact])).values()]
  for(const kind of ['phone','email'] as const) {
    const confirmed=uniqueContacts.filter(contact=>contact.kind===kind&&contact.association==='confirmed')
    const counts=new Map<string,Set<string>>()
    for(const contact of confirmed)counts.set(contact.value,new Set([...(counts.get(contact.value)??[]),contact.sourceUrl]))
    const ranked=[...counts].sort((a,b)=>b[1].size-a[1].size)
    if(ranked.length && (ranked.length===1||ranked[0][1].size>ranked[1][1].size))for(const contact of confirmed.filter(item=>item.value===ranked[0][0])) {
      contact.preferred=true;contact.note=ranked.length===1?'Preferencial por ser o único canal público corroborado deste tipo; atendimento não validado.':
        `Preferencial por corroboramento em ${ranked[0][1].size} páginas; atendimento não validado.`
    }
  }
  uniqueContacts.sort((a,b)=>Number(!!b.preferred)-Number(!!a.preferred))
  const confirmedSearchPages=discovery.hits.filter(hit=>matchRadarBusinessIdentity(identity,`${hit.title} ${hit.snippets.join(' ')}`)==='confirmed')
    .map(hit=>({url:hit.url,text:`${hit.title} ${hit.snippets.join(' ')}`,observedAt:hit.observedAt}))
  const qualifiedEvidence=[...associatedPages,...confirmedSearchPages].slice(0,10)
  const activity = assessRadarBusinessActivity(qualifiedEvidence)
  if (!website) limits.push('Site não encontrado nas fontes consultadas; isso não comprova inexistência.')
  if (website && !associated) limits.push('A identidade do site exige revisão; contatos não são tratados como confirmados.')
  limits.push(...discovery.limitations, ...pages.flatMap(page => page.limitation ? [`${page.url}: ${page.limitation}`] : []))
  let qualification = output.qualification
  if (configuration.research.semanticQualificationEnabled && !qualification) {
    if (dependencies.qualify && qualifiedEvidence.length) {
      try { qualification = await dependencies.qualify(qualifiedEvidence.filter(page => !!page.text)); output.qualification = qualification }
      catch { limits.push('Qualificação semântica pendente: confira rota, permissões e limite no Admin. Os fatos foram preservados.') }
    } else limits.push('Qualificação semântica pendente: é necessária evidência com identidade associada e rota explícita no Admin.')
  }
  limits.push(...(qualification?.limitations??[]))
  const dossier = { discovery:{...discovery,...(associatedOrigin?{websiteUrl:associatedOrigin,association:'confirmed' as const}:{})}, pages, contacts: uniqueContacts, registryPhone: identity.phone, siteAssociation:associated?'confirmed' as const:'review' as const, activity, qualification, limitations: limits }
  Object.assign(output, dossier); await checkpoint('review')
  return dossier
}

type ResearchContext = pg.QueryResultRow & { id: string; organization_id: string; campaign_id: string; title: string; status: string;
  normalized_payload: Record<string, unknown>; search_configuration: unknown; configuration_revision: number; campaign_status: string;
  target_segment: string; offer_type: string; product_focus: string[]; target_cnaes: string[] }
type ResearchRun = pg.QueryResultRow & { id:string; organization_id:string; campaign_id:string; candidate_id:string; requested_by:string;
  configuration_revision:number; status:string; stage:string; output:Output; calls:Record<string, { status:string; source:string; result?:unknown; error?:string }>;
  created_at:string; updated_at:string; completed_at?:string; error_code?:string; lease_id?:string; lease_until?:string }
const error = (code: string, statusCode = 409) => Object.assign(new Error(code), { statusCode })
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
  const expired=latest?.status==='running'&&latest.lease_until&&Date.parse(latest.lease_until)<Date.now()
  return { availability, configurationRevision:context.configuration_revision, run:latest ? {...latest,...(expired?{status:'blocked',error_code:'radar_research_worker_interrupted_retry_available'}:{}),calls:undefined,output:{...latest.output,pages:latest.output.pages?.map(({html:_html,...page})=>page)}} : null,
    history:runs.rows.slice(1).map(run => ({ id:run.id, status:run.status, updated_at:run.updated_at })) }
}
export async function startRadarCandidateResearch(pool:pg.Pool,user:AuthUser,input:{organizationId:string;candidateId:string;configurationRevision:number;requestId?:string}) {
  await requireRadarScope(pool,user,{ organizationId:input.organizationId,candidateId:input.candidateId },true)
  const context = await loadContext(pool,input.organizationId,input.candidateId)
  if (context.configuration_revision !== input.configurationRevision) throw error('radar_campaign_configuration_changed')
  if (context.status !== 'pending_review') throw error('radar_candidate_not_pending')
  const availability = await getRadarResearchAvailability(pool,user,input.organizationId,context.campaign_id)
  if (!availability.allowed) throw Object.assign(error('radar_research_unavailable'),{ reasons:availability.reasons })
  const configuration = resolveRadarSearchConfiguration(context.search_configuration)
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`radar-research:${input.candidateId}`])
    const campaign = await client.query('SELECT configuration_revision FROM public.radar_campaigns WHERE id = $1 FOR UPDATE',[context.campaign_id])
    if (campaign.rows[0]?.configuration_revision !== input.configurationRevision) throw error('radar_campaign_configuration_changed')
    const approval = await client.query('SELECT approved_at FROM public.radar_b2b_reviews WHERE candidate_id = $1 FOR UPDATE',[input.candidateId])
    if (approval.rows[0]?.approved_at) throw error('radar_research_approved_candidate_requires_review')
    const previous = await client.query<ResearchRun>(`SELECT * FROM public.radar_candidate_research_runs
      WHERE candidate_id = $1 AND organization_id = $2 AND configuration_revision = $3 ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,[input.candidateId,input.organizationId,input.configurationRevision])
    let run = previous.rows[0]
    const fresh = run && (['queued','running'].includes(run.status) || Date.now() - Date.parse(run.completed_at||run.created_at) < configuration.research.freshnessDays * 86400000)
    if (fresh) {
      if (!['queued','running','succeeded'].includes(run.status)) {
        const updated = await client.query<ResearchRun>(`UPDATE public.radar_candidate_research_runs SET status='queued', error_code=NULL,
          requested_by=$2, updated_at=NOW() WHERE id=$1 RETURNING *`,[run.id,user.id]); run = updated.rows[0]
      }
    } else {
      const inserted = await client.query<ResearchRun>(`INSERT INTO public.radar_candidate_research_runs
        (organization_id,campaign_id,candidate_id,requested_by,configuration_revision) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [input.organizationId,context.campaign_id,input.candidateId,user.id,input.configurationRevision]); run = inserted.rows[0]
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
        if (Object.keys(run.calls).filter(key=>key!=='semantic').length >= configuration.research.maxSearchQueriesPerCandidate) throw error('candidate_search_limit_reached')
        const spent = await reservation.query('SELECT COALESCE(SUM(estimated_cost),0) AS cost FROM public.radar_source_usage_counters WHERE organization_id=$1 AND campaign_id=$2 AND usage_date=CURRENT_DATE',[run.organization_id,run.campaign_id])
        const budget = currentCampaign.rows[0]?.budget_limit
        if (budget !== null && budget !== undefined && Number(spent.rows[0]?.cost ?? 0) + source.defaultCostPerUnit > Number(budget)) throw error('source_budget_exceeded')
        const provider = await reservation.query<{id:string;status:string;public_config:Record<string,unknown>}>(`SELECT id,status,public_config FROM public.platform_provider_connections WHERE provider_key='brave_place'
          AND environment='production' ORDER BY is_default DESC,updated_at DESC LIMIT 1`)
        const connection = provider.rows[0]
        if (connection?.status !== 'active') throw error('provider_inactive')
        assertLicensedBraveRetention(connection.public_config)
        if (sourceKey === 'brave_web_search' && connection.public_config.webSearchLicensed !== true) throw error('web_license_required')
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
    const cachedHits=Object.values(run.calls).flatMap(call=>call.status==='completed' && call.source==='brave_web_search' && Array.isArray(call.result)?call.result as RadarWebHit[]:[])
    const cachedLocal=Object.values(run.calls).flatMap(call=>call.status==='completed'&&call.source==='brave_place_search'&&Array.isArray(call.result)
      ? (call.result as Awaited<ReturnType<typeof searchRadarPlaces>>).flatMap(place=>place.sourceUrl?[{url:place.websiteUrl||place.sourceUrl,title:place.name,
        snippets:[place.address,place.phone,place.email].filter((value):value is string=>!!value),observedAt:place.observedAt}]:[]):[])
    const dossier = await runRadarResearchPipeline(identity,configuration,{...run.output,
      discoveryHits:[...(run.output.discoveryHits??run.output.discovery?.hits??[]),...cachedHits,...cachedLocal],
      discoveryQueries:Object.keys(run.calls).filter(key=>key!=='semantic').length},{
      signal,checkpoint,collect:configuration.sources.inspectWebsite ? dependencies.collect : async () => [],
      local:configuration.sources.enrichWithBrave && identity.city && identity.state ? async () => {
        const places = await paid('brave_place_search',identity.name,key => (dependencies.local ?? searchRadarPlaces)({provider:'brave_place_search',apiKey:key,query:identity.name,city:identity.city!,state:identity.state!,limit:5}))
        return places.flatMap(place => place.sourceUrl ? [{url:place.websiteUrl || place.sourceUrl,title:place.name,
          snippets:[place.address,place.phone,place.email].filter((value):value is string => !!value),observedAt:place.observedAt}] : [])
      } : undefined,
      web: query => paid('brave_web_search',query,key => (dependencies.web ?? searchRadarWeb)({apiKey:key,query,limit:5})),
      qualify: async pages => {
        // Dedicated opt-in route; runtime refuses unconfigured global/legacy inheritance for this case.
        if (run.calls.semantic?.status==='completed') return run.calls.semantic.result as RadarQualification
        if (run.calls.semantic) throw error('radar_qualification_previous_request_uncertain')
        const tenant = await pool.query(`SELECT organization.client_id, contract.id AS contract_id FROM public.organizations organization
          LEFT JOIN LATERAL (SELECT id FROM public.contracts WHERE client_id=organization.client_id AND status='active' ORDER BY starts_at DESC,id DESC LIMIT 1) contract ON TRUE
          WHERE organization.id=$1`,[run.organization_id])
        const route=await pool.query(`SELECT id FROM public.model_routing_rules WHERE agent_type='radar_business_qualification' AND status='active'
          AND routing_tier='default' AND (organization_id IS NULL OR organization_id=$1)
          AND (client_id IS NULL OR client_id=$2) AND (contract_id IS NULL OR contract_id=$3) AND agent_id IS NULL LIMIT 1`,
        [run.organization_id,tenant.rows[0]?.client_id??null,tenant.rows[0]?.contract_id??null])
        if(!route.rows[0])throw error('radar_qualification_explicit_route_required')
        run.calls.semantic={status:'reserved',source:'radar_business_qualification'}
        await pool.query('UPDATE public.radar_candidate_research_runs SET calls=$3::jsonb WHERE id=$1 AND lease_id=$2',[run.id,lease,JSON.stringify(run.calls)])
        const result = await (dependencies.runtime ?? invokeAgentRuntime)<RadarQualification>(env,'/radar/qualify',{
          organization_id:run.organization_id,client_id:tenant.rows[0]?.client_id,contract_id:tenant.rows[0]?.contract_id,enabled:true,request_id:run.id,
          criteria:{segment:context.target_segment,offer:context.offer_type,products:context.product_focus,qualification:configuration.qualification},
          evidence:pages.map((page,index)=>({id:`page-${index}`,source_url:page.url,text:page.text.slice(0,12000)})),
        })
        run.calls.semantic={status:'completed',source:'radar_business_qualification',result}
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
    const associatedPage=dossier.pages.find(page=>matchRadarBusinessIdentity(identity,page.text)==='confirmed')
    const verified = dossier.siteAssociation === 'confirmed' && !!associatedPage
    const associatedPages=associatedPage?dossier.pages.filter(page=>new URL(page.url).origin===new URL(associatedPage.url).origin
      && (!/\b\d{2}[. ]?\d{3}[. ]?\d{3}[/ ]?\d{4}[- ]?\d{2}\b/.test(page.text)||matchRadarBusinessIdentity(identity,page.text)==='confirmed')):[]
    const review = dossier.qualification ?? triageRadarBusiness({name:context.title,cnpj:String(context.normalized_payload.cnpj ?? ''),
      desiredCnaes:context.target_cnaes,cnaes:Array.isArray(context.normalized_payload.cnaes) ? context.normalized_payload.cnaes as string[]:[],
      configuration:resolveRadarSearchConfiguration(context.search_configuration),website:{status:verified?'verified_present':'unknown',checkedAt:new Date().toISOString(),text:associatedPages.map(page=>page.text).join(' '),emails:[],phones:[]}})
    const payload = {...candidate.rows[0].normalized_payload,researchRunId:run.id,researchRevision:run.configuration_revision,
      researchComplete:dossier.limitations.length===0,researchUsesBrave:Object.keys(run.calls).length>0,publicContacts:known,
      activityAssessment:dossier.activity,websiteStatus:verified?'verified_present':'unknown',siteEmails:known.filter(item=>item.kind==='email').map(item=>item.value),
      sitePhones:known.filter(item=>item.kind==='phone').map(item=>item.value),
      ...(verified ? {websiteUrl:associatedPage.url,siteFinalUrl:associatedPage.url,websiteStatus:'verified_present',siteCheckedAt:associatedPage.observedAt}:{}),
      targetStatus:review.targetStatus,productFit:review.productFit,triageReasons:review.reasons,analysisRevision:run.configuration_revision}
    await client.query('UPDATE public.radar_candidate_records SET normalized_payload=$3::jsonb,updated_at=NOW() WHERE id=$1 AND organization_id=$2',[run.candidate_id,run.organization_id,JSON.stringify(payload)])
    await client.query(`INSERT INTO public.radar_b2b_reviews (candidate_id,organization_id,campaign_id,target_status,product_fit,reasons,configuration_revision)
      VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (candidate_id) DO UPDATE SET target_status=EXCLUDED.target_status,product_fit=EXCLUDED.product_fit,
      reasons=EXCLUDED.reasons,configuration_revision=EXCLUDED.configuration_revision,updated_at=NOW() WHERE radar_b2b_reviews.approved_at IS NULL`,
    [run.candidate_id,run.organization_id,run.campaign_id,review.targetStatus,review.productFit,review.reasons,run.configuration_revision])
    // HTML is needed for crash-safe crawl checkpoints but is not exposed in the final dossier.
    const output = {...dossier,pages:dossier.pages.map(({html:_html,...page})=>page),readingComplete:true}
    await client.query(`UPDATE public.radar_candidate_research_runs SET output=$3::jsonb,status=$4,stage='review',completed_at=NOW(),updated_at=NOW(),
      lease_id=NULL,lease_until=NULL WHERE id=$1 AND lease_id=$2`,[run.id,lease,JSON.stringify(output),dossier.limitations.length?'partial':'succeeded'])
    await client.query('COMMIT')
  } catch(cause) {await client.query('ROLLBACK');throw cause} finally {client.release()}
}
