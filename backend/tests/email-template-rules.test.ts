import { describe, expect, it } from 'vitest'
import {
  canManageTemplateScope,
  extractTemplateVariables,
  validateTemplateForPublish,
} from '../src/modules/emailTemplates/templateRules.js'
import { renderEmailTemplate, sanitizeEmailHtml } from '../src/modules/emailTemplates/templateRenderer.js'

describe('email template rules', () => {
  it('extracts unique template variables from subject and html', () => {
    expect(extractTemplateVariables('Ola {{name}}', '<p>{{name}} {{invite_url}}</p>')).toEqual([
      'invite_url',
      'name',
    ])
  })

  it('blocks publishing when required variables are missing from content', () => {
    const result = validateTemplateForPublish({
      subject: 'Acesso',
      bodyHtml: '<p>Ola {{contact_name}}</p>',
      requiredVariables: ['contact_name', 'invite_url'],
      emailKind: 'transactional',
    })

    expect(result).toEqual({
      ok: false,
      reason: 'required_variable_missing',
      missingVariables: ['invite_url'],
    })
  })

  it('requires unsubscribe_url for marketing templates', () => {
    const result = validateTemplateForPublish({
      subject: 'Novidade',
      bodyHtml: '<p>Conteudo</p>',
      requiredVariables: [],
      emailKind: 'marketing',
    })

    expect(result).toEqual({
      ok: false,
      reason: 'marketing_requires_unsubscribe_url',
      missingVariables: ['unsubscribe_url'],
    })
  })

  it('sanitizes scripts and renders variables', () => {
    const html = sanitizeEmailHtml('<p>Ola {{name}}</p><script>alert(1)</script>')
    const rendered = renderEmailTemplate({
      subject: 'Ola {{name}}',
      bodyHtml: html,
      bodyText: null,
      variables: { name: 'Andre' },
    })

    expect(rendered.subject).toBe('Ola Andre')
    expect(rendered.html).toBe('<p>Ola Andre</p>')
    expect(rendered.text).toContain('Ola Andre')
  })

  it('escapes variable values before rendering html', () => {
    const rendered = renderEmailTemplate({
      subject: 'Ola {{name}}',
      bodyHtml: '<p>{{name}}</p>',
      bodyText: null,
      variables: { name: '<img src=x onerror=alert(1)>' },
    })

    expect(rendered.subject).toBe('Ola <img src=x onerror=alert(1)>')
    expect(rendered.html).toBe('<p>&lt;img src=x onerror=alert(1)&gt;</p>')
    expect(rendered.text).toContain('<img src=x onerror=alert(1)>')
  })

  it('enforces scope permissions', () => {
    expect(canManageTemplateScope({ role: 'admin', mode: 'admin', scope: 'system' })).toBe(true)
    expect(canManageTemplateScope({ role: 'client', mode: 'portal', scope: 'system' })).toBe(false)
    expect(canManageTemplateScope({ role: 'client', mode: 'portal', scope: 'organization' })).toBe(true)
    expect(canManageTemplateScope({ role: 'admin', mode: 'admin', scope: 'organization' })).toBe(false)
  })
})
