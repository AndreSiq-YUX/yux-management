import { describe, expect, it } from 'vitest'
import { buildCurlExample, buildHtmlSnippet, extractFormKey, resolveSnippetFields } from './leadFormSnippet'

const mappings = [
  { fieldName: 'full_name', crmFieldKey: 'name', required: true },
  { fieldName: 'email', crmFieldKey: 'email', required: true },
  { fieldName: 'mensagem', crmFieldKey: 'notes', required: false },
  { fieldName: 'crm_contact_id', crmFieldKey: 'crm_contact_id', required: false },
  { fieldName: 'country', crmFieldKey: 'country', required: true },
]

describe('leadFormSnippet', () => {
  it('uses the external field names and skips internal optional fields', () => {
    const fields = resolveSnippetFields(mappings)
    expect(fields.map(field => field.name)).toEqual(['full_name', 'email', 'mensagem', 'country'])
    expect(fields.find(field => field.name === 'mensagem')?.type).toBe('textarea')
  })

  it('omits the consent checkbox only when the form does not require consent', () => {
    const base = { name: 'Site', submitLabel: 'Enviar', mappings }
    expect(buildHtmlSnippet({ ...base, metadata: {} }, 'https://x/api/public/lead-forms/k/submissions')).toContain('consent_lgpd')
    expect(buildHtmlSnippet({ ...base, metadata: { requiresConsent: false } }, 'https://x')).not.toContain('consent_lgpd')
  })

  it('escapes values placed in attributes', () => {
    const html = buildHtmlSnippet(
      {
        name: 'A "b" <c>',
        submitLabel: 'Ir',
        mappings: [
          { fieldName: 'a"b', crmFieldKey: 'name', required: true },
          { fieldName: 'email', crmFieldKey: 'email', required: true },
        ],
        metadata: {},
      },
      'https://x/?a=1&b=2',
    )
    expect(html).toContain('action="https://x/?a=1&amp;b=2"')
    expect(html).toContain('name="a&quot;b"')
  })

  it('extracts the form key from the endpoint', () => {
    expect(extractFormKey('https://app/api/public/lead-forms/chave-123/submissions')).toBe('chave-123')
    expect(extractFormKey(undefined)).toBeUndefined()
  })

  it('builds a curl example with the consent field', () => {
    const curl = buildCurlExample({ mappings, metadata: {} }, 'https://x/api/public/lead-forms/k/submissions')
    expect(curl).toContain("curl -X POST 'https://x/api/public/lead-forms/k/submissions'")
    expect(curl).toContain('"consent_lgpd": "true"')
  })
})
