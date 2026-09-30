import { assertLicensedBraveRetention, type LicensedBraveConfig } from './licensed-brave.js'

export type B2bProspectCsvRow = {
  name: string
  cnpj: string
  city: string
  state: string
  websiteUrl: string
  phone: string
  email: string
  kitchenStatus: string
  productFit: string
  evidenceUrl: string
  checkedAt: string
  verificationMethod: string
  reviewNote: string
}

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

export function formatB2bProspectCsv(rows: B2bProspectCsvRow[]) {
  const header = ['Empresa', 'CNPJ', 'Cidade', 'UF', 'Site verificado', 'Telefone', 'E-mail',
    'Cozinha industrial', 'Aderência aos produtos', 'Fonte da evidência', 'Verificado em',
    'Método de verificação', 'Nota da revisão']
  const lines = rows.map(row => [row.name, row.cnpj, row.city, row.state, row.websiteUrl,
    row.phone, row.email, row.kitchenStatus, row.productFit, row.evidenceUrl, row.checkedAt,
    row.verificationMethod, row.reviewNote]
    .map(csvCell).join(';'))
  return `\uFEFF${header.map(csvCell).join(';')}\r\n${lines.join('\r\n')}\r\n`
}

function csvCell(value: string) {
  const safe = /^[\s]*[=+\-@\t\r]/.test(value) ? `'${value}` : value
  return `"${safe.replace(/"/g, '""')}"`
}
