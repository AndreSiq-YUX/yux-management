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
  research?: { enabled: boolean; webSearchEnabled: boolean; maxSearchQueriesPerCandidate: number;
    maxPagesPerCandidate: number; freshnessDays: number; semanticQualificationEnabled: boolean;
    profileEnabled?:boolean;contactPurpose?:'general'|'suppliers'|'sales'|'finance'|'recruitment';sizeAssessment?:RadarSizePolicy }
  cities: Array<{ city: string; state: string }>
  activityScope: 'main' | 'main_or_secondary'
  excludedNameTerms: string[]
  registrationStatusIds: number[]
  openingFrom?: string
  openingTo?: string
  braveQueryTemplate: string
  sources: { enrichWithBrave: boolean; inspectWebsite: boolean }
  qualification: {
    includeAnyTerms: string[]; includeAllTerms: string[]; excludeTerms: string[]
    requireCnaeMatch: boolean; missingWebsite: 'review' | 'insufficient'
    productTerms: string[]; productMatch: 'any' | 'all'
  }
  batch: { pageSize: number; maxPagesPerScope: number; maxQueriesPerBatch: number; verificationLimit: number }
  exportFields: RadarExportField[]
}
export function defaultRadarSearchConfiguration(): RadarSearchConfiguration {
  return { research: { enabled: false, webSearchEnabled: false, maxSearchQueriesPerCandidate: 3,
    maxPagesPerCandidate: 4, freshnessDays: 7, semanticQualificationEnabled: false,profileEnabled:false,contactPurpose:'general',sizeAssessment:defaultRadarSizePolicy() },
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
  return value.split('\n').map(line => line.trim()).filter(Boolean).map(line => {
    const match = /^(.+)\/([A-Za-z]{2})$/.exec(line)
    if (!match) throw new Error('Informe cada cidade no formato Cidade/UF, uma por linha.')
    const state = match[2].toUpperCase()
    if (!selectedStates.includes(state)) throw new Error(`Selecione a UF ${state} antes de incluir a cidade.`)
    return { city: match[1].trim(), state }
  })
}
