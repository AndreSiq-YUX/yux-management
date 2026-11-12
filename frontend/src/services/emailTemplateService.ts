import { apiRequest } from '@/lib/apiClient'
import type {
  EmailTemplate,
  EmailTemplateInput,
  EmailTemplateSendRequest,
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

  async listAdminSendRequests(limit = 50): Promise<EmailTemplateSendRequest[]> {
    return apiRequest<EmailTemplateSendRequest[]>(`/email-templates/admin/send-requests?limit=${limit}`)
  }

  async listPortalTemplates(organizationId?: string): Promise<EmailTemplate[]> {
    return apiRequest<EmailTemplate[]>(`/email-templates/portal/templates${organizationQuery(organizationId)}`)
  }

  async savePortalTemplate(input: EmailTemplateInput, organizationId?: string): Promise<EmailTemplate> {
    return apiRequest<EmailTemplate>(`/email-templates/portal/templates${organizationQuery(organizationId)}`, {
      method: 'POST',
      body: input,
    })
  }

  async publishPortalTemplate(id: string, organizationId?: string): Promise<EmailTemplate> {
    return apiRequest<EmailTemplate>(`/email-templates/portal/templates/${id}/publish${organizationQuery(organizationId)}`, {
      method: 'POST',
    })
  }

  async testPortalTemplate(id: string, input: EmailTemplateTestSendInput, organizationId?: string): Promise<EmailTemplateTestSendResult> {
    return apiRequest<EmailTemplateTestSendResult>(`/email-templates/portal/templates/${id}/test-send${organizationQuery(organizationId)}`, {
      method: 'POST',
      body: input,
    })
  }

  async cloneBlueprint(id: string, organizationId?: string): Promise<EmailTemplate> {
    return apiRequest<EmailTemplate>(`/email-templates/portal/blueprints/${id}/clone${organizationQuery(organizationId)}`, {
      method: 'POST',
    })
  }

  async listPortalSendRequests(limit = 50, organizationId?: string): Promise<EmailTemplateSendRequest[]> {
    const organization = organizationId ? `&organizationId=${encodeURIComponent(organizationId)}` : ''
    return apiRequest<EmailTemplateSendRequest[]>(`/email-templates/portal/send-requests?limit=${limit}${organization}`)
  }
}

/** The client's own portal resolves its company; YUX staff operating a workspace name it explicitly. */
function organizationQuery(organizationId?: string) {
  return organizationId ? `?organizationId=${encodeURIComponent(organizationId)}` : ''
}

export const emailTemplateService = new EmailTemplateService()
