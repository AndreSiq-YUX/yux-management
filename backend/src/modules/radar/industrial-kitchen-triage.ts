import type { RadarBusinessSiteInspection } from './b2b-site-inspection.js'

export type IndustrialKitchenTriage = {
  kitchenStatus: 'confirmed' | 'review' | 'not_target' | 'insufficient'
  productFit: 'high' | 'possible' | 'low' | 'unknown'
  reasons: string[]
  evidenceUrls: string[]
}

export function triageIndustrialKitchen(input: {
  name: string
  cnaes: string[]
  products: string[]
  website?: RadarBusinessSiteInspection
}): IndustrialKitchenTriage {
  const cnaeMatch = input.cnaes.some(value => value.replace(/\D/g, '') === '5620101')
  const text = normalize(input.website?.text ?? '')
  const name = normalize(input.name).replace(/\b(?:ltda|eireli|epp|me)\b/g, '').trim()
  const siteMatchesName = Boolean(name && text.includes(name))
  const operationEvidence = /cozinha industrial|alimentacao coletiva|refeicoes corporativas|refeicoes industriais|fornecimento de refeicoes (?:para|a) empresas/.test(text)
  const evidenceUrls = input.website?.status === 'verified_present' && input.website.finalUrl
    ? [input.website.finalUrl] : []

  let kitchenStatus: IndustrialKitchenTriage['kitchenStatus'] = 'insufficient'
  const reasons: string[] = []
  if (cnaeMatch && siteMatchesName && operationEvidence) {
    kitchenStatus = 'confirmed'
    reasons.push('CNAE 5620-1/01 e site associado descrevem operação de cozinha industrial B2B.')
  } else if (cnaeMatch) {
    kitchenStatus = 'review'
    reasons.push('CNAE 5620-1/01 encontrado, mas a operação não foi confirmada por site associado.')
  } else if (operationEvidence && siteMatchesName) {
    kitchenStatus = 'review'
    reasons.push('Site indica cozinha industrial, mas cadastro setorial exige revisão.')
  } else reasons.push('Sem evidência suficiente de cozinha industrial B2B.')

  const productFit = input.products.some(product => {
    const tokens = normalize(product).split(' ').filter(token => token.length >= 4)
    return tokens.some(token => text.includes(token))
  }) ? 'possible' : 'unknown'
  reasons.push(productFit === 'possible'
    ? 'O site menciona pelo menos um grupo de produtos; isso não comprova compra ou volume.'
    : 'A compra dos produtos ofertados não foi demonstrada nas fontes consultadas.')

  return { kitchenStatus, productFit, reasons, evidenceUrls }
}

function normalize(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()
}
