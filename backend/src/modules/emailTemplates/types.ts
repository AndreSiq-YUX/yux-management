export type EmailTemplateScope = 'system' | 'organization' | 'blueprint'
export type EmailTemplateStatus = 'draft' | 'published' | 'paused' | 'archived'
export type EmailTemplateKind = 'transactional' | 'operational' | 'marketing'
export type EmailTemplateMode = 'admin' | 'portal'

export type EmailTemplateRow = {
  id: string
  scope: EmailTemplateScope
  organizationId: string | null
  blueprintKey: string | null
  name: string
  description: string | null
  category: string
  emailKind: EmailTemplateKind
  moduleKey: string
  triggerKey: string | null
  status: EmailTemplateStatus
  subject: string
  preheader: string | null
  bodyHtml: string
  bodyText: string | null
  variablesSchema: Record<string, unknown>
  requiredVariables: string[]
  editableByClient: boolean
  publishedVersionId: string | null
  createdAt: string
  updatedAt: string
}

export type EmailTemplateDefinition = {
  scope: Exclude<EmailTemplateScope, 'organization'>
  blueprintKey: string
  name: string
  description: string
  category: string
  emailKind: EmailTemplateKind
  moduleKey: string
  triggerKey: string
  subject: string
  preheader: string
  bodyHtml: string
  bodyText: string
  variablesSchema: Record<string, { label: string }>
  requiredVariables: string[]
  editableByClient: boolean
}

export type PublishValidationInput = {
  subject: string
  bodyHtml: string
  requiredVariables: string[]
  emailKind: EmailTemplateKind
}

export type PublishValidationResult =
  | { ok: true }
  | {
      ok: false
      reason:
        | 'subject_required'
        | 'body_required'
        | 'required_variable_missing'
        | 'marketing_requires_unsubscribe_url'
      missingVariables?: string[]
    }

export type RenderTemplateInput = {
  subject: string
  bodyHtml: string
  bodyText: string | null
  variables: Record<string, string | number | boolean | null | undefined>
}

export type RenderTemplateOutput = {
  subject: string
  html: string
  text: string
}
