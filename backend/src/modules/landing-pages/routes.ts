import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { hashSessionToken } from '../../auth/session.js'
import { getContractOrganizationId } from '../../http/contract-organization.js'
import { requireAuth, requireMembership } from '../../http/guards.js'
import { dataQuerySchema } from '../data/routes.js'
import { createScopedTableRules, executeScopedDataQuery } from '../data/scoped-query.js'

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
       FROM public.landing_pages lp
       WHERE lp.contract_id = $1 AND lp.organization_id = $2
       ORDER BY lp.updated_at DESC`,
      [parsed.data.contractId, organizationId],
    )
    return rows
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
