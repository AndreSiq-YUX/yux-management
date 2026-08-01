import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { hashSessionToken } from '../../auth/session.js'
import { getContractOrganizationId } from '../../http/contract-organization.js'
import { requireAuth, requireMembership } from '../../http/guards.js'
import { dataQuerySchema } from '../data/routes.js'
import { createScopedTableRules, executeScopedDataQuery } from '../data/scoped-query.js'
import {
  createLeadForm,
  listLeadFormsForContract,
  replaceLeadFormMappings,
  rotateLeadFormToken,
  updateLeadForm,
  type LeadFormFieldInput,
} from '../lead-forms/repository.js'

const allowedTables = new Set([
  'landing_pages',
  'landing_page_versions',
  'landing_page_forms',
  'landing_page_field_mappings',
  'landing_page_change_requests',
  'landing_page_approvals',
  'landing_page_events',
])

const landingPageTableRules = createScopedTableRules(
  ['landing_pages'],
  ['landing_page_versions', 'landing_page_forms', 'landing_page_field_mappings', 'landing_page_change_requests', 'landing_page_approvals', 'landing_page_events'],
)

const portalContractQuerySchema = z.object({ contractId: z.string().uuid() })
const formParamsSchema = z.object({ id: z.string().uuid() })
const formListQuerySchema = z.object({ contractId: z.string().uuid() })
const formCreateSchema = z.object({
  landingPageId: z.string().uuid().optional(),
  contractId: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(120),
  submitLabel: z.string().trim().min(1).max(80).optional(),
  successMessage: z.string().trim().min(1).max(240).optional(),
  consentCode: z.string().trim().min(1).max(100).optional(),
  consentVersion: z.string().trim().min(1).max(50).optional(),
  privacyPolicyVersion: z.string().trim().min(1).max(50).optional(),
  allowedOrigins: z.array(z.string().trim().min(1).max(300)).max(20).optional(),
  fields: z.array(z.object({
    fieldName: z.string().trim().min(1).max(100),
    crmFieldKey: z.string().trim().min(1).max(100),
    required: z.boolean().optional(),
  })).max(30).optional(),
}).refine(input => Boolean(input.landingPageId) !== Boolean(input.contractId), {
  message: 'Provide either landingPageId or contractId',
})
const formPatchSchema = z.object({
  isActive: z.boolean().optional(),
  allowedOrigins: z.array(z.string().trim().min(1).max(300)).max(20).optional(),
})
const formFieldsSchema = z.object({
  fields: z.array(z.object({
    fieldName: z.string().trim().min(1).max(100),
    crmFieldKey: z.string().trim().min(1).max(100),
    required: z.boolean().optional(),
  })).min(2).max(50),
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

export async function registerLandingPageRoutes(app: FastifyInstance) {
  app.get('/portal/landing-pages', async (request, reply) => {
    const parsed = portalContractQuerySchema.safeParse(request.query)
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_portal_landing_page_query' })

    const organizationId = await getContractOrganizationId(app.pg, parsed.data.contractId)
    if (!organizationId) return reply.code(404).send({ error: 'contract_not_found' })
    requireMembership(request, organizationId)

    const { rows } = await app.pg.query(
      `SELECT lp.id, lp.organization_id, lp.client_id, lp.contract_id, lp.project_id, lp.campaign_id,
              lp.pipeline_id, lp.initial_stage_id, lp.name, lp.slug, lp.status, lp.preview_url,
              lp.published_url, lp.thumbnail_url, lp.primary_cta_type, lp.primary_cta_value,
              lp.visits, lp.leads, lp.pending_approvals, lp.created_at, lp.updated_at,
              COALESCE((SELECT jsonb_agg(jsonb_build_object(
                'id', v.id, 'landing_page_id', v.landing_page_id, 'version_number', v.version_number,
                'title', v.title, 'status', v.status, 'preview_url', v.preview_url,
                'internal_only', v.internal_only, 'created_at', v.created_at, 'updated_at', v.updated_at
              ) ORDER BY v.version_number DESC)
              FROM public.landing_page_versions v
              WHERE v.landing_page_id = lp.id AND v.internal_only = FALSE), '[]'::jsonb) AS landing_page_versions
              ,COALESCE((SELECT jsonb_agg(jsonb_build_object(
                'id', f.id, 'landing_page_id', f.landing_page_id, 'name', f.name,
                'submit_label', f.submit_label, 'success_message', f.success_message,
                'metadata', f.metadata, 'is_active', f.is_active,
                'allowed_origins', f.allowed_origins,
                'has_public_token', f.public_token_hash IS NOT NULL,
                'public_token_rotated_at', f.public_token_rotated_at,
                'submission_count', f.submission_count,
                'last_submission_at', f.last_submission_at,
                'created_at', f.created_at, 'updated_at', f.updated_at,
                'landing_page_field_mappings', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                  'id', m.id, 'form_id', m.form_id, 'field_name', m.field_name,
                  'crm_field_key', m.crm_field_key, 'required', m.required,
                  'created_at', m.created_at, 'updated_at', m.updated_at
                ) ORDER BY m.created_at ASC)
                FROM public.landing_page_field_mappings m
                WHERE m.form_id = f.id), '[]'::jsonb),
                'recent_submissions', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                  'id', recent.id, 'lead_id', recent.lead_id, 'name', recent.lead_name,
                  'email', recent.lead_email, 'phone', recent.lead_phone,
                  'status', recent.status, 'created_at', recent.created_at,
                  'source', recent.source, 'page_url', recent.page_url,
                  'language', recent.language, 'referrer', recent.referrer,
                  'utm_source', recent.utm_source, 'utm_medium', recent.utm_medium,
                  'utm_campaign', recent.utm_campaign, 'utm_content', recent.utm_content,
                  'utm_term', recent.utm_term, 'consent_code', recent.consent_code,
                  'consent_version', recent.consent_version,
                  'privacy_policy_version', recent.privacy_policy_version,
                  'profile', recent.profile, 'country', recent.country,
                  'fit_score', recent.fit_score, 'intent_score', recent.intent_score,
                  'crm_contact_id', recent.crm_contact_id
                ) ORDER BY recent.created_at DESC)
                FROM (
                  SELECT s.id, s.lead_id, l.name AS lead_name, l.email AS lead_email,
                         l.phone AS lead_phone, s.status, s.created_at,
                         s.source, s.page_url, s.language, s.referrer,
                         s.utm_source, s.utm_medium, s.utm_campaign, s.utm_content, s.utm_term,
                         s.consent_code, s.consent_version, s.privacy_policy_version,
                         s.profile, s.country, s.fit_score, s.intent_score, s.crm_contact_id
                  FROM public.landing_page_form_submissions s
                  LEFT JOIN public.leads l ON l.id = s.lead_id
                  WHERE s.form_id = f.id
                  ORDER BY s.created_at DESC
                  LIMIT 5
                ) recent), '[]'::jsonb)
              ) ORDER BY f.created_at DESC)
              FROM public.landing_page_forms f
              WHERE f.landing_page_id = lp.id), '[]'::jsonb) AS landing_page_forms
       FROM public.landing_pages lp
       WHERE lp.contract_id = $1 AND lp.organization_id = $2
       ORDER BY lp.updated_at DESC`,
      [parsed.data.contractId, organizationId],
    )
    return rows
  })

  app.post('/forms', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    const parsed = formCreateSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_lead_form_payload' })

    const form = await createLeadForm(app.pg, user, parsed.data as {
      landingPageId?: string
      contractId?: string
      name: string
      submitLabel?: string
      successMessage?: string
      consentCode?: string
      consentVersion?: string
      privacyPolicyVersion?: string
      allowedOrigins?: string[]
      fields?: LeadFormFieldInput[]
    }, resolvePublicBaseUrl(request, app.config.PUBLIC_APP_URL))
    return reply.code(201).send(form)
  })

  app.get('/forms', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    const parsed = formListQuerySchema.safeParse(request.query)
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_lead_form_query' })

    return listLeadFormsForContract(app.pg, user, parsed.data.contractId)
  })

  app.post('/forms/:id/rotate-token', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    const params = formParamsSchema.safeParse(request.params)
    if (!params.success) return reply.code(400).send({ error: 'invalid_lead_form_id' })

    return rotateLeadFormToken(app.pg, user, params.data.id, resolvePublicBaseUrl(request, app.config.PUBLIC_APP_URL))
  })

  app.patch('/forms/:id', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    const params = formParamsSchema.safeParse(request.params)
    const parsed = formPatchSchema.safeParse(request.body)
    if (!params.success || !parsed.success) return reply.code(400).send({ error: 'invalid_lead_form_patch' })

    return updateLeadForm(app.pg, user, params.data.id, parsed.data)
  })

  app.put('/forms/:id/fields', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    const params = formParamsSchema.safeParse(request.params)
    const parsed = formFieldsSchema.safeParse(request.body)
    if (!params.success || !parsed.success) return reply.code(400).send({ error: 'invalid_lead_form_fields' })

    return replaceLeadFormMappings(app.pg, user, params.data.id, parsed.data.fields)
  })

  app.post('/query', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    const parsed = dataQuerySchema.safeParse(request.body)
    if (!parsed.success || !allowedTables.has(parsed.data.table)) {
      return reply.code(400).send({ error: 'invalid_landing_page_query' })
    }

    return executeScopedDataQuery(app, requireAuth(request), parsed.data, landingPageTableRules)
  })
}

function resolvePublicBaseUrl(request: FastifyRequest, configuredBaseUrl?: string) {
  if (configuredBaseUrl) return configuredBaseUrl
  const forwardedProto = request.headers['x-forwarded-proto']
  const protocol = typeof forwardedProto === 'string' ? forwardedProto.split(',')[0].trim() : request.protocol
  const host = request.headers.host
  return host ? `${protocol}://${host}` : undefined
}
