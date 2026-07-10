import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type pg from 'pg'
import { z } from 'zod'
import { hashSessionToken } from '../../auth/session.js'
import { requireAdminRole, requireMembership } from '../../http/guards.js'

const organizationParamsSchema = z.object({ organizationId: z.string().uuid() })

const snapshotSchema = z.object({
  organizationId: z.string().uuid(),
  scope: z.enum(['internal', 'portal']).default('internal'),
  metrics: z.record(z.string(), z.unknown()),
  periodStart: z.string().min(1),
  periodEnd: z.string().min(1),
})

const metricTables = [
  'leads',
  'campaigns',
  'landing_pages',
  'proposals',
  'conversations',
  'interactions',
  'projects',
  'crm_mroi_alerts',
] as const

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

async function readOrganizationTable(pool: pg.Pool, table: (typeof metricTables)[number], organizationId: string) {
  try {
    const { rows } = await pool.query(`SELECT * FROM public.${table} WHERE organization_id = $1`, [organizationId])
    return rows
  } catch (error) {
    const code = (error as { code?: string }).code
    if (code === '42P01' || code === '42703') return []
    throw error
  }
}

async function readAttributionRollups(pool: pg.Pool, organizationId: string) {
  try {
    const { rows } = await pool.query(
      `SELECT
         r.*,
         CASE WHEN s.id IS NULL THEN NULL ELSE to_jsonb(s) END AS lead_sources
       FROM public.lead_source_rollups r
       LEFT JOIN public.lead_sources s ON s.id = r.lead_source_id
       WHERE r.organization_id = $1
       ORDER BY r.period_end DESC`,
      [organizationId],
    )
    return rows
  } catch (error) {
    const code = (error as { code?: string }).code
    if (code === '42P01' || code === '42703') return []
    throw error
  }
}

export async function registerReportRoutes(app: FastifyInstance) {
  app.addHook('preHandler', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply
  })

  app.get('/operational-data/:organizationId', async (request, reply) => {
    const params = organizationParamsSchema.safeParse(request.params)
    if (!params.success) return reply.code(400).send({ error: 'invalid_report_organization_id' })
    requireMembership(request, params.data.organizationId)

    const organizationId = params.data.organizationId
    const [
      leads,
      campaigns,
      landingPages,
      proposals,
      conversations,
      interactions,
      projects,
      attributionAlerts,
      attributionRollups,
    ] = await Promise.all([
      readOrganizationTable(app.pg, 'leads', organizationId),
      readOrganizationTable(app.pg, 'campaigns', organizationId),
      readOrganizationTable(app.pg, 'landing_pages', organizationId),
      readOrganizationTable(app.pg, 'proposals', organizationId),
      readOrganizationTable(app.pg, 'conversations', organizationId),
      readOrganizationTable(app.pg, 'interactions', organizationId),
      readOrganizationTable(app.pg, 'projects', organizationId),
      readOrganizationTable(app.pg, 'crm_mroi_alerts', organizationId),
      readAttributionRollups(app.pg, organizationId),
    ])

    return {
      leads,
      campaigns,
      landingPages,
      proposals,
      conversations,
      interactions,
      projects,
      attributionRollups,
      attributionAlerts,
    }
  })

  app.post('/snapshots', async (request, reply) => {
    requireAdminRole(request)
    const parsed = snapshotSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_report_snapshot_payload' })

    const { rows } = await app.pg.query(
      `INSERT INTO public.report_snapshots (organization_id, scope, metrics, period_start, period_end)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        parsed.data.organizationId,
        parsed.data.scope,
        parsed.data.metrics,
        parsed.data.periodStart,
        parsed.data.periodEnd,
      ],
    )
    return reply.code(201).send(rows[0])
  })
}
