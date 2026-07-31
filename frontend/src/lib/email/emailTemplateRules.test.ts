import { describe, expect, it } from 'vitest'
import {
  extractEmailTemplateVariables,
  getEmailTemplateStatusLabel,
  validateEmailTemplateDraft,
} from './emailTemplateRules'

describe('emailTemplateRules', () => {
  it('extracts unique variables from subject and html', () => {
    expect(
      extractEmailTemplateVariables(
        'Oi {{lead_name}} {{lead_name}}',
        '<p>{{proposal_url}} {{ unsubscribe_url }}</p>',
      ),
    ).toEqual(['lead_name', 'proposal_url', 'unsubscribe_url'])
  })

  it('labels statuses', () => {
    expect(getEmailTemplateStatusLabel('published')).toBe('Publicado')
    expect(getEmailTemplateStatusLabel('draft')).toBe('Rascunho')
  })

  it('blocks marketing templates without unsubscribe_url', () => {
    expect(validateEmailTemplateDraft({
      subject: 'Oferta',
      bodyHtml: '<p>Conteudo</p>',
      emailKind: 'marketing',
      requiredVariables: [],
    })).toEqual({
      ok: false,
      reason: 'marketing_requires_unsubscribe_url',
      missingVariables: ['unsubscribe_url'],
    })
  })
})
