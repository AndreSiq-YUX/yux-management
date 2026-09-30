import { assertLicensedBraveRetention, type LicensedBraveConfig } from './licensed-brave.js'
import { RADAR_EXPORT_FIELDS, type RadarExportField } from './search-configuration.js'

export type B2bProspectCsvRow = Partial<Record<RadarExportField, string>> & { name: string; cnpj: string }

export function assertB2bDeliveryRights(
  cnpjaConfig: Record<string, unknown>, braveConfig: LicensedBraveConfig | undefined, hasBraveFacts: boolean,
) {
  if (cnpjaConfig.clientDeliveryLicensed !== true || typeof cnpjaConfig.licenseReference !== 'string'
    || !cnpjaConfig.licenseReference.trim()) {
    throw Object.assign(new Error('radar_cnpja_client_delivery_not_approved'), { statusCode: 409 })
  }
  if (hasBraveFacts) {
    try {
      assertLicensedBraveRetention(braveConfig ?? {})
      if (braveConfig?.clientDeliveryLicensed !== true) throw new Error('client_delivery_missing')
    } catch {
      throw Object.assign(new Error('radar_brave_client_delivery_not_approved'), { statusCode: 409 })
    }
  }
}

export function formatB2bProspectCsv(rows: B2bProspectCsvRow[], fields: RadarExportField[] = [...RADAR_EXPORT_FIELDS]) {
  const labels: Record<RadarExportField, string> = { name: 'Empresa', legalName: 'Razão social', cnpj: 'CNPJ',
    city: 'Cidade', state: 'UF', address: 'Endereço', registrationStatus: 'Situação cadastral', cnaes: 'CNAEs',
    websiteUrl: 'Site', websiteStatus: 'Verificação do site', phone: 'Telefone', email: 'E-mail',
    instagramUrl: 'Instagram', rating: 'Avaliação', reviewCount: 'Quantidade de avaliações', targetStatus: 'Qualificação',
    productFit: 'Aderência comercial', evidenceUrl: 'Fonte da evidência', checkedAt: 'Verificado em',
    verificationMethod: 'Método de verificação', reviewNote: 'Nota da revisão' }
  const header = fields.map(field => labels[field])
  const lines = rows.map(row => fields.map(field => csvCell(row[field] ?? '')).join(';'))
  return `\uFEFF${header.map(csvCell).join(';')}\r\n${lines.join('\r\n')}\r\n`
}

function csvCell(value: string) {
  const safe = /^[\s]*[=+\-@\t\r]/.test(value) ? `'${value}` : value
  return `"${safe.replace(/"/g, '""')}"`
}
