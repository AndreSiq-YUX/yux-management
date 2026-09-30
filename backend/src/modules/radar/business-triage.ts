import type { RadarBusinessSiteInspection } from './b2b-site-inspection.js'
import { normalizeRadarText, type RadarSearchConfiguration } from './search-configuration.js'

export type RadarBusinessTriage = {
  targetStatus: 'confirmed' | 'review' | 'not_target' | 'insufficient'
  productFit: 'high' | 'possible' | 'low' | 'unknown'
  reasons: string[]
  evidenceUrls: string[]
}

export function triageRadarBusiness(input: { name: string; legalName?: string; cnpj?: string;
  cnaes: string[]; desiredCnaes: string[]; configuration: RadarSearchConfiguration;
  website?: RadarBusinessSiteInspection }): RadarBusinessTriage {
  const rules = input.configuration.qualification
  const text = normalizeRadarText(input.website?.text ?? '')
  const hasTerm = (term: string) => (` ${text} `).includes(` ${normalizeRadarText(term)} `)
  const names = [input.name, input.legalName].filter((value): value is string => Boolean(value))
    .map(value => normalizeRadarText(value).replace(/\b(?:ltda|eireli|epp|me|sa)\b/g, '').trim())
  const cnpj = input.cnpj?.replace(/\D/g, '')
  const identity = names.some(name => name.length >= 3 && text.includes(name))
    || Boolean(cnpj && cnpj.length === 14 && input.website?.text?.replace(/\D/g, '').includes(cnpj))
  const expectedCnaes = input.desiredCnaes.map(value => value.replace(/\D/g, ''))
  const cnaeMatch = expectedCnaes.length > 0 && input.cnaes.some(value => expectedCnaes.includes(value.replace(/\D/g, '')))
  const evidenceUrls = input.website?.status === 'verified_present' && input.website.finalUrl ? [input.website.finalUrl] : []
  const reasons: string[] = []
  let targetStatus: RadarBusinessTriage['targetStatus'] = 'review'
  if (input.website?.status !== 'verified_present') {
    targetStatus = rules.missingWebsite
    reasons.push('Site ainda não verificado; aplicar revisão conforme configuração da campanha.')
  } else if (!identity) {
    reasons.push('O site não comprova a identidade desta empresa; revisar a associação antes de qualificar.')
  } else if (rules.excludeTerms.some(hasTerm)) {
    targetStatus = 'not_target'
    reasons.push(`Encontrado critério de exclusão: ${rules.excludeTerms.filter(hasTerm).join(', ')}.`)
  } else if (rules.requireCnaeMatch && !cnaeMatch) {
    targetStatus = 'not_target'
    reasons.push('Os CNAEs retornados não atendem ao critério obrigatório configurado.')
  } else {
    const hasPositiveRule = rules.includeAnyTerms.length > 0 || rules.includeAllTerms.length > 0
      || (rules.requireCnaeMatch && expectedCnaes.length > 0)
    const any = !rules.includeAnyTerms.length || rules.includeAnyTerms.some(hasTerm)
    const all = rules.includeAllTerms.every(hasTerm)
    if (hasPositiveRule && any && all) {
      targetStatus = 'confirmed'
      reasons.push('Identidade do site e critérios de inclusão configurados foram confirmados pelas evidências.')
    } else reasons.push(hasPositiveRule ? 'Evidência insuficiente para cumprir todos os critérios de inclusão.'
      : 'A campanha não definiu critérios positivos para confirmação automática; revisar manualmente.')
  }
  const matches = rules.productTerms.map(hasTerm)
  const fit = identity && rules.productTerms.length > 0
    && (rules.productMatch === 'all' ? matches.every(Boolean) : matches.some(Boolean))
  const productFit = fit ? 'possible' : 'unknown'
  reasons.push(fit ? 'Termos comerciais configurados aparecem no site; compra e volume exigem confirmação.'
    : 'A aderência comercial ainda não foi comprovada pelos termos configurados.')
  return { targetStatus, productFit, reasons, evidenceUrls }
}
