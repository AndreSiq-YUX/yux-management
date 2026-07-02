import type pg from 'pg'
import type {
  EmailTemplateKind,
  EmailTemplateRow,
  EmailTemplateScope,
  EmailTemplateStatus,
} from './types.js'

export type TemplateListMode = 'admin' | 'portal'

export type TemplateListInput = {
  mode: TemplateListMode
  organizationId?: string
  status?: EmailTemplateStatus
}

export type SaveEmailTemplateInput = {
  id?: string
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
  userId: string
}

export type EmailTemplateSendRequestRow = {
  id: string
  templateId: string | null
  templateVersionId: string | null
  recipientEmail: string
  emailKind: EmailTemplateKind
  moduleKey: string
  subject: string
  status: string
  protectedError: string | null
  createdAt: string
  updatedAt: string
}

type Queryable = Pick<pg.Pool, 'query'>

const templateColumns = `
  id, scope, organization_id, blueprint_key, name, description, category, email_kind,
  module_key, trigger_key, status, subject, preheader, body_html, body_text,
  variables_schema, required_variables, editable_by_client, published_version_id,
  created_at, updated_at
`

export function buildTemplateListWhere(input: TemplateListInput) {
  const values: unknown[] = []
  const where: string[] = []

  if (input.mode === 'admin') {
    values.push(['system', 'blueprint'])
    where.push(`scope = ANY($${values.length})`)
  } else {
    values.push('organization')
    where.push(`scope = $${values.length}`)
    values.push(input.organizationId)
    where.push(`organization_id = $${values.length}`)
  }

  if (input.status) {
    values.push(input.status)
    where.push(`status = $${values.length}`)
  }

  return { sql: `WHERE ${where.join(' AND ')}`, values }
}

export function mapEmailTemplateRow(row: any): EmailTemplateRow {
  return {
    id: row.id,
    scope: row.scope,
    organizationId: row.organization_id,
    blueprintKey: row.blueprint_key,
    name: row.name,
    description: row.description,
    category: row.category,
    emailKind: row.email_kind,
    moduleKey: row.module_key,
    triggerKey: row.trigger_key,
    status: row.status,
    subject: row.subject,
    preheader: row.preheader,
    bodyHtml: row.body_html,
    bodyText: row.body_text,
    variablesSchema: row.variables_schema || {},
    requiredVariables: row.required_variables || [],
    editableByClient: Boolean(row.editable_by_client),
    publishedVersionId: row.published_version_id,
    createdAt: toIsoValue(row.created_at),
    updatedAt: toIsoValue(row.updated_at),
  }
}

export function mapEmailTemplateSendRequestRow(row: any): EmailTemplateSendRequestRow {
  return {
    id: row.id,
    templateId: row.template_id,
    templateVersionId: row.template_version_id,
    recipientEmail: row.recipient_email,
    emailKind: row.email_kind,
    moduleKey: row.module_key,
    subject: row.subject,
    status: row.status,
    protectedError: row.protected_error,
    createdAt: toIsoValue(row.created_at),
    updatedAt: toIsoValue(row.updated_at),
  }
}

export async function listEmailTemplates(pool: pg.Pool, input: TemplateListInput) {
  const filter = buildTemplateListWhere(input)
  const result = await pool.query(
    `SELECT ${templateColumns}
     FROM public.email_templates
     ${filter.sql}
     ORDER BY updated_at DESC`,
    filter.values,
  )
  return result.rows.map(mapEmailTemplateRow)
}

export async function getEmailTemplateById(pool: pg.Pool, id: string) {
  const result = await pool.query(
    `SELECT ${templateColumns}
     FROM public.email_templates
     WHERE id = $1
     LIMIT 1`,
    [id],
  )
  return result.rows[0] ? mapEmailTemplateRow(result.rows[0]) : null
}

export async function getPublishedSystemTemplateByTrigger(pool: pg.Pool, triggerKey: string) {
  const result = await pool.query(
    `SELECT ${templateColumns}
     FROM public.email_templates
     WHERE scope = 'system'
       AND trigger_key = $1
       AND status = 'published'
     ORDER BY updated_at DESC
     LIMIT 1`,
    [triggerKey],
  )
  return result.rows[0] ? mapEmailTemplateRow(result.rows[0]) : null
}

export async function saveEmailTemplate(pool: pg.Pool, input: SaveEmailTemplateInput) {
  const values = templateValues(input)

  if (input.id) {
    const result = await pool.query(
      `UPDATE public.email_templates
       SET scope = $2,
           organization_id = $3,
           blueprint_key = $4,
           name = $5,
           description = $6,
           category = $7,
           email_kind = $8,
           module_key = $9,
           trigger_key = $10,
           status = $11,
           subject = $12,
           preheader = $13,
           body_html = $14,
           body_text = $15,
           variables_schema = $16::jsonb,
           required_variables = $17,
           editable_by_client = $18,
           updated_by = $19,
           updated_at = NOW()
       WHERE id = $1
       RETURNING ${templateColumns}`,
      [input.id, ...values],
    )
    return result.rows[0] ? mapEmailTemplateRow(result.rows[0]) : null
  }

  const result = await pool.query(
    `INSERT INTO public.email_templates (
       scope, organization_id, blueprint_key, name, description, category, email_kind,
       module_key, trigger_key, status, subject, preheader, body_html, body_text,
       variables_schema, required_variables, editable_by_client, created_by, updated_by
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::jsonb, $16, $17, $18, $18)
     RETURNING ${templateColumns}`,
    values,
  )
  return mapEmailTemplateRow(result.rows[0])
}

