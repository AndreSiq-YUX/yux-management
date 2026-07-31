import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { AuthUser } from '../../auth/routes.js'
import { hashSessionToken } from '../../auth/session.js'
import { sendConfiguredSmtp2GoEmail } from '../../email/smtp2goConfigured.js'
import { getMembershipsForUser } from '../platform/repository.js'
import {
  cloneBlueprintTemplate,
  getEmailTemplateById,
  listEmailTemplateSendRequests,
  listEmailTemplates,
  publishEmailTemplate,
  recordEmailTemplateSendRequest,
  saveEmailTemplate,
} from './repository.js'
import { validateTemplateForPublish } from './templateRules.js'
import { renderEmailTemplate, sanitizeEmailHtml } from './templateRenderer.js'
import type { EmailTemplateRow, EmailTemplateScope, EmailTemplateStatus } from './types.js'

const adminRoles = new Set(['admin', 'manager', 'yux_admin', 'yux_operator'])
const clientRoles = new Set(['client', 'client_admin', 'client_member'])

const idParamSchema = z.object({ id: z.string().uuid() })
const statusSchema = z.enum(['draft', 'published', 'paused', 'archived'])
const scopeSchema = z.enum(['system', 'organization', 'blueprint'])
const emailKindSchema = z.enum(['transactional', 'operational', 'marketing'])

const listQuerySchema = z.object({
  status: statusSchema.optional(),
  organizationId: z.string().uuid().optional(),
})

const sendRequestQuerySchema = z.object({
  organizationId: z.string().uuid().optional(),
  limit: z.coerce.number().int().positive().max(200).optional(),
})

const templateBodySchema = z.object({
  id: z.string().uuid().optional(),
  scope: scopeSchema.optional(),
  blueprintKey: z.string().trim().min(1).nullable().optional(),
  name: z.string().trim().min(1),
  description: z.string().trim().nullable().optional(),
  category: z.string().trim().min(1).default('general'),
  emailKind: emailKindSchema,
  moduleKey: z.string().trim().min(1).default('email'),
  triggerKey: z.string().trim().min(1).nullable().optional(),
  status: statusSchema.optional(),
  subject: z.string().trim().min(1),
  preheader: z.string().trim().nullable().optional(),
  bodyHtml: z.string().trim().min(1),
  bodyText: z.string().nullable().optional(),
  variablesSchema: z.record(z.string(), z.unknown()).optional(),
  requiredVariables: z.array(z.string().trim().min(1)).optional(),
  editableByClient: z.boolean().optional(),
})

const testSendBodySchema = z.object({
  to: z.string().email(),
  variables: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).default({}),
})

async function getAuthenticatedUser(request: FastifyRequest, reply: FastifyReply) {
  const token = request.cookies[request.server.config.SESSION_COOKIE_NAME]
  if (!token) {
    void reply.code(401).send({ error: 'not_authenticated' })
    return null
  }

  const user = await request.server.authStore.findUserBySession(hashSessionToken(token), new Date())
  if (!user) {
    void reply.code(401).send({ error: 'not_authenticated' })
    return null
  }

  return user
}

function requireAdminUser(user: AuthUser, reply: FastifyReply) {
  if (!adminRoles.has(user.role)) {
    void reply.code(403).send({ error: 'admin_forbidden' })
    return false
  }
  return true
}

function requirePortalUser(user: AuthUser, reply: FastifyReply) {
  if (!clientRoles.has(user.role)) {
    void reply.code(403).send({ error: 'portal_forbidden' })
    return false
  }
  return true
}

async function resolvePortalOrganization(
  app: FastifyInstance,
  user: AuthUser,
  reply: FastifyReply,
  requestedOrganizationId?: string,
) {
  const memberships = await getMembershipsForUser(app.pg, user.id)
  const organizationId = requestedOrganizationId ?? memberships[0]?.organizationId

  if (!organizationId || !memberships.some((membership) => membership.organizationId === organizationId)) {
    void reply.code(403).send({ error: 'organization_forbidden' })
    return null
  }

  return organizationId
}

function canReadTemplateAsAdmin(template: EmailTemplateRow) {
  return template.scope === 'system' || template.scope === 'blueprint'
}

