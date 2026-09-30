export const radarBrazilStates = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'] as const
export const radarExportLabels = {
  name: 'Nome fantasia', legalName: 'Razão social', cnpj: 'CNPJ', city: 'Cidade', state: 'UF',
  address: 'Endereço', registrationStatus: 'Situação cadastral', cnaes: 'CNAEs', websiteUrl: 'Site',
  websiteStatus: 'Situação do site', phone: 'Telefone', email: 'E-mail', instagramUrl: 'Instagram',
  rating: 'Avaliação', reviewCount: 'Quantidade de avaliações', targetStatus: 'Qualificação',
  productFit: 'Aderência comercial', evidenceUrl: 'Fonte da evidência', checkedAt: 'Verificado em',
  verificationMethod: 'Método de verificação', reviewNote: 'Nota de revisão',
} as const
export type RadarExportField = keyof typeof radarExportLabels
export type RadarSearchConfiguration = {
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
  return { cities: [], activityScope: 'main_or_secondary', excludedNameTerms: [], registrationStatusIds: [2],
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
