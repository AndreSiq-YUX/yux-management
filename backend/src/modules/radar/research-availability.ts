import type pg from 'pg'
import type { AuthUser } from '../../auth/routes.js'
import { requireRadarScope } from './access.js'
import { findRadarDataSource, evaluateRadarSourceGovernance, isRadarEnabledOrganization } from './repository.js'
import { resolveRadarSearchConfiguration, type RadarResearchPolicy } from './search-configuration.js'
import {radarSearchSourceLimit,estimateRadarSearchCapacity} from './search-capacity.js'

export type ResearchBlocker = { code: string; message: string; sourceType?: string; resolution: string }
type Source = { sourceType: string; enabled: boolean; defaultCostPerUnit: number; remaining?: number }
type Provider = { status: string; hasSecret: boolean; publicConfig: Record<string, unknown> }
const searchOnlyBlockers=new Set(['source_limit_exceeded','source_budget_exceeded','provider_inactive','provider_secret_missing',
  'retention_license_required','web_license_required','source_disabled','source_cost_required','search_not_selected','candidate_search_limit_reached'])
export function radarReanalysisAvailability(reasons:ResearchBlocker[]) {
  const blocking=reasons.filter(reason=>!searchOnlyBlockers.has(reason.code))
  return {allowed:blocking.length===0,reasons:blocking}
}
export function evaluateRadarResearchAvailability(input: { policy: RadarResearchPolicy; canManage: boolean;
  sources: Source[]; provider?: Provider; providers?:Record<string,Provider|undefined>; sourceIssues?:Record<string,ResearchBlocker[]>;localEnabled?: boolean; campaignActive?: boolean }) {
  const reasons:ResearchBlocker[]=[],warnings:ResearchBlocker[]=[]
  const issue=(code:string,message:string,sourceType?:string,resolution='Admin → Integrações → Fontes do Radar')=>({code,message,sourceType,resolution})
  if(!input.canManage)reasons.push(issue('research_admin_required','Sem permissão para iniciar esta pesquisa.'))
  if(!input.policy.enabled)reasons.push(issue('campaign_research_disabled','Aprofundamento automático desativado nesta campanha.',undefined,'Campanha → Editar configuração'))
  if(input.campaignActive===false)reasons.push(issue('campaign_inactive','Campanha arquivada, concluída ou pausada.'))
  const wanted=[...(input.localEnabled&&input.policy.localSearchOrder!=='disabled'?['brave_place_search']:[]),...(input.policy.webSearchEnabled?input.policy.webSearchProviders:[])]
  if(!wanted.length)reasons.push(issue('search_not_selected','Selecione uma busca para descobrir a presença pública.'))
  const availableSearchSources:string[]=[],blocked:ResearchBlocker[]=[]
  const estimates=wanted.map(sourceType=>{
    const source=input.sources.find(item=>item.sourceType===sourceType),serper=sourceType==='serper_web_search'
    const provider=serper?input.providers?.serper:input.providers?.brave_place??input.provider
    const issues:ResearchBlocker[]=[...(input.sourceIssues?.[sourceType]??[])]
    const add=(code:string,message:string)=>issues.push(issue(code,message,sourceType))
    if(!source?.enabled)add('source_disabled',`Fonte ${sourceType} desativada no catálogo.`)
    if(!source||source.defaultCostPerUnit<=0)add('source_cost_required',`Custo aprovado não definido para ${sourceType}.`)
    if(source?.remaining!==undefined&&source.remaining<1)add('source_limit_exceeded',`Quota diária esgotada para ${sourceType}.`)
    if(radarSearchSourceLimit(input.policy,sourceType)===0||input.policy.maxSearchQueriesTotalPerCandidate===0)add('candidate_search_limit_reached',`Busca sem capacidade autorizada para ${sourceType}.`)
    if(provider?.status!=='active')add('provider_inactive',`Conexão ${serper?'Serper':'Brave'} não ativa.`)
    if(!provider?.hasSecret)add('provider_secret_missing',`Chave ${serper?'Serper':'Brave'} não cadastrada.`)
    if(!serper&&(provider?.publicConfig.retentionLicensed!==true||provider.publicConfig.credentialPurpose!=='licensed_retention'))add('retention_license_required','Retenção dos resultados Brave não confirmada.')
    if(sourceType!=='brave_place_search'&&provider?.publicConfig.webSearchLicensed!==true)add('web_license_required','Confirme que a chave e o plano permitem busca web com armazenamento.')
    if(!issues.length)availableSearchSources.push(sourceType)
    else blocked.push(...issues)
    return{sourceType,costPerQuery:source?.defaultCostPerUnit??0,maximumQueries:radarSearchSourceLimit(input.policy,sourceType),available:issues.length===0,
      ...(source?.remaining!==undefined?{remainingQueries:issues.length?0:source.remaining}:{})}
  })
  if(!availableSearchSources.length)reasons.push(...blocked);else warnings.push(...blocked)
  return{allowed:reasons.length===0,reasons,warnings,availableSearchSources,operations:{reanalyze:radarReanalysisAvailability(reasons)},
    estimates,...estimateRadarSearchCapacity(estimates,input.policy.maxSearchQueriesTotalPerCandidate),
    presenceResolutionEnabled:input.policy.presenceResolutionEnabled,
    semanticQualificationEnabled:input.policy.semanticQualificationEnabled||input.policy.profileEnabled||input.policy.sizeAssessment.enabled||input.policy.presenceResolutionEnabled}
}