function canReadTemplateAsPortal(template: EmailTemplateRow, organizationId: string) {
  return template.scope === 'organization' && template.organizationId === organizationId
}

function routeSendStatus(sent: boolean, reason?: string) {
  if (sent) return 'sent'
  return reason === 'smtp2go_rejected' ? 'rejected' : 'failed'
}

export async function registerEmailTemplateRoutes(app: FastifyInstance) {
  app.get('/admin/templates', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user || !requireAdminUser(user, reply)) return reply

    const query = listQuerySchema.safeParse(request.query)
    if (!query.success) return reply.code(400).send({ error: query.error.flatten() })

    return listEmailTemplates(app.pg, { mode: 'admin', status: query.data.status })
  })

  app.get('/admin/templates/:id', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user || !requireAdminUser(user, reply)) return reply

    const params = idParamSchema.safeParse(request.params)
    if (!params.success) return reply.code(400).send({ error: 'invalid_template_id' })

    const template = await getEmailTemplateById(app.pg, params.data.id)
    if (!template || !canReadTemplateAsAdmin(template)) return reply.code(404).send({ error: 'template_not_found' })

    return template
  })

  app.post('/admin/templates', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user || !requireAdminUser(user, reply)) return reply

    const parsed = templateBodySchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() })

    const existing = parsed.data.id ? await getEmailTemplateById(app.pg, parsed.data.id) : null
    if (parsed.data.id && (!existing || !canReadTemplateAsAdmin(existing))) {
      return reply.code(404).send({ error: 'template_not_found' })
    }

    const scope = (parsed.data.scope ?? existing?.scope ?? 'system') as EmailTemplateScope
    if (scope === 'organization') return reply.code(400).send({ error: 'invalid_admin_template_scope' })

    if (parsed.data.status === 'published') {
      const validation = validateTemplateForPublish({
        subject: parsed.data.subject,
        bodyHtml: parsed.data.bodyHtml,
        requiredVariables: parsed.data.requiredVariables ?? [],
        emailKind: parsed.data.emailKind,
      })
      if (!validation.ok) return reply.code(400).send({ error: 'template_publish_invalid', validation })
    }

    const template = await saveEmailTemplate(app.pg, {
      id: parsed.data.id,
      scope,
      organizationId: null,
      blueprintKey: parsed.data.blueprintKey ?? existing?.blueprintKey ?? null,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      category: parsed.data.category,
      emailKind: parsed.data.emailKind,
      moduleKey: parsed.data.moduleKey,
      triggerKey: parsed.data.triggerKey ?? null,
      status: (parsed.data.status ?? 'draft') as EmailTemplateStatus,
      subject: parsed.data.subject,
      preheader: parsed.data.preheader ?? null,
      bodyHtml: sanitizeEmailHtml(parsed.data.bodyHtml),
      bodyText: parsed.data.bodyText ?? null,
      variablesSchema: parsed.data.variablesSchema ?? {},
      requiredVariables: parsed.data.requiredVariables ?? [],
      editableByClient: parsed.data.editableByClient ?? scope === 'blueprint',
      userId: user.id,
    })

    return template
  })

  app.post('/admin/templates/:id/publish', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user || !requireAdminUser(user, reply)) return reply

    const params = idParamSchema.safeParse(request.params)
    if (!params.success) return reply.code(400).send({ error: 'invalid_template_id' })

    const template = await getEmailTemplateById(app.pg, params.data.id)
    if (!template || !canReadTemplateAsAdmin(template)) return reply.code(404).send({ error: 'template_not_found' })

    const validation = validateTemplateForPublish({
      subject: template.subject,
      bodyHtml: template.bodyHtml,
      requiredVariables: template.requiredVariables,
      emailKind: template.emailKind,
    })
    if (!validation.ok) return reply.code(400).send({ error: 'template_publish_invalid', validation })

    const published = await publishEmailTemplate(app.pg, { templateId: template.id, userId: user.id })
    if (!published) return reply.code(404).send({ error: 'template_not_found' })

    return published
  })

  app.post('/admin/templates/:id/test-send', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user || !requireAdminUser(user, reply)) return reply

    const params = idParamSchema.safeParse(request.params)
    if (!params.success) return reply.code(400).send({ error: 'invalid_template_id' })

    const parsed = testSendBodySchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() })

    const template = await getEmailTemplateById(app.pg, params.data.id)
    if (!template || !canReadTemplateAsAdmin(template)) return reply.code(404).send({ error: 'template_not_found' })

    return sendTemplateTest(app, user, template, parsed.data.to, parsed.data.variables, 'system')
  })

  app.get('/admin/send-requests', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user || !requireAdminUser(user, reply)) return reply

    const query = sendRequestQuerySchema.safeParse(request.query)
    if (!query.success) return reply.code(400).send({ error: query.error.flatten() })

    return listEmailTemplateSendRequests(app.pg, { mode: 'admin', limit: query.data.limit })
  })

  app.get('/portal/templates', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user || !requirePortalUser(user, reply)) return reply

    const query = listQuerySchema.safeParse(request.query)
    if (!query.success) return reply.code(400).send({ error: query.error.flatten() })

    const organizationId = await resolvePortalOrganization(app, user, reply, query.data.organizationId)
    if (!organizationId) return reply

    return listEmailTemplates(app.pg, { mode: 'portal', organizationId, status: query.data.status })
  })

  app.get('/portal/templates/:id', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user || !requirePortalUser(user, reply)) return reply

    const params = idParamSchema.safeParse(request.params)
    if (!params.success) return reply.code(400).send({ error: 'invalid_template_id' })

    const organizationId = await resolvePortalOrganization(app, user, reply)
    if (!organizationId) return reply

    const template = await getEmailTemplateById(app.pg, params.data.id)
    if (!template || !canReadTemplateAsPortal(template, organizationId)) {
      return reply.code(404).send({ error: 'template_not_found' })
    }

    return template
  })

  app.post('/portal/templates', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user || !requirePortalUser(user, reply)) return reply

    const parsed = templateBodySchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() })

    const organizationId = await resolvePortalOrganization(app, user, reply)
    if (!organizationId) return reply

    const existing = parsed.data.id ? await getEmailTemplateById(app.pg, parsed.data.id) : null
    if (parsed.data.id && (!existing || !canReadTemplateAsPortal(existing, organizationId))) {
      return reply.code(404).send({ error: 'template_not_found' })
    }

    if (parsed.data.status === 'published') {
      const validation = validateTemplateForPublish({
        subject: parsed.data.subject,
        bodyHtml: parsed.data.bodyHtml,
        requiredVariables: parsed.data.requiredVariables ?? [],
        emailKind: parsed.data.emailKind,
      })
      if (!validation.ok) return reply.code(400).send({ error: 'template_publish_invalid', validation })
    }

    return saveEmailTemplate(app.pg, {
      id: parsed.data.id,
      scope: 'organization',
      organizationId,
      blueprintKey: parsed.data.blueprintKey ?? existing?.blueprintKey ?? null,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      category: parsed.data.category,
      emailKind: parsed.data.emailKind,
      moduleKey: parsed.data.moduleKey,
      triggerKey: parsed.data.triggerKey ?? null,
      status: (parsed.data.status ?? 'draft') as EmailTemplateStatus,
      subject: parsed.data.subject,
      preheader: parsed.data.preheader ?? null,
      bodyHtml: sanitizeEmailHtml(parsed.data.bodyHtml),
      bodyText: parsed.data.bodyText ?? null,
      variablesSchema: parsed.data.variablesSchema ?? {},
      requiredVariables: parsed.data.requiredVariables ?? [],
      editableByClient: true,
      userId: user.id,
    })
  })

  app.post('/portal/templates/:id/publish', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user || !requirePortalUser(user, reply)) return reply

    const params = idParamSchema.safeParse(request.params)
    if (!params.success) return reply.code(400).send({ error: 'invalid_template_id' })

    const organizationId = await resolvePortalOrganization(app, user, reply)
    if (!organizationId) return reply

    const template = await getEmailTemplateById(app.pg, params.data.id)
    if (!template || !canReadTemplateAsPortal(template, organizationId)) {
      return reply.code(404).send({ error: 'template_not_found' })
    }

    const validation = validateTemplateForPublish({
      subject: template.subject,
      bodyHtml: template.bodyHtml,
      requiredVariables: template.requiredVariables,
      emailKind: template.emailKind,
    })
    if (!validation.ok) return reply.code(400).send({ error: 'template_publish_invalid', validation })

    const published = await publishEmailTemplate(app.pg, { templateId: template.id, userId: user.id })
    if (!published) return reply.code(404).send({ error: 'template_not_found' })

    return published
  })

  app.post('/portal/templates/:id/test-send', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user || !requirePortalUser(user, reply)) return reply

    const params = idParamSchema.safeParse(request.params)
    if (!params.success) return reply.code(400).send({ error: 'invalid_template_id' })

    const parsed = testSendBodySchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() })

    const organizationId = await resolvePortalOrganization(app, user, reply)
    if (!organizationId) return reply

    const template = await getEmailTemplateById(app.pg, params.data.id)
    if (!template || !canReadTemplateAsPortal(template, organizationId)) {
      return reply.code(404).send({ error: 'template_not_found' })
    }

    return sendTemplateTest(app, user, template, parsed.data.to, parsed.data.variables, 'organization')
  })

  app.post('/portal/blueprints/:id/clone', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user || !requirePortalUser(user, reply)) return reply

    const params = idParamSchema.safeParse(request.params)
    if (!params.success) return reply.code(400).send({ error: 'invalid_template_id' })

    const organizationId = await resolvePortalOrganization(app, user, reply)
    if (!organizationId) return reply

    const template = await cloneBlueprintTemplate(app.pg, {
      blueprintId: params.data.id,
      organizationId,
      userId: user.id,
    })
    if (!template) return reply.code(404).send({ error: 'blueprint_not_found' })

    return template
  })

  app.get('/portal/send-requests', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user || !requirePortalUser(user, reply)) return reply

    const query = sendRequestQuerySchema.safeParse(request.query)
    if (!query.success) return reply.code(400).send({ error: query.error.flatten() })

    const organizationId = await resolvePortalOrganization(app, user, reply, query.data.organizationId)
    if (!organizationId) return reply

    return listEmailTemplateSendRequests(app.pg, { mode: 'portal', organizationId, limit: query.data.limit })
  })
}

