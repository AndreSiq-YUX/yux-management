import type {
  EmailTemplateDraftValidationInput,
  EmailTemplateDraftValidationResult,
  EmailTemplateStatus,
} from '@/types/emailTemplate'

const VARIABLE_PATTERN = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g

const statusLabels: Record<EmailTemplateStatus, string> = {
  draft: 'Rascunho',
  published: 'Publicado',
  paused: 'Pausado',
  archived: 'Arquivado',
}

export function extractEmailTemplateVariables(subject: string, bodyHtml: string) {
  const values = new Set<string>()

  for (const source of [subject, bodyHtml]) {
    for (const match of source.matchAll(VARIABLE_PATTERN)) {
      values.add(match[1])
    }
  }

  return Array.from(values).sort()
}

export function getEmailTemplateStatusLabel(status: EmailTemplateStatus) {
  return statusLabels[status]
}

export function validateEmailTemplateDraft(
  input: EmailTemplateDraftValidationInput,
): EmailTemplateDraftValidationResult {
  if (!input.subject.trim()) return { ok: false, reason: 'subject_required' }
  if (!input.bodyHtml.trim()) return { ok: false, reason: 'body_required' }

  const variables = extractEmailTemplateVariables(input.subject, input.bodyHtml)
  const requiredVariables = input.requiredVariables || []
  const missingVariables = uniqueSorted(requiredVariables.filter(variable => !variables.includes(variable)))

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

function uniqueSorted(values: string[]) {
  return Array.from(new Set(values)).sort()
}
