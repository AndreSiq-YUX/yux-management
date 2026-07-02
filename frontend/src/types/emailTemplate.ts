export type EmailTemplateScope = 'system' | 'organization' | 'blueprint'
export type EmailTemplateStatus = 'draft' | 'published' | 'paused' | 'archived'
export type EmailTemplateKind = 'transactional' | 'operational' | 'marketing'

export interface EmailTemplate {
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

export interface EmailTemplateInput {
  id?: string
  name: string
  description?: string | null
  category: string
  emailKind: EmailTemplateKind
  moduleKey: string
  triggerKey?: string | null
  subject: string
  preheader?: string | null
  bodyHtml: string
  bodyText?: string | null
  variablesSchema?: Record<string, unknown>
  requiredVariables?: string[]
  editableByClient?: boolean
}

export interface EmailTemplateTestSendInput {
  to: string
  variables: Record<string, string>
}

export interface EmailTemplateTestSendResult {
  sent: boolean
  message?: string
}

export interface EmailTemplateSendRequest {
  id: string
  templateId: string | null
  templateVersionId: string | null
  recipientEmail: string
  emailKind: EmailTemplateKind
  moduleKey: string
  subject: string
  status: 'pending' | 'queued' | 'sent' | 'failed' | 'rejected' | string
  protectedError: string | null
  createdAt: string
  updatedAt: string
}

export type EmailTemplateDraftValidationInput = Pick<
  EmailTemplateInput,
  'subject' | 'bodyHtml' | 'requiredVariables' | 'emailKind'
>

export type EmailTemplateDraftValidationResult =
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
