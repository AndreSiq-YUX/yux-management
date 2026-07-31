import type {
  EmailTemplateDefinition,
  EmailTemplateKind,
  EmailTemplateMode,
  EmailTemplateScope,
  PublishValidationInput,
  PublishValidationResult,
} from './types.js'

const VARIABLE_PATTERN = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g

const adminRoles = new Set(['admin', 'yux_admin', 'yux_operator'])
const clientRoles = new Set(['client', 'client_admin', 'client_member'])

export const defaultSystemEmailTemplates: EmailTemplateDefinition[] = [
  {
    scope: 'system',
    blueprintKey: 'system.client_invitation',
    name: 'Convite inicial do cliente',
    description: 'Email enviado quando um cliente recebe acesso ao YUX Hub pela primeira vez.',
    category: 'access',
    emailKind: 'transactional',
    moduleKey: 'auth',
    triggerKey: 'client_invitation',
    subject: 'Acesso ao YUX Hub - {{company_name}}',
    preheader: 'Defina sua senha para acessar o YUX Hub.',
    bodyHtml:
      '<p>Ola, {{contact_name}}.</p><p>Seu acesso ao <strong>YUX Hub</strong> foi criado para <strong>{{company_name}}</strong>.</p><p>Use o botao abaixo para definir sua senha e acessar o portal.</p><p><a href="{{invite_url}}">Definir senha</a></p><p>Este link expira em 7 dias.</p><p>Equipe YUX</p>',
    bodyText:
      'Ola, {{contact_name}}.\n\nSeu acesso ao YUX Hub foi criado para {{company_name}}.\nUse o link abaixo para definir sua senha e acessar o portal:\n\n{{invite_url}}\n\nEste link expira em 7 dias.\n\nEquipe YUX',
    variablesSchema: {
      contact_name: { label: 'Nome do contato' },
      company_name: { label: 'Empresa' },
      invite_url: { label: 'Link de convite' },
    },
    requiredVariables: ['contact_name', 'company_name', 'invite_url'],
    editableByClient: false,
  },
  {
    scope: 'system',
    blueprintKey: 'system.password_reset',
    name: 'Redefinicao de senha',
    description: 'Email usado para redefinir senha do YUX Hub.',
    category: 'access',
    emailKind: 'transactional',
    moduleKey: 'auth',
    triggerKey: 'password_reset',
    subject: 'Redefina sua senha do YUX Hub',
    preheader: 'Crie uma nova senha para acessar o YUX Hub.',
    bodyHtml:
      '<p>Ola, {{contact_name}}.</p><p>Recebemos uma solicitacao para redefinir sua senha de acesso ao <strong>YUX Hub</strong>.</p><p>Use o botao abaixo para criar uma nova senha.</p><p><a href="{{reset_url}}">Redefinir senha</a></p><p>Este link expira em 7 dias.</p><p>Se voce nao solicitou essa alteracao, ignore este email.</p><p>Equipe YUX</p>',
    bodyText:
      'Ola, {{contact_name}}.\n\nRecebemos uma solicitacao para redefinir sua senha de acesso ao YUX Hub.\nUse o link abaixo para criar uma nova senha:\n\n{{reset_url}}\n\nEste link expira em 7 dias.\n\nSe voce nao solicitou essa alteracao, ignore este email.\n\nEquipe YUX',
    variablesSchema: {
      contact_name: { label: 'Nome do contato' },
      reset_url: { label: 'Link de redefinicao' },
    },
    requiredVariables: ['contact_name', 'reset_url'],
    editableByClient: false,
  },
]

export function extractTemplateVariables(subject: string, bodyHtml: string) {
  const values = new Set<string>()
  for (const source of [subject, bodyHtml]) {
    for (const match of source.matchAll(VARIABLE_PATTERN)) {
      values.add(match[1])
    }
  }
  return Array.from(values).sort()
}

export function validateTemplateForPublish(input: PublishValidationInput): PublishValidationResult {
  if (!input.subject.trim()) return { ok: false, reason: 'subject_required' }
  if (!input.bodyHtml.trim()) return { ok: false, reason: 'body_required' }

  const variables = extractTemplateVariables(input.subject, input.bodyHtml)
  const missingVariables = uniqueSorted(input.requiredVariables.filter((variable) => !variables.includes(variable)))
  if (missingVariables.length > 0) {
    return { ok: false, reason: 'required_variable_missing', missingVariables }
  }

  if (input.emailKind === 'marketing' && !variables.includes('unsubscribe_url')) {
    return {
      ok: false,
      reason: 'marketing_requires_unsubscribe_url',
      missingVariables: ['unsubscribe_url'],
    }
  }

  return { ok: true }
}

export function canManageTemplateScope(input: { role: string; mode: EmailTemplateMode; scope: EmailTemplateScope }) {
  if (input.mode === 'admin') {
    return adminRoles.has(input.role) && input.scope !== 'organization'
  }

  if (input.mode === 'portal') {
    return clientRoles.has(input.role) && input.scope === 'organization'
  }

  return false
}

export function isEmailTemplateKind(value: string): value is EmailTemplateKind {
  return value === 'transactional' || value === 'operational' || value === 'marketing'
}

function uniqueSorted(values: string[]) {
  return Array.from(new Set(values)).sort()
}