async function sendTemplateTest(
  app: FastifyInstance,
  user: AuthUser,
  template: EmailTemplateRow,
  to: string,
  variables: Record<string, string | number | boolean | null>,
  senderScope: 'system' | 'organization',
) {
  const organizationId = template.organizationId ?? (await firstOrganizationIdForUser(app, user.id))
  const rendered = renderEmailTemplate({
    subject: template.subject,
    bodyHtml: template.bodyHtml,
    bodyText: template.bodyText,
    variables,
  })
  const emailResult = await sendConfiguredSmtp2GoEmail(app.pg, app.config.SESSION_SECRET, {
    organizationId,
    emailCategory: template.emailKind,
    recipientOptIn: template.emailKind !== 'marketing',
    to,
    subject: rendered.subject,
    textBody: rendered.text,
    htmlBody: rendered.html,
    customHeaders: [{ header: 'X-YUX-Template-ID', value: template.id }],
  })

  if (organizationId) {
    await recordEmailTemplateSendRequest(app.pg, {
      organizationId,
      templateId: template.id,
      templateVersionId: template.publishedVersionId,
      emailKind: template.emailKind,
      moduleKey: template.moduleKey,
      recipientEmail: to,
      subject: rendered.subject,
      htmlBody: rendered.html,
      textBody: rendered.text,
      renderedVariables: variables,
      senderScope,
      status: routeSendStatus(emailResult.sent, emailResult.sent ? undefined : emailResult.reason),
      providerMessageId: emailResult.sent ? emailResult.providerMessageId ?? null : null,
      protectedError: emailResult.sent ? null : emailResult.reason,
      idempotencyKey: `email-template-test:${template.id}:${randomUUID()}`,
      userId: user.id,
    })
  }

  return {
    sent: emailResult.sent,
    providerMessageId: emailResult.sent ? emailResult.providerMessageId : undefined,
    message: emailResult.sent ? 'sent' : emailResult.reason,
  }
}

async function firstOrganizationIdForUser(app: FastifyInstance, userId: string) {
  const memberships = await getMembershipsForUser(app.pg, userId)
  return memberships[0]?.organizationId ?? null
}
