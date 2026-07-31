import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type pg from 'pg'
import { z } from 'zod'
import { hashSessionToken } from '../../auth/session.js'
import { requireAdminRole, requireInternalRole, requireMembership } from '../../http/guards.js'

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

async function readPortalRows(pool: pg.Pool, organizationId: string, sql: string) {
  try {
    return (await pool.query(sql, [organizationId])).rows
  } catch (error) {
    const code = (error as { code?: string }).code
    if (code === '42P01' || code === '42703') return []
    throw error
  }
}

function ratio(entered: number, advanced: number) {
  return entered <= 0 ? 0 : Math.round((advanced / entered) * 1000) / 10
}

export async function registerReportRoutes(app: FastifyInstance) {
  app.addHook('preHandler', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply
  })

  app.get('/operational-data/:organizationId', async (request, reply) => {
    const params = organizationParamsSchema.safeParse(request.params)
    if (!params.success) return reply.code(400).send({ error: 'invalid_report_organization_id' })
    // Raw table dump (leads with PII, full campaign data); clients use /portal/operational.
    requireInternalRole(request)

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

  app.get('/portal/operational/:organizationId', async (request, reply) => {
    const params = organizationParamsSchema.safeParse(request.params)
    if (!params.success) return reply.code(400).send({ error: 'invalid_report_organization_id' })
    requireMembership(request, params.data.organizationId)
    const organizationId = params.data.organizationId

    const [leads, campaigns, landingPages, proposals, conversations, projects] = await Promise.all([
      readPortalRows(app.pg, organizationId, `SELECT source, stage, status, last_activity_at FROM public.leads WHERE organization_id = $1`),
      readPortalRows(app.pg, organizationId, `SELECT id, name, spent, impressions, clicks, conversions, leads, attributed_revenue, cpl, mroi, provider_connection_id FROM public.campaigns WHERE organization_id = $1`),
      readPortalRows(app.pg, organizationId, `SELECT id, name, visits, leads FROM public.landing_pages WHERE organization_id = $1`),
      readPortalRows(app.pg, organizationId, `SELECT status FROM public.proposals WHERE organization_id = $1`),
      readPortalRows(app.pg, organizationId, `SELECT first_response_minutes FROM public.conversations WHERE organization_id = $1`),
      readPortalRows(app.pg, organizationId, `SELECT status FROM public.projects WHERE organization_id = $1`),
    ])

    const leadsBySource = Object.entries(leads.reduce<Record<string, number>>((acc, lead) => {
      const source = String(lead.source || 'manual')
      acc[source] = (acc[source] || 0) + 1
      return acc
    }, {})).map(([source, count]) => ({ source, leads: count }))
    const stageCounts = leads.reduce<Record<string, number>>((acc, lead) => {
      const stage = String(lead.stage || lead.status || 'open')
      acc[stage] = (acc[stage] || 0) + 1
      return acc
    }, {})
    const stageConversions = Object.entries(stageCounts).map(([stage, entered], index, all) => ({
      stage,
      entered,
      advanced: all.slice(index + 1).reduce((sum, [, count]) => sum + count, 0),
      conversionRate: ratio(entered, all.slice(index + 1).reduce((sum, [, count]) => sum + count, 0)),
    }))
    const campaignMetrics = campaigns.map(campaign => {
      const spend = Number(campaign.spent || 0)
      const campaignLeads = Number(campaign.leads || campaign.conversions || 0)
      const revenue = Number(campaign.attributed_revenue || 0)
      return {
        campaignId: campaign.id,
        name: campaign.name,
        spend,
        impressions: Number(campaign.impressions || 0),
        clicks: Number(campaign.clicks || 0),
        leads: campaignLeads,
        cpl: campaignLeads ? Math.round((spend / campaignLeads) * 100) / 100 : 0,
        opportunities: 0,
        proposals: 0,
        clients: 0,
        revenue,
        mroi: spend ? Math.round(((revenue - spend) / spend) * 10) / 10 : 0,
        syncStatus: campaign.provider_connection_id ? 'stale' : 'not_configured',
      }
    })
    const landingPageMetrics = landingPages.map(page => ({
      landingPageId: page.id,
      name: page.name,
      visits: Number(page.visits || 0),
      leads: Number(page.leads || 0),
      conversionRate: ratio(Number(page.visits || 0), Number(page.leads || 0)),
    }))
    const sent = proposals.filter(proposal => ['sent', 'approved', 'signed', 'converted'].includes(String(proposal.status))).length
    const approved = proposals.filter(proposal => ['approved', 'signed', 'converted'].includes(String(proposal.status))).length
    const responseTimes = conversations.map(row => Number(row.first_response_minutes || 0)).filter(Boolean)

    return {
      organizationId,
      generatedAt: new Date().toISOString(),
      leadsBySource,
      stageConversions,
      responseTimeHours: responseTimes.length ? Math.round((responseTimes.reduce((sum, value) => sum + value, 0) / responseTimes.length / 60) * 10) / 10 : 0,
      stalledOpportunities: leads.filter(lead => lead.status === 'open' && lead.last_activity_at && Date.now() - new Date(String(lead.last_activity_at)).getTime() > 7 * 24 * 60 * 60 * 1000).length,
      campaignMetrics,
      landingPageMetrics,
      proposalMetrics: { sent, approved, approvalRate: ratio(sent, approved) },
      projectDelivery: [{ label: 'Projetos ativos', value: projects.filter(project => !['completed', 'cancelled'].includes(String(project.status))).length }],
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
