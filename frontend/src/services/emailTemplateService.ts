import { apiRequest } from '@/lib/apiClient'
import type {
  EmailTemplate,
  EmailTemplateInput,
  EmailTemplateTestSendInput,
  EmailTemplateTestSendResult,
} from '@/types/emailTemplate'

export class EmailTemplateService {
  async listAdminTemplates(): Promise<EmailTemplate[]> {
    return apiRequest<EmailTemplate[]>('/email-templates/admin/templates')
  }

  async saveAdminTemplate(input: EmailTemplateInput): Promise<EmailTemplate> {
    return apiRequest<EmailTemplate>('/email-templates/admin/templates', {
      method: 'POST',
      body: input,
    })
  }

  async publishAdminTemplate(id: string): Promise<EmailTemplate> {
    return apiRequest<EmailTemplate>(`/email-templates/admin/templates/${id}/publish`, {
      method: 'POST',
    })
  }

  async testAdminTemplate(id: string, input: EmailTemplateTestSendInput): Promise<EmailTemplateTestSendResult> {
    return apiRequest<EmailTemplateTestSendResult>(`/email-templates/admin/templates/${id}/test-send`, {
      method: 'POST',
      body: input,
    })
  }

  async listPortalTemplates(): Promise<EmailTemplate[]> {
    return apiRequest<EmailTemplate[]>('/email-templates/portal/templates')
  }

  async savePortalTemplate(input: EmailTemplateInput): Promise<EmailTemplate> {
    return apiRequest<EmailTemplate>('/email-templates/portal/templates', {
      method: 'POST',
      body: input,
    })
  }

  async publishPortalTemplate(id: string): Promise<EmailTemplate> {
    return apiRequest<EmailTemplate>(`/email-templates/portal/templates/${id}/publish`, {
      method: 'POST',
    })
  }

  async testPortalTemplate(id: string, input: EmailTemplateTestSendInput): Promise<EmailTemplateTestSendResult> {
    return apiRequest<EmailTemplateTestSendResult>(`/email-templates/portal/templates/${id}/test-send`, {
      method: 'POST',
      body: input,
    })
  }

  async cloneBlueprint(id: string): Promise<EmailTemplate> {
    return apiRequest<EmailTemplate>(`/email-templates/portal/blueprints/${id}/clone`, {
      method: 'POST',
    })
  }
}

export const emailTemplateService = new EmailTemplateService()