export async function getRadarResearchAvailability(pool: pg.Pool, user: AuthUser, organizationId: string, campaignId: string) {
  await requireRadarScope(pool, user, { organizationId, campaignId })
  let canManage=false
  try{await requireRadarScope(pool,user,{organizationId,campaignId},true);canManage=await isRadarEnabledOrganization(pool,organizationId)}catch(cause){if((cause as {statusCode?:number}).statusCode!==403)throw cause}
  const campaign = await pool.query<{ search_configuration: unknown; status: string }>(
    'SELECT search_configuration, status FROM public.radar_campaigns WHERE id = $1 AND organization_id = $2', [campaignId, organizationId])
  if (!campaign.rows[0]) throw Object.assign(new Error('radar_campaign_not_found'), { statusCode: 404 })
  const configuration = resolveRadarSearchConfiguration(campaign.rows[0].search_configuration)
  const providers:Record<string,Provider|undefined>={}
  for(const key of ['brave_place','serper']){
    const provider=await pool.query<{status:string;has_secret:boolean;public_config:Record<string,unknown>}>(`SELECT status,public_config,
      EXISTS(SELECT 1 FROM public.platform_provider_secrets secret WHERE secret.provider_connection_id=platform_provider_connections.id AND secret.secret_kind='api_key') AS has_secret
      FROM public.platform_provider_connections WHERE provider_key = '${key}' AND environment='production' ORDER BY is_default DESC,updated_at DESC LIMIT 1`)
    const row=provider.rows[0];providers[key]=row?{status:row.status,hasSecret:row.has_secret,publicConfig:row.public_config??{}}:undefined
  }
  const wanted=[...(configuration.sources.enrichWithBrave&&configuration.research.localSearchOrder!=='disabled'?['brave_place_search']:[]),...(configuration.research.webSearchEnabled?configuration.research.webSearchProviders:[])]
  const sources=await Promise.all([...new Set(wanted)].map(async key=>{
    const source=await findRadarDataSource(pool,organizationId,key)
    const governance=await evaluateRadarSourceGovernance(pool,organizationId,campaignId,source,1)
    return{key,source,governance}
  }))
  const result=evaluateRadarResearchAvailability({policy:configuration.research,
    canManage,
    campaignActive:!['paused','archived','completed'].includes(campaign.rows[0].status),
    localEnabled:configuration.sources.enrichWithBrave,providers,sources:sources.flatMap(item=>item.source?[{...item.source,remaining:item.governance.remainingQueries??0}]:[]),
    sourceIssues:Object.fromEntries(sources.map(item=>[item.key,item.governance.issues.filter(issue=>issue.code!=='source_disabled').map(issue=>({...issue,resolution:'Admin → Integrações → Limites e orçamento'}))]))})
  if(!result.semanticQualificationEnabled)return result
  const routeFor=async(agentType:'radar_business_qualification'|'radar_presence_resolution')=>{
  const route=await pool.query<{model_name:string;provider:string;max_input_tokens:number;max_output_tokens:number;max_cost_per_run:string;fallback_routes:unknown[];fallback_model_name?:string}>(`
    SELECT rule.model_name,rule.provider,rule.max_input_tokens,rule.max_output_tokens,rule.max_cost_per_run,rule.fallback_routes,rule.fallback_model_name
    FROM public.organizations organization
    LEFT JOIN LATERAL (SELECT id FROM public.contracts WHERE client_id=organization.client_id AND status='active' ORDER BY starts_at DESC,id DESC LIMIT 1) contract ON TRUE
    JOIN public.model_routing_rules rule ON rule.agent_type='${agentType}' AND rule.status='active' AND rule.routing_tier='default'
      AND (rule.organization_id IS NULL OR rule.organization_id=organization.id)
      AND (rule.client_id IS NULL OR rule.client_id=organization.client_id)
      AND (rule.contract_id IS NULL OR rule.contract_id=contract.id) AND rule.agent_id IS NULL
    WHERE organization.id=$1
    ORDER BY ((rule.organization_id IS NOT NULL)::int+(rule.client_id IS NOT NULL)::int+(rule.contract_id IS NOT NULL)::int) DESC,
      rule.updated_at DESC,rule.id DESC LIMIT 1`,[organizationId])
  const selected=route.rows[0],profile=configuration.research.profileEnabled||configuration.research.sizeAssessment.enabled
  return {routeConfigured:!!selected,model:selected?.model_name,provider:selected?.provider,
    maxInputTokens:selected?.max_input_tokens||16000,maxOutputTokens:Math.min(selected?.max_output_tokens||4000,profile?4000:1800),
    budgetReferenceBrl:Number(selected?.max_cost_per_run)>0?Number(selected.max_cost_per_run):undefined,
    fallbackCount:Array.isArray(selected?.fallback_routes)?selected.fallback_routes.length:selected?.fallback_model_name?1:0}
  }
  return {...result,
    semantic:configuration.research.semanticQualificationEnabled||configuration.research.profileEnabled||configuration.research.sizeAssessment.enabled?await routeFor('radar_business_qualification'):undefined,
    presence:configuration.research.presenceResolutionEnabled?await routeFor('radar_presence_resolution'):undefined}
}