export async function publishEmailTemplate(pool: pg.Pool, input: { templateId: string; userId: string }) {
  const result = await pool.query(
    `WITH current_template AS (
       SELECT id, subject, preheader, body_html, body_text, variables_schema, required_variables
       FROM public.email_templates
       WHERE id = $1
     ),
     next_version AS (
       SELECT COALESCE(MAX(version_number), 0) + 1 AS version_number
       FROM public.email_template_versions
       WHERE template_id = $1
     ),
     inserted_version AS (
       INSERT INTO public.email_template_versions (
         template_id, version_number, subject, preheader, body_html, body_text,
         variables_schema, required_variables, change_summary, published_by
       )
       SELECT
         current_template.id,
         next_version.version_number,
         current_template.subject,
         current_template.preheader,
         current_template.body_html,
         current_template.body_text,
         current_template.variables_schema,
         current_template.required_variables,
         'Published from template management',
         $2
       FROM current_template, next_version
       RETURNING id
     )
     UPDATE public.email_templates
     SET status = 'published',
         published_version_id = inserted_version.id,
         updated_by = $2,
         updated_at = NOW()
     FROM inserted_version
     WHERE email_templates.id = $1
     RETURNING ${templateColumns}`,
    [input.templateId, input.userId],
  )
  return result.rows[0] ? mapEmailTemplateRow(result.rows[0]) : null
}

export async function cloneBlueprintTemplate(
  pool: pg.Pool,
  input: { blueprintId: string; organizationId: string; userId: string },
) {
  const result = await pool.query(
    `INSERT INTO public.email_templates (
       scope, organization_id, blueprint_key, name, description, category, email_kind,
       module_key, trigger_key, status, subject, preheader, body_html, body_text,
       variables_schema, required_variables, editable_by_client, created_by, updated_by
     )
     SELECT
       'organization',
       $2,
       blueprint_key,
       name,
       description,
       category,
       email_kind,
       module_key,
       trigger_key,
       'draft',
       subject,
       preheader,
       body_html,
       body_text,
       variables_schema,
       required_variables,
       true,
       $3,
       $3
     FROM public.email_templates
     WHERE id = $1
       AND scope = 'blueprint'
     RETURNING ${templateColumns}`,
    [input.blueprintId, input.organizationId, input.userId],
  )
  return result.rows[0] ? mapEmailTemplateRow(result.rows[0]) : null
}

export async function listEmailTemplateSendRequests(
  pool: pg.Pool,
  input: { mode: TemplateListMode; organizationId?: string; limit?: number },
) {
  const values: unknown[] = []
  const where: string[] = []

  if (input.mode === 'admin') {
    values.push('system')
    where.push(`sender_scope = $${values.length}`)
  } else {
    values.push(input.organizationId)
    where.push(`organization_id = $${values.length}`)
  }

  values.push(input.limit ?? 50)
  const result = await pool.query(
    `SELECT id, template_id, template_version_id, recipient_email, email_kind,
            module_key, subject, status, protected_error, created_at, updated_at
     FROM public.email_send_requests
     WHERE ${where.join(' AND ')}
     ORDER BY created_at DESC
     LIMIT $${values.length}`,
    values,
  )

  return result.rows.map(mapEmailTemplateSendRequestRow)
}

export async function recordEmailTemplateSendRequest(
  pool: pg.Pool,
  input: {
    organizationId: string
    templateId: string
    templateVersionId: string | null
    emailKind: EmailTemplateKind
    moduleKey: string
    recipientEmail: string
    subject: string
    htmlBody: string
    textBody: string
    renderedVariables: Record<string, unknown>
    senderScope: 'system' | 'organization'
    status: 'sent' | 'failed' | 'rejected'
    providerMessageId?: string | null
    protectedError?: string | null
    idempotencyKey: string
    userId: string
  },
) {
  const result = await pool.query(
    `INSERT INTO public.email_send_requests (
       organization_id, template_id, template_version_id, email_kind, module_key,
       recipient_email, recipient_opt_in, subject, body_html, body_text, rendered_variables,
       sender_scope, status, provider_message_id, idempotency_key, protected_error, created_by
     )
     VALUES ($1, $2, $3, $4, $5, $6, TRUE, $7, $8, $9, $10::jsonb, $11, $12, $13, $14, $15, $16)
     RETURNING id, template_id, template_version_id, recipient_email, email_kind,
               module_key, subject, status, protected_error, created_at, updated_at`,
    [
      input.organizationId,
      input.templateId,
      input.templateVersionId,
      input.emailKind,
      input.moduleKey,
      input.recipientEmail,
      input.subject,
      input.htmlBody,
      input.textBody,
      JSON.stringify(input.renderedVariables),
      input.senderScope,
      input.status,
      input.providerMessageId ?? null,
      input.idempotencyKey,
      input.protectedError ?? null,
      input.userId,
    ],
  )

  return mapEmailTemplateSendRequestRow(result.rows[0])
}

function templateValues(input: SaveEmailTemplateInput) {
  return [
    input.scope,
    input.organizationId,
    input.blueprintKey,
    input.name,
    input.description,
    input.category,
    input.emailKind,
    input.moduleKey,
    input.triggerKey,
    input.status,
    input.subject,
    input.preheader,
    input.bodyHtml,
    input.bodyText,
    JSON.stringify(input.variablesSchema),
    input.requiredVariables,
    input.editableByClient,
    input.userId,
  ]
}

function toIsoValue(value: unknown): string {
  if (value instanceof Date) return value.toISOString()
  return typeof value === 'string' ? value : String(value)
}
