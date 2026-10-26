export const radarBrazilStates = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'] as const
export const radarExportLabels = {
  name: 'Nome fantasia', legalName: 'Razão social', cnpj: 'CNPJ', city: 'Cidade', state: 'UF',
  address: 'Endereço', registrationStatus: 'Situação cadastral', cnaes: 'CNAEs', websiteUrl: 'Site',
  websiteStatus: 'Situação do site', phone: 'Telefone', email: 'E-mail', instagramUrl: 'Instagram',
  rating: 'Avaliação', reviewCount: 'Quantidade de avaliações', targetStatus: 'Qualificação',
  productFit: 'Aderência comercial', evidenceUrl: 'Fonte da evidência', checkedAt: 'Verificado em',
  verificationMethod: 'Método de verificação', reviewNote: 'Nota de revisão',
  registryPhone:'Telefone cadastral',publicPhones:'Telefones públicos',publicEmails:'E-mails públicos',
  whatsappPublished:'WhatsApp publicado (não validado)',socialUrls:'Redes sociais',activityStatus:'Sinais de atividade',contactSources:'Fontes dos contatos',
  companySummary:'Resumo da empresa',services:'Soluções e serviços',customerSegments:'Públicos atendidos',operatingRegions:'Regiões de atuação',supplierEmails:'E-mails para fornecedores',sizeScore:'Prioridade por porte',sizeCoverage:'Cobertura das evidências de porte (%)',sizeEvidence:'Evidências de porte',
} as const
export type RadarExportField = keyof typeof radarExportLabels
export const radarSizeMetricLabels={employees:'Funcionários',units:'Unidades',annualRevenue:'Faturamento anual (R$)',annualMeals:'Refeições anuais',capital:'Capital social (R$)',yearsActive:'Anos desde a abertura'} as const
export type RadarSizeMetric=keyof typeof radarSizeMetricLabels
export type RadarSizePolicy={enabled:boolean;direction:'larger'|'smaller';criteria:Array<{metric:RadarSizeMetric;weight:number;maxAgeDays:number;bands:Array<{min:number;points:number}>}>}
export const defaultRadarSizePolicy=():RadarSizePolicy=>({enabled:false,direction:'larger',criteria:[]})
export type RadarCompletionPolicy={enabled:boolean;requireIdentity:boolean;requireSegment:boolean;requireWebsite:boolean;contactTypes:Array<'email'|'phone'|'whatsapp'|'contact_form'>;contactPurposes:Array<'general'|'suppliers'|'sales'|'finance'|'recruitment'>;minimumUsefulContacts:number}
export const defaultRadarCompletionPolicy=():RadarCompletionPolicy=>({enabled:false,requireIdentity:true,requireSegment:false,requireWebsite:false,contactTypes:['email','phone','whatsapp','contact_form'],contactPurposes:[],minimumUsefulContacts:1})
export function validateRadarSizePolicy(value:RadarSizePolicy) {
  if(value.criteria.length>6||new Set(value.criteria.map(item=>item.metric)).size!==value.criteria.length)throw new Error('Selecione cada critério de porte apenas uma vez.')
  for(const item of value.criteria) {
    if(!Number.isFinite(item.weight)||item.weight<=0||item.weight>1000||!Number.isInteger(item.maxAgeDays)||item.maxAgeDays<1||item.maxAgeDays>3650
      ||!item.bands.length||item.bands.length>20)throw new Error('Revise peso, validade e faixas dos critérios de porte.')
    if(item.bands.some((band,index)=>!Number.isFinite(band.min)||band.min<0||!Number.isFinite(band.points)||band.points<0||band.points>100
      ||index>0&&(band.min<=item.bands[index-1].min||band.points<item.bands[index-1].points)))throw new Error('As faixas de porte devem ter limites crescentes e pontos de 0 a 100, sem diminuir.')
  }
}
export type RadarSearchConfiguration = {
  funnel?:import('@/types/radarFunnel').RadarFunnelPolicy
  discovery?:{enabled:boolean;sourceOrder:Array<'osm_extract'|'serper_places'|'brave_place_search'|'serper_web_search'|'brave_web_search'|'cnpja_advanced_search'|'perplexity_search_fast'|'perplexity_search_web'>;terms:string[]}
  crmDestination?:{crmInstanceId:string;pipelineId:string;stageId:string}
  research?: { enabled: boolean; webSearchEnabled: boolean; maxSearchQueriesPerCandidate: number;
    maxSearchQueriesBySource?:Partial<Record<'brave_place_search'|'brave_web_search'|'serper_web_search'|'perplexity_search_fast'|'perplexity_search_web',number>>;
    maxSearchQueriesTotalPerCandidate?:number|null;
    webSearchProviders?:Array<'brave_web_search'|'serper_web_search'|'perplexity_search_fast'|'perplexity_search_web'>;
    localSearchOrder?:'before_web'|'after_web_if_needed'|'disabled';
    completion?:RadarCompletionPolicy;
    maxPagesPerCandidate: number;qualificationEvidenceMaxPages?:number;qualificationEvidenceMaxChars?:number; freshnessDays: number; semanticQualificationEnabled: boolean;presenceResolutionEnabled?:boolean;inspectLinkedSocialProfiles?:boolean;
    profileEnabled?:boolean;deepResearchEnabled?:boolean;contactPurpose?:'general'|'suppliers'|'sales'|'finance'|'recruitment';sizeAssessment?:RadarSizePolicy }
  cities: Array<{ city: string; state: string }>
  activityScope: 'main' | 'main_or_secondary'
  excludedNameTerms: string[]
  registrationStatusIds: number[]
  openingFrom?: string
  openingTo?: string
  braveQueryTemplate: string
  sources: { enrichWithBrave: boolean; inspectWebsite: boolean }
  qualification: {
    targets?:Array<{key:string;label:string;definition:string;priority:'primary'|'secondary';cnaes:string[]}>;outOfScopeExamples?:string[];registry?:{mainActivityRule:'any'|'target_main_required'|'target_secondary_needs_review';blockedMainCnaes:string[];blockedNameTerms:string[]}
    includeAnyTerms: string[]; includeAllTerms: string[]; excludeTerms: string[]
    requireCnaeMatch: boolean; missingWebsite: 'review' | 'insufficient'
    productTerms: string[]; productMatch: 'any' | 'all'
  }
  batch: { pageSize: number; maxPagesPerScope: number; maxQueriesPerBatch: number; verificationLimit: number;minPassRatio?:number;maxReplenishmentPages?:number;replenishmentBasis?:'initial_triage'|'final_fit' }
  exportFields: RadarExportField[]
}
export function defaultRadarSearchConfiguration(): RadarSearchConfiguration {
  const gateCriteria=()=>({minPositiveSamples:30,minNegativeSamples:20,holdoutShare:.34,minHoldoutPositives:10,minHoldoutNegatives:7,maxFalseBlocksOnPositives:0 as const,minBlockPrecision:.95,minBlockRecall:.30,thresholdMargin:.05,minThreshold:.8,auditSampleRate:.2,auditSampleRateSteady:.1,autoShadowOnReversedAudits:1,autoShadowOnReopenRate:.05})
  return {discovery:{enabled:true,sourceOrder:['osm_extract','serper_web_search','cnpja_advanced_search'],terms:[]},
    funnel:{enabled:true,g0:{mode:'enforce'},g1:{mode:'shadow',criteria:gateCriteria()},g3:{mode:'effective'},g5:{mode:'shadow',criteria:gateCriteria()},agentPolicy:{mode:'escalation',timing:'after_first_cheap_attempt',priorities:['primary','secondary']},weakFitBudget:{maxCheapSearches:1,agent:false},depthByPriority:{primary:'full',secondary:'full'}},
    research: { enabled: true, webSearchEnabled: true,webSearchProviders:['serper_web_search','brave_web_search','perplexity_search_fast'],localSearchOrder:'after_web_if_needed',completion:{...defaultRadarCompletionPolicy(),enabled:true,requireSegment:true}, maxSearchQueriesPerCandidate: 3,
    maxPagesPerCandidate: 4, freshnessDays: 7, semanticQualificationEnabled: true,presenceResolutionEnabled:true,inspectLinkedSocialProfiles:true,profileEnabled:true,deepResearchEnabled:true,contactPurpose:'general',sizeAssessment:defaultRadarSizePolicy() },
    cities: [], activityScope: 'main_or_secondary', excludedNameTerms: [], registrationStatusIds: [2],
    braveQueryTemplate: '{name}', sources: { enrichWithBrave: true, inspectWebsite: true },
    qualification: { includeAnyTerms: [], includeAllTerms: [], excludeTerms: [], requireCnaeMatch: false,
      missingWebsite: 'review', productTerms: [], productMatch: 'any' },
    batch: { pageSize: 10, maxPagesPerScope: 1, maxQueriesPerBatch: 10, verificationLimit: 10 },
    exportFields: Object.keys(radarExportLabels) as RadarExportField[] }
}
export function splitRadarTerms(value: string) {
  return [...new Set(value.split(/[,;\n]/).map(item => item.trim()).filter(Boolean))]
}
export function parseRadarCities(value: string, selectedStates: string[]) {
  const states=[...new Set(selectedStates.map(state=>state.trim().toUpperCase()))]
  return value.split('\n').map(line => line.trim()).filter(Boolean).map(line => {
    const match = /^([^/]+?)\s*\/\s*([A-Za-z]{2})$/.exec(line)
    if(!match&&(line.includes('/')||states.length!==1))throw new Error('Com várias UFs ou nenhuma selecionada, informe cada cidade no formato Cidade/UF, uma por linha.')
    const city=match?match[1].trim():line,state=match?match[2].toUpperCase():states[0]
    if(!city)throw new Error('Informe cada cidade no formato Cidade/UF, uma por linha.')
    if (!states.includes(state)) throw new Error(`Selecione a UF ${state} antes de incluir a cidade.`)
    return { city, state }
  })
}
export function formatRadarCities(cities:Array<{city:string;state:string}>,selectedStates:string[]){
  return cities.map(item=>selectedStates.length===1&&selectedStates[0]===item.state?item.city:`${item.city}/${item.state}`).join('\n')
}
