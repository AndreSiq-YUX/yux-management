import type { LandingPageFieldMapping, LandingPageForm } from '@/types/landingPage'

type MappingInput = Pick<LandingPageFieldMapping, 'fieldName' | 'crmFieldKey' | 'required'>
type SnippetFormInput = { name: string; submitLabel?: string; mappings: MappingInput[]; metadata?: LandingPageForm['metadata'] }

/** Texto que ocupa o lugar do endereço de envio quando o endereço completo não está disponível. */
export const ENDPOINT_PLACEHOLDER = 'COLE_AQUI_O_ENDERECO_DE_ENVIO'

/**
 * Campos de uso interno: não viram campo visível no formulário do site, a menos que
 * estejam marcados como obrigatórios. (Perfil, país, pontuações e identificador do CRM.)
 */
const INTERNAL_CRM_KEYS = new Set(['profile', 'country', 'fit_score', 'intent_score', 'crm_contact_id'])

const KNOWN_LABELS: Record<string, string> = {
  name: 'Nome',
  email: 'E-mail',
  phone: 'Telefone',
  company: 'Empresa',
  notes: 'Mensagem',
  message: 'Mensagem',
}

export type SnippetFieldType = 'text' | 'email' | 'tel' | 'textarea'

export interface SnippetField {
  /** Nome do campo no formulário do site (o que o endereço de envio recebe). */
  name: string
  /** Campo do CRM que recebe o valor. */
  crmFieldKey: string
  label: string
  type: SnippetFieldType
  required: boolean
}

function humanize(value: string) {
  const text = value.replace(/[_-]+/g, ' ').trim()
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : value
}

function fieldType(crmFieldKey: string): SnippetFieldType {
  if (crmFieldKey === 'email') return 'email'
  if (crmFieldKey === 'phone') return 'tel'
  if (crmFieldKey === 'notes' || crmFieldKey === 'message') return 'textarea'
  return 'text'
}

/** Campos que o formulário do site deve ter, derivados do mapeamento configurado. */
export function resolveSnippetFields(mappings: MappingInput[]): SnippetField[] {
  return mappings
    .filter(mapping => mapping.required || !INTERNAL_CRM_KEYS.has(mapping.crmFieldKey))
    .map(mapping => ({
      name: mapping.fieldName,
      crmFieldKey: mapping.crmFieldKey,
      label: KNOWN_LABELS[mapping.crmFieldKey] || humanize(mapping.fieldName),
      type: fieldType(mapping.crmFieldKey),
      required: mapping.required,
    }))
}

/** Campos mapeados que ficam de fora do código por serem de uso interno. */
export function internalMappings<T extends Pick<LandingPageFieldMapping, 'crmFieldKey' | 'required'>>(mappings: T[]): T[] {
  return mappings.filter(mapping => !mapping.required && INTERNAL_CRM_KEYS.has(mapping.crmFieldKey))
}

/** O consentimento (LGPD) é exigido pelo envio, salvo se o formulário foi criado sem essa exigência. */
export function requiresConsent(form: Pick<LandingPageForm, 'metadata'>) {
  return form.metadata?.requiresConsent !== false
}

/** A chave do formulário é o último trecho do caminho do endereço: `/api/public/lead-forms/<chave>/submissions`. */
export function extractFormKey(endpoint?: string): string | undefined {
  if (!endpoint) return undefined
  const match = endpoint.match(/\/lead-forms\/([^/?#]+)\/submissions/)
  if (!match) return undefined
  try {
    return decodeURIComponent(match[1])
  } catch {
    return match[1]
  }
}

function escapeAttribute(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function escapeText(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * Código HTML pronto para colar no site. O endereço de envio já leva a chave do formulário
 * (não existe campo de chave no corpo) e o envio aceita `application/x-www-form-urlencoded`.
 * O aceite do consentimento (`consent_lgpd`) é obrigatório no envio.
 */
export function buildHtmlSnippet(form: SnippetFormInput, endpoint?: string): string {
  const action = endpoint || ENDPOINT_PLACEHOLDER
  const lines: string[] = [
    `<!-- Formulário "${escapeText(form.name).replace(/--/g, '- -')}" -->`,
    `<form action="${escapeAttribute(action)}" method="POST" style="max-width:420px">`,
  ]

  for (const field of resolveSnippetFields(form.mappings || [])) {
    const required = field.required ? ' required' : ''
    lines.push('  <p>')
    lines.push(`    <label>${escapeText(field.label)}${field.required ? ' *' : ''}<br>`)
    if (field.type === 'textarea') {
      lines.push(`      <textarea name="${escapeAttribute(field.name)}" rows="4"${required}></textarea>`)
    } else {
      lines.push(`      <input type="${field.type}" name="${escapeAttribute(field.name)}"${required}>`)
    }
    lines.push('    </label>')
    lines.push('  </p>')
  }

  if (requiresConsent(form)) {
    lines.push('  <p>')
    lines.push('    <label>')
    lines.push('      <input type="checkbox" name="consent_lgpd" value="true" required>')
    lines.push('      Concordo em receber contato e com a política de privacidade.')
    lines.push('    </label>')
    lines.push('  </p>')
  }

  lines.push(`  <button type="submit">${escapeText(form.submitLabel || 'Enviar')}</button>`)
  lines.push('</form>')
  return lines.join('\n')
}

/** Exemplo de envio direto (servidor para servidor) para o campo "Avançado". */
export function buildCurlExample(form: Pick<SnippetFormInput, 'mappings' | 'metadata'>, endpoint?: string): string {
  const fields = resolveSnippetFields(form.mappings || [])
  const sample: Record<string, string> = {}
  for (const field of fields) {
    sample[field.name] = field.crmFieldKey === 'email' ? 'maria@empresa.com' : field.crmFieldKey === 'name' ? 'Maria Silva' : field.crmFieldKey === 'phone' ? '+55 11 99999-9999' : 'valor'
  }
  if (requiresConsent(form)) sample.consent_lgpd = 'true'
  const payload = JSON.stringify(sample, null, 2).replace(/'/g, "'\\''")
  return [
    `curl -X POST '${endpoint || ENDPOINT_PLACEHOLDER}' \\`,
    "  -H 'Content-Type: application/json' \\",
    "  -H 'Idempotency-Key: pedido-123' \\",
    `  -d '${payload}'`,
  ].join('\n')
}
