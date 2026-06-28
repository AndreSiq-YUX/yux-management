import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type pg from 'pg'
import { z } from 'zod'
import { buildClientInvitationEmail } from '../../auth/invitations.js'
import { hashSessionToken } from '../../auth/session.js'
import { sendSmtp2GoEmail } from '../../email/smtp2go.js'
import { dataQuerySchema, executeDataQuery } from '../data/routes.js'
import { ClientAccessError, provisionClientPortalAccess } from './clientAccess.js'

type SqlState = {
  values: unknown[]
  where: string[]
}

type Queryable = {
  query(sql: string, params?: unknown[]): Promise<{ rows: any[] }>
}

const idParamSchema = z.object({ id: z.string().uuid() })
const projectParamSchema = z.object({ projectId: z.string().uuid() })
const projectChildParamSchema = z.object({ projectId: z.string().uuid(), id: z.string().uuid() })
const approvalDecisionSchema = z.object({
  approvalRequestId: z.string().uuid(),
  decision: z.string().min(1),
  comment: z.string().optional(),
})

const growthAllowedTables = new Set([
  'growth_campaign_plans',
  'growth_campaign_plan_steps',
  'growth_onboarding_checklists',
  'growth_onboarding_steps',
])

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

function addValue(state: SqlState, value: unknown) {
  state.values.push(value)
  return `$${state.values.length}`
}

function addOptionalFilter(state: SqlState, column: string, value: unknown) {
  if (value === undefined || value === null || value === '') return
  state.where.push(`${column} = ${addValue(state, value)}`)
}

function toArray(value: unknown) {
  if (Array.isArray(value)) return value.filter(item => item !== undefined && item !== null && item !== '')
  if (typeof value === 'string' && value.trim()) return value.split(',').map(item => item.trim()).filter(Boolean)
  return []
}

function addArrayFilter(state: SqlState, column: string, value: unknown) {
  const values = toArray(value)
  if (values.length === 0) return
  state.where.push(`${column} = ANY(${addValue(state, values)})`)
}

function addIlikeSearch(state: SqlState, columns: string[], search: unknown) {
  if (typeof search !== 'string' || !search.trim()) return
  const pattern = `%${search.trim()}%`
  const clauses = columns.map(column => `${column} ILIKE ${addValue(state, pattern)}`)
  state.where.push(`(${clauses.join(' OR ')})`)
}

function addJsonOverlapFilter(state: SqlState, column: string, value: unknown) {
  const values = toArray(value)
  if (values.length === 0) return
  state.where.push(`${column} && ${addValue(state, values)}`)
}

function whereSql(state: SqlState) {
  return state.where.length ? `WHERE ${state.where.join(' AND ')}` : ''
}

function pagination(query: Record<string, unknown>) {
  const page = Number(query.page || 1)
  const limit = Number(query.limit || 10)
  const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1
  const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.min(Math.floor(limit), 500) : 10
  return { page: safePage, limit: safeLimit, offset: (safePage - 1) * safeLimit }
}

function clientRow(row: any) {
  return {
    id: row.id,
    userId: row.user_id || undefined,
    companyName: row.company_name,
    contactName: row.contact_name,
    email: row.email,
    phone: row.phone || undefined,
    website: row.website || undefined,
    sector: row.sector,
    size: row.size,
    address: row.address || undefined,
    leadSource: row.lead_source,
    acquisitionCost: row.acquisition_cost ?? undefined,
    lifetimeValue: row.lifetime_value ?? undefined,
    totalRevenue: row.total_revenue ?? undefined,
    averageProjectValue: row.average_project_value ?? undefined,
    projectsCount: Array.isArray(row.projects) ? row.projects.length : (row.projects_count ?? undefined),
    lastInteraction: row.last_interaction ?? undefined,
    status: row.status || 'active',
    tags: row.tags || undefined,
    preferredTechnologies: row.preferred_technologies || undefined,
    communicationPreferences: Array.isArray(row.communication_preferences)
      ? row.communication_preferences
      : (row.communication_preferences ? [row.communication_preferences] : undefined),
    notes: row.notes || undefined,
    assignedTo: row.assigned_to || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    projects: Array.isArray(row.projects)
      ? row.projects.map((project: any) => ({ id: project.id, name: project.name, status: project.status, budget: project.budget }))
      : [],
  }
}

function projectTaskRow(row: any, fallbackProjectId?: string) {
  return {
    id: row.id,
    projectId: row.project_id || fallbackProjectId || '',
    phaseId: row.phase_id || undefined,
    title: row.title,
    description: row.description || undefined,
    status: row.status || 'pending',
    priority: row.priority || 'medium',
    assignedTo: row.assigned_to || undefined,
    dueDate: row.due_date || undefined,
    completedAt: row.completed_at || undefined,
    estimatedHours: row.estimated_hours !== null && row.estimated_hours !== undefined ? Number(row.estimated_hours) : undefined,
    actualHours: row.actual_hours !== null && row.actual_hours !== undefined ? Number(row.actual_hours) : undefined,
    orderIndex: Number(row.order_index || 0),
    isClientVisible: row.is_client_visible ?? false,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function projectPhaseRow(row: any, fallbackProjectId?: string) {
  return {
    id: row.id,
    projectId: row.project_id || fallbackProjectId || '',
    name: row.name,
    description: row.description || undefined,
    status: row.status || 'planning',
    startDate: row.start_date || undefined,
    endDate: row.end_date || undefined,
    budget: row.budget !== null && row.budget !== undefined ? Number(row.budget) : undefined,
    actualCost: row.actual_cost !== null && row.actual_cost !== undefined ? Number(row.actual_cost) : undefined,
    progress: Number(row.progress || 0),
    orderIndex: Number(row.order_index || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function projectDeliverableRow(row: any) {
  return {
    id: row.id,
    projectId: row.project_id,
    phaseId: row.phase_id || undefined,
    title: row.title,
    description: row.description || undefined,
    status: row.status,
    dueDate: row.due_date || undefined,
    deliveredAt: row.delivered_at || undefined,
    externalUrl: row.external_url || undefined,
    isClientVisible: row.is_client_visible ?? false,
    createdBy: row.created_by || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function approvalDecisionRow(row: any) {
  return {
    id: row.id,
    approvalRequestId: row.approval_request_id,
    decision: row.decision,
    comment: row.comment || undefined,
    decidedBy: row.decided_by,
    createdAt: row.created_at,
  }
}

function approvalRequestRow(row: any) {
  return {
    id: row.id,
    projectId: row.project_id,
    targetType: row.target_type,
    targetId: row.target_id,
    title: row.title,
    instructions: row.instructions || undefined,
    status: row.status,
    isClientVisible: row.is_client_visible ?? true,
    requestedBy: row.requested_by || undefined,
    submittedAt: row.submitted_at,
    decidedAt: row.decided_at || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    decisions: Array.isArray(row.approval_decisions) ? row.approval_decisions.map(approvalDecisionRow) : [],
  }
}

function projectTimelineRow(row: any) {
  return {
    id: row.id,
    projectId: row.project_id,
    entryType: row.entry_type,
    title: row.title,
    body: row.body || undefined,
    metadata: row.metadata || {},
    origin: row.origin,
    isClientVisible: row.is_client_visible ?? false,
    createdBy: row.created_by || undefined,
    createdAt: row.created_at,
  }
}

function projectRow(row: any) {
  const client = row.clients ? {
    id: row.clients.id,
    companyName: row.clients.company_name,
    contactName: row.clients.contact_name,
    email: row.clients.email || undefined,
  } : undefined

  return {
    id: row.id,
    name: row.name,
    description: row.description || '',
    status: row.status || 'PLANNING',
    priority: row.priority || 'MEDIUM',
    type: row.type || 'OTHER',
    startDate: row.start_date,
    expectedEndDate: row.expected_end_date,
    actualEndDate: row.actual_end_date || undefined,
    endDate: row.expected_end_date,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    budget: Number(row.budget || 0),
    actualCost: Number(row.actual_cost || 0),
    spent: Number(row.spent || row.actual_cost || 0),
    currency: row.currency || 'BRL',
    progress: Number(row.progress || 0),
    completedTasks: Number(row.completed_tasks || 0),
    totalTasks: Number(row.total_tasks || 0),
    clientId: row.client_id,
    client,
    managerId: row.manager_id || undefined,
    teamMembers: row.team_members || [],
    isActive: row.is_active ?? row.status !== 'ARCHIVED',
    isArchived: row.is_archived ?? row.status === 'ARCHIVED',
    phases: Array.isArray(row.project_phases) ? row.project_phases.map((phase: any) => projectPhaseRow(phase, row.id)) : undefined,
    tasks: Array.isArray(row.project_tasks) ? row.project_tasks.map((task: any) => projectTaskRow(task, row.id)) : undefined,
    tags: row.tags || [],
    notes: row.notes || undefined,
  }
}

function clientPayload(input: Record<string, unknown>) {
  return {
    company_name: input.companyName,
    contact_name: input.contactName,
    email: input.email,
    phone: input.phone,
    website: input.website,
    sector: input.sector,
    size: input.size,
    lead_source: input.leadSource,
    acquisition_cost: input.acquisitionCost,
    address: input.address,
    notes: input.notes,
    tags: input.tags,
    assigned_to: input.assignedTo,
    preferred_technologies: input.preferredTechnologies,
    communication_preferences: input.communicationPreferences,
  }
}

function projectPayload(input: Record<string, unknown>, includeDefaults = false) {
  const row: Record<string, unknown> = {}
  if (input.name !== undefined) row.name = input.name
  if (input.description !== undefined) row.description = input.description
  if (input.status !== undefined) row.status = input.status
  if (input.priority !== undefined) row.priority = input.priority
  if (input.type !== undefined) row.type = input.type
  if (input.startDate !== undefined) row.start_date = input.startDate
  if (input.expectedEndDate !== undefined) row.expected_end_date = input.expectedEndDate
  if (input.actualEndDate !== undefined) row.actual_end_date = input.actualEndDate
  if (input.budget !== undefined) row.budget = input.budget
  if (input.currency !== undefined) row.currency = input.currency
  if (input.clientId !== undefined) row.client_id = input.clientId
  if (input.managerId !== undefined) row.manager_id = input.managerId
  if (input.teamMembers !== undefined) row.team_members = input.teamMembers
  if (input.tags !== undefined) row.tags = input.tags
  if (input.notes !== undefined) row.notes = input.notes
  if (input.progress !== undefined) row.progress = input.progress
  if (includeDefaults) {
    row.team_members ??= []
    row.tags ??= []
    row.progress ??= 0
  }
  row.updated_at = new Date().toISOString()
  return row
}

async function insertReturning(pool: Queryable, table: string, payload: Record<string, unknown>) {
  const entries = Object.entries(payload).filter(([, value]) => value !== undefined)
  const columns = entries.map(([column]) => column)
  const values = entries.map(([, value]) => value)
  const params = values.map((_, index) => `$${index + 1}`)
  const { rows } = await pool.query(
    `INSERT INTO public.${table} (${columns.join(', ')}) VALUES (${params.join(', ')}) RETURNING *`,
    values,
  )
  return rows[0]
}

async function updateReturning(pool: Queryable, table: string, id: string, payload: Record<string, unknown>, extraFilters: Record<string, unknown> = {}) {
  const entries = Object.entries(payload).filter(([, value]) => value !== undefined)
  if (entries.length === 0) {
    throw new Error('empty_update_payload')
  }

  const assignments = entries.map(([column], index) => `${column} = $${index + 1}`)
  const values = entries.map(([, value]) => value)
  const where = [`id = $${values.length + 1}`]
  values.push(id)

  for (const [column, value] of Object.entries(extraFilters)) {
    where.push(`${column} = $${values.length + 1}`)
    values.push(value)
  }

  const { rows } = await pool.query(
    `UPDATE public.${table} SET ${assignments.join(', ')} WHERE ${where.join(' AND ')} RETURNING *`,
    values,
  )
  return rows[0]
}

async function loadProject(pool: pg.Pool, id: string) {
  const { rows } = await pool.query(`
    SELECT
      p.*,
      CASE WHEN c.id IS NULL THEN NULL ELSE jsonb_build_object(
        'id', c.id,
        'company_name', c.company_name,
        'contact_name', c.contact_name,
        'email', c.email,
        'phone', c.phone,
        'website', c.website
      ) END AS clients,
      COALESCE((
        SELECT jsonb_agg(to_jsonb(phase) ORDER BY phase.order_index)
        FROM public.project_phases phase
        WHERE phase.project_id = p.id
      ), '[]'::jsonb) AS project_phases,
      COALESCE((
        SELECT jsonb_agg(to_jsonb(task) ORDER BY task.order_index)
        FROM public.project_tasks task
        WHERE task.project_id = p.id
      ), '[]'::jsonb) AS project_tasks
    FROM public.projects p
    LEFT JOIN public.clients c ON c.id = p.client_id
    WHERE p.id = $1
  `, [id])
  return rows[0]
}

export async function registerWorkspaceRoutes(app: FastifyInstance) {
  app.addHook('preHandler', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply
  })

  app.post('/growth-query', async (request, reply) => {
    const parsed = dataQuerySchema.safeParse(request.body)
    if (!parsed.success || !growthAllowedTables.has(parsed.data.table)) {
      return reply.code(400).send({ error: 'invalid_growth_workspace_query' })
    }

    return executeDataQuery(app, parsed.data)
  })

  app.get('/dashboard/stats', async () => {
    const [clients, projects, leads, campaigns, activeProjects, qualifiedLeads, recentProjects, campaignRows] = await Promise.all([
      app.pg.query('SELECT COUNT(*)::int AS count FROM public.clients'),
      app.pg.query('SELECT COUNT(*)::int AS count FROM public.projects'),
      app.pg.query('SELECT COUNT(*)::int AS count FROM public.leads'),
      app.pg.query('SELECT COUNT(*)::int AS count FROM public.campaigns'),
      app.pg.query("SELECT COUNT(*)::int AS count FROM public.projects WHERE status = 'ACTIVE'"),
      app.pg.query("SELECT COUNT(*)::int AS count FROM public.leads WHERE stage = ANY($1)", [['QUALIFIED', 'PROPOSAL', 'NEGOTIATION']]),
      app.pg.query(`
        SELECT p.id, p.name, p.status, c.company_name
        FROM public.projects p
        LEFT JOIN public.clients c ON c.id = p.client_id
        ORDER BY p.created_at DESC
        LIMIT 5
      `),
      app.pg.query('SELECT budget, spent, impressions, clicks, conversions, roas FROM public.campaigns'),
    ])

    const totalBudget = campaignRows.rows.reduce((sum, row) => sum + Number(row.budget || 0), 0)
    const totalSpent = campaignRows.rows.reduce((sum, row) => sum + Number(row.spent || 0), 0)
    const totalImpressions = campaignRows.rows.reduce((sum, row) => sum + Number(row.impressions || 0), 0)
    const totalClicks = campaignRows.rows.reduce((sum, row) => sum + Number(row.clicks || 0), 0)
    const totalConversions = campaignRows.rows.reduce((sum, row) => sum + Number(row.conversions || 0), 0)
    const totalRoas = campaignRows.rows.reduce((sum, row) => sum + Number(row.roas || 0), 0)
    const budgetUtilization = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0
    const ctr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0
    const avgROAS = campaignRows.rows.length > 0 ? totalRoas / campaignRows.rows.length : 0
    const recentProjectRows = recentProjects.rows.map(row => ({
      id: row.id,
      name: row.name,
      client: row.company_name || '',
      status: row.status,
      progress: 0,
    }))

    return {
      overview: {
        totalClients: clients.rows[0]?.count || 0,
        totalProjects: projects.rows[0]?.count || 0,
        totalLeads: leads.rows[0]?.count || 0,
        totalCampaigns: campaigns.rows[0]?.count || 0,
        activeProjects: activeProjects.rows[0]?.count || 0,
        qualifiedLeads: qualifiedLeads.rows[0]?.count || 0,
      },
      financial: {
        totalBudget,
        totalCampaignSpent: totalSpent,
        budgetUtilization,
      },
      marketing: {
        totalImpressions,
        totalClicks,
        ctr,
        avgROAS,
      },
      campaigns: { totalBudget, totalSpent, totalConversions },
      recentActivity: {
        projects: recentProjectRows,
        leads: [],
        tasks: [],
      },
      recent: {
        projects: recentProjectRows,
      },
    }
  })

  app.get('/users', async (request) => {
    const query = request.query as Record<string, unknown>
    const limit = Math.min(Number(query.limit || 100), 500)
    const state: SqlState = { values: [], where: [] }
    addIlikeSearch(state, ['name', 'email'], query.search)
    state.values.push(limit)
    const { rows } = await app.pg.query(
      `SELECT * FROM public.users ${whereSql(state)} ORDER BY name LIMIT $${state.values.length}`,
      state.values,
    )
    return { success: true, data: rows }
  })

  app.get('/clients', async (request) => {
    const query = request.query as Record<string, unknown>
    const { page, limit, offset } = pagination(query)
    const state: SqlState = { values: [], where: [] }
    addIlikeSearch(state, ['c.company_name', 'c.contact_name', 'c.email'], query.search)
    addOptionalFilter(state, 'c.sector', query.sector)
    addArrayFilter(state, 'c.size', query.sizes)
    addArrayFilter(state, 'c.lead_source', query.leadSources)
    if (query.minValue !== undefined) state.where.push(`c.lifetime_value >= ${addValue(state, Number(query.minValue))}`)
    if (query.maxValue !== undefined) state.where.push(`c.lifetime_value <= ${addValue(state, Number(query.maxValue))}`)
    if (query.startDate) state.where.push(`c.created_at >= ${addValue(state, new Date(String(query.startDate)).toISOString())}`)
    if (query.endDate) {
      const end = new Date(String(query.endDate))
      end.setHours(23, 59, 59, 999)
      state.where.push(`c.created_at <= ${addValue(state, end.toISOString())}`)
    }

    const count = await app.pg.query(`SELECT COUNT(*)::int AS count FROM public.clients c ${whereSql(state)}`, state.values)
    const values = [...state.values, limit, offset]
    const { rows } = await app.pg.query(`
      SELECT c.*, COALESCE((
        SELECT jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'status', p.status, 'budget', p.budget))
        FROM public.projects p
        WHERE p.client_id = c.id
      ), '[]'::jsonb) AS projects
      FROM public.clients c
      ${whereSql(state)}
      ORDER BY c.created_at DESC
      LIMIT $${state.values.length + 1} OFFSET $${state.values.length + 2}
    `, values)
    const total = count.rows[0]?.count || 0
    const clients = rows.map(clientRow)

    return {
      success: true,
      data: clients,
      clients,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1,
      },
    }
  })

  app.get('/clients/stats', async () => {
    const [total, active, completed, newThisMonth] = await Promise.all([
      app.pg.query('SELECT COUNT(*)::int AS count FROM public.clients'),
      app.pg.query("SELECT COUNT(DISTINCT c.id)::int AS count FROM public.clients c JOIN public.projects p ON p.client_id = c.id WHERE p.status = 'ACTIVE'"),
      app.pg.query("SELECT COALESCE(SUM(budget), 0)::numeric AS total FROM public.projects WHERE status = 'COMPLETED'"),
      app.pg.query("SELECT COUNT(*)::int AS count FROM public.clients WHERE created_at >= date_trunc('month', now())"),
    ])
    const totalClients = total.rows[0]?.count || 0
    const totalRevenue = Number(completed.rows[0]?.total || 0)
    return {
      success: true,
      data: {
        totalClients,
        activeClients: active.rows[0]?.count || 0,
        totalRevenue,
        averageValue: totalClients ? totalRevenue / totalClients : 0,
        newClientsThisMonth: newThisMonth.rows[0]?.count || 0,
        conversionRate: 75,
      },
    }
  })

  app.get('/clients/suggestions', async (request) => {
    const query = request.query as Record<string, unknown>
    const limit = Math.min(Number(query.limit || 500), 1000)
    const { rows } = await app.pg.query('SELECT tags, preferred_technologies FROM public.clients LIMIT $1', [limit])
    const tagSet = new Set<string>()
    const techSet = new Set<string>()
    for (const row of rows) {
      if (Array.isArray(row.tags)) row.tags.forEach((tag: unknown) => String(tag).trim() && tagSet.add(String(tag).trim()))
      if (Array.isArray(row.preferred_technologies)) row.preferred_technologies.forEach((tech: unknown) => String(tech).trim() && techSet.add(String(tech).trim()))
    }
    return {
      success: true,
      data: {
        tags: Array.from(tagSet).sort((a, b) => a.localeCompare(b)),
        technologies: Array.from(techSet).sort((a, b) => a.localeCompare(b)),
      },
    }
  })

  app.get('/clients/:id', async (request, reply) => {
    const params = idParamSchema.safeParse(request.params)
    if (!params.success) return reply.code(400).send({ error: 'invalid_client_id' })
    const { rows } = await app.pg.query(`
      SELECT c.*, COALESCE((
        SELECT jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'status', p.status, 'budget', p.budget))
        FROM public.projects p
        WHERE p.client_id = c.id
      ), '[]'::jsonb) AS projects
      FROM public.clients c
      WHERE c.id = $1
    `, [params.data.id])
    if (!rows[0]) return reply.code(404).send({ error: 'client_not_found' })
    const client = clientRow(rows[0])
    return { success: true, data: client, client }
  })

  app.post('/clients', async (request, reply) => {
    const db = await app.pg.connect()
    let row: any
    let access: Awaited<ReturnType<typeof provisionClientPortalAccess>>

    try {
      await db.query('BEGIN')
      row = await insertReturning(db, 'clients', clientPayload(request.body as Record<string, unknown>))
      access = await provisionClientPortalAccess(db, app.config, row)
      await db.query('COMMIT')
    } catch (error) {
      await db.query('ROLLBACK')
      if (error instanceof ClientAccessError) {
        return reply.code(error.statusCode).send({ success: false, error: error.message })
      }
      throw error
    } finally {
      db.release()
    }

    const invitationEmail = buildClientInvitationEmail({
      contactName: row.contact_name,
      companyName: row.company_name,
      inviteUrl: access.invitationUrl,
    })
    const emailResult = await sendSmtp2GoEmail({
      apiKey: app.config.SMTP2GO_API_KEY,
      senderEmail: app.config.SMTP2GO_SENDER_EMAIL,
      senderName: app.config.SMTP2GO_SENDER_NAME,
      to: row.email,
      subject: invitationEmail.subject,
      textBody: invitationEmail.text,
      htmlBody: invitationEmail.html,
      customHeaders: [{ header: 'X-YUX-Invitation-ID', value: access.invitationTokenId }],
    })

    const client = clientRow({ ...row, user_id: access.userId, projects: [] })
    return {
      success: true,
      data: client,
      client,
      invitation: {
        userId: access.userId,
        organizationId: access.organizationId,
        inviteUrl: access.invitationUrl,
        emailSent: emailResult.sent,
        emailProviderMessageId: emailResult.sent ? emailResult.providerMessageId : undefined,
        emailError: emailResult.sent ? undefined : emailResult.reason,
      },
    }
  })

  app.patch('/clients/:id', async (request, reply) => {
    const params = idParamSchema.safeParse(request.params)
    if (!params.success) return reply.code(400).send({ error: 'invalid_client_id' })
    const row = await updateReturning(app.pg, 'clients', params.data.id, clientPayload(request.body as Record<string, unknown>))
    const client = clientRow({ ...row, projects: [] })
    return { success: true, data: client, client }
  })

  app.delete('/clients/:id', async (request, reply) => {
    const params = idParamSchema.safeParse(request.params)
    if (!params.success) return reply.code(400).send({ error: 'invalid_client_id' })
    await app.pg.query('DELETE FROM public.clients WHERE id = $1', [params.data.id])
    return { success: true }
  })

  app.get('/projects', async (request) => {
    const query = request.query as Record<string, unknown>
    const { page, limit, offset } = pagination(query)
    const state: SqlState = { values: [], where: [] }
    addIlikeSearch(state, ['p.name', 'p.description'], query.search)
    addOptionalFilter(state, 'p.status', query.status)
    addOptionalFilter(state, 'p.priority', query.priority)
    addOptionalFilter(state, 'p.client_id', query.clientId)
    addOptionalFilter(state, 'p.manager_id', query.managerId)
    if (query.startDate) state.where.push(`p.start_date >= ${addValue(state, query.startDate)}`)
    if (query.endDate) state.where.push(`p.expected_end_date <= ${addValue(state, query.endDate)}`)
    if (query.budgetMin !== undefined) state.where.push(`p.budget >= ${addValue(state, Number(query.budgetMin))}`)
    if (query.budgetMax !== undefined) state.where.push(`p.budget <= ${addValue(state, Number(query.budgetMax))}`)
    addJsonOverlapFilter(state, 'p.tags', query.tags)
    const count = await app.pg.query(`SELECT COUNT(*)::int AS count FROM public.projects p ${whereSql(state)}`, state.values)
    const values = [...state.values, limit, offset]
    const { rows } = await app.pg.query(`
      SELECT p.*, CASE WHEN c.id IS NULL THEN NULL ELSE jsonb_build_object(
        'id', c.id,
        'company_name', c.company_name,
        'contact_name', c.contact_name,
        'email', c.email
      ) END AS clients
      FROM public.projects p
      LEFT JOIN public.clients c ON c.id = p.client_id
      ${whereSql(state)}
      ORDER BY p.created_at DESC
      LIMIT $${state.values.length + 1} OFFSET $${state.values.length + 2}
    `, values)
    const total = count.rows[0]?.count || 0
    const projects = rows.map(projectRow)
    return { success: true, data: projects, projects, total, page, limit, totalPages: Math.ceil(total / limit) }
  })

  app.post('/projects', async (request) => {
    const row = await insertReturning(app.pg, 'projects', projectPayload(request.body as Record<string, unknown>, true))
    const project = projectRow(await loadProject(app.pg, row.id))
    return { success: true, data: project, project }
  })

  app.get('/projects/stats', async () => {
    const { rows } = await app.pg.query('SELECT status, priority, budget, progress FROM public.projects')
    const stats = {
      total: rows.length,
      byStatus: {} as Record<string, number>,
      byPriority: {} as Record<string, number>,
      totalBudget: 0,
      averageProgress: 0,
    }
    for (const row of rows) {
      stats.byStatus[row.status] = (stats.byStatus[row.status] || 0) + 1
      stats.byPriority[row.priority] = (stats.byPriority[row.priority] || 0) + 1
      stats.totalBudget += Number(row.budget || 0)
      stats.averageProgress += Number(row.progress || 0)
    }
    stats.averageProgress = rows.length ? stats.averageProgress / rows.length : 0
    return { success: true, data: stats, stats }
  })

  app.get('/projects/client/:id', async (request, reply) => {
    const params = idParamSchema.safeParse(request.params)
    if (!params.success) return reply.code(400).send({ error: 'invalid_client_id' })
    const query = request.query as Record<string, unknown>
    const state: SqlState = { values: [params.data.id], where: ['p.client_id = $1'] }
    addOptionalFilter(state, 'p.status', query.status)
    if (!query.includeArchived) state.where.push("p.status <> 'ARCHIVED'")
    const { rows } = await app.pg.query(`
      SELECT p.*, jsonb_build_object('id', c.id, 'company_name', c.company_name, 'contact_name', c.contact_name, 'email', c.email) AS clients
      FROM public.projects p
      LEFT JOIN public.clients c ON c.id = p.client_id
      ${whereSql(state)}
      ORDER BY p.created_at DESC
    `, state.values)
    const projects = rows.map(projectRow)
    return { success: true, data: projects, projects }
  })

  app.get('/projects/:id', async (request, reply) => {
    const params = idParamSchema.safeParse(request.params)
    if (!params.success) return reply.code(400).send({ error: 'invalid_project_id' })
    const row = await loadProject(app.pg, params.data.id)
    if (!row) return reply.code(404).send({ error: 'project_not_found' })
    const project = projectRow(row)
    return { success: true, data: project, project }
  })

  app.patch('/projects/:id', async (request, reply) => {
    const params = idParamSchema.safeParse(request.params)
    if (!params.success) return reply.code(400).send({ error: 'invalid_project_id' })
    const row = await updateReturning(app.pg, 'projects', params.data.id, projectPayload(request.body as Record<string, unknown>))
    const project = projectRow(await loadProject(app.pg, row.id))
    return { success: true, data: project, project }
  })

  app.delete('/projects/:id', async (request, reply) => {
    const params = idParamSchema.safeParse(request.params)
    if (!params.success) return reply.code(400).send({ error: 'invalid_project_id' })
    await app.pg.query('DELETE FROM public.projects WHERE id = $1', [params.data.id])
    return { success: true }
  })

  app.post('/projects/:id/archive', async (request, reply) => {
    const params = idParamSchema.safeParse(request.params)
    if (!params.success) return reply.code(400).send({ error: 'invalid_project_id' })
    const row = await updateReturning(app.pg, 'projects', params.data.id, { status: 'ARCHIVED', updated_at: new Date().toISOString() })
    const project = projectRow(row)
    return { success: true, data: project, project }
  })

  app.post('/projects/:id/unarchive', async (request, reply) => {
    const params = idParamSchema.safeParse(request.params)
    if (!params.success) return reply.code(400).send({ error: 'invalid_project_id' })
    const row = await updateReturning(app.pg, 'projects', params.data.id, { status: 'ACTIVE', updated_at: new Date().toISOString() })
    const project = projectRow(row)
    return { success: true, data: project, project }
  })

  app.post('/projects/:id/duplicate', async (request, reply) => {
    const params = idParamSchema.safeParse(request.params)
    if (!params.success) return reply.code(400).send({ error: 'invalid_project_id' })
    const { rows } = await app.pg.query('SELECT * FROM public.projects WHERE id = $1', [params.data.id])
    const original = rows[0]
    if (!original) return reply.code(404).send({ error: 'project_not_found' })
    const input = request.body as Record<string, unknown> | undefined
    const startDate = typeof input?.startDate === 'string' ? input.startDate : new Date().toISOString().split('T')[0]
    const duration = original.expected_end_date && original.start_date
      ? new Date(original.expected_end_date).getTime() - new Date(original.start_date).getTime()
      : 0
    const duplicate = {
      ...original,
      id: undefined,
      name: input?.name || `${original.name} (Copia)`,
      client_id: input?.clientId || original.client_id,
      start_date: startDate,
      expected_end_date: duration > 0 ? new Date(new Date(startDate).getTime() + duration).toISOString().split('T')[0] : original.expected_end_date,
      actual_end_date: null,
      progress: 0,
      status: 'PLANNING',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    delete duplicate.id
    const row = await insertReturning(app.pg, 'projects', duplicate)
    const project = projectRow(row)
    return { success: true, data: project, project }
  })

  app.get('/projects/:projectId/tasks', async (request, reply) => {
    const params = projectParamSchema.safeParse(request.params)
    if (!params.success) return reply.code(400).send({ error: 'invalid_project_id' })
    const { rows } = await app.pg.query('SELECT * FROM public.project_tasks WHERE project_id = $1 ORDER BY order_index', [params.data.projectId])
    const tasks = rows.map(row => projectTaskRow(row, params.data.projectId))
    return { success: true, data: tasks, tasks }
  })

  app.post('/projects/:projectId/tasks', async (request, reply) => {
    const params = projectParamSchema.safeParse(request.params)
    if (!params.success) return reply.code(400).send({ error: 'invalid_project_id' })
    const input = request.body as Record<string, unknown>
    const row = await insertReturning(app.pg, 'project_tasks', {
      project_id: params.data.projectId,
      title: input.title,
      description: input.description,
      status: input.status,
      priority: input.priority,
      assigned_to: input.assignedTo,
      due_date: input.dueDate,
      estimated_hours: input.estimatedHours,
      phase_id: input.phaseId,
      order_index: 0,
      updated_at: new Date().toISOString(),
    })
    const task = projectTaskRow(row, params.data.projectId)
    return { success: true, data: task, task }
  })

  app.patch('/projects/:projectId/tasks/:id', async (request, reply) => {
    const params = projectChildParamSchema.safeParse(request.params)
    if (!params.success) return reply.code(400).send({ error: 'invalid_task_id' })
    const input = request.body as Record<string, unknown>
    const row = await updateReturning(app.pg, 'project_tasks', params.data.id, {
      title: input.title,
      description: input.description,
      status: input.status,
      priority: input.priority,
      assigned_to: input.assignedTo,
      due_date: input.dueDate,
      estimated_hours: input.estimatedHours,
      actual_hours: input.actualHours,
      phase_id: input.phaseId,
      is_client_visible: input.isClientVisible,
      updated_at: new Date().toISOString(),
    }, { project_id: params.data.projectId })
    const task = projectTaskRow(row, params.data.projectId)
    return { success: true, data: task, task }
  })

  app.delete('/projects/:projectId/tasks/:id', async (request, reply) => {
    const params = projectChildParamSchema.safeParse(request.params)
    if (!params.success) return reply.code(400).send({ error: 'invalid_task_id' })
    await app.pg.query('DELETE FROM public.project_tasks WHERE id = $1 AND project_id = $2', [params.data.id, params.data.projectId])
    return { success: true }
  })

  app.get('/projects/:projectId/phases', async (request, reply) => {
    const params = projectParamSchema.safeParse(request.params)
    if (!params.success) return reply.code(400).send({ error: 'invalid_project_id' })
    const { rows } = await app.pg.query('SELECT * FROM public.project_phases WHERE project_id = $1 ORDER BY order_index', [params.data.projectId])
    const phases = rows.map(row => projectPhaseRow(row, params.data.projectId))
    return { success: true, data: phases, phases }
  })

  app.post('/projects/:projectId/phases', async (request, reply) => {
    const params = projectParamSchema.safeParse(request.params)
    if (!params.success) return reply.code(400).send({ error: 'invalid_project_id' })
    const input = request.body as Record<string, unknown>
    const row = await insertReturning(app.pg, 'project_phases', {
      project_id: params.data.projectId,
      name: input.name,
      description: input.description,
      start_date: input.startDate,
      end_date: input.endDate,
      budget: input.budget,
      order_index: input.orderIndex,
      status: input.status || 'planning',
      progress: 0,
      updated_at: new Date().toISOString(),
    })
    const phase = projectPhaseRow(row, params.data.projectId)
    return { success: true, data: phase, phase }
  })

  app.patch('/projects/:projectId/phases/:id', async (request, reply) => {
    const params = projectChildParamSchema.safeParse(request.params)
    if (!params.success) return reply.code(400).send({ error: 'invalid_phase_id' })
    const input = request.body as Record<string, unknown>
    const row = await updateReturning(app.pg, 'project_phases', params.data.id, {
      name: input.name,
      description: input.description,
      status: input.status,
      start_date: input.startDate,
      end_date: input.endDate,
      progress: input.progress,
      updated_at: new Date().toISOString(),
    }, { project_id: params.data.projectId })
    const phase = projectPhaseRow(row, params.data.projectId)
    return { success: true, data: phase, phase }
  })

  app.delete('/projects/:projectId/phases/:id', async (request, reply) => {
    const params = projectChildParamSchema.safeParse(request.params)
    if (!params.success) return reply.code(400).send({ error: 'invalid_phase_id' })
    await app.pg.query('DELETE FROM public.project_phases WHERE id = $1 AND project_id = $2', [params.data.id, params.data.projectId])
    return { success: true }
  })

  app.get('/projects/:projectId/deliverables', async (request, reply) => {
    const params = projectParamSchema.safeParse(request.params)
    if (!params.success) return reply.code(400).send({ error: 'invalid_project_id' })
    const { rows } = await app.pg.query('SELECT * FROM public.project_deliverables WHERE project_id = $1 ORDER BY created_at DESC', [params.data.projectId])
    const deliverables = rows.map(projectDeliverableRow)
    return { success: true, data: deliverables, deliverables }
  })

  app.post('/projects/:projectId/deliverables', async (request, reply) => {
    const params = projectParamSchema.safeParse(request.params)
    if (!params.success) return reply.code(400).send({ error: 'invalid_project_id' })
    const input = request.body as Record<string, unknown>
    const row = await insertReturning(app.pg, 'project_deliverables', {
      project_id: params.data.projectId,
      phase_id: input.phaseId || null,
      title: input.title,
      description: input.description || null,
      due_date: input.dueDate || null,
      external_url: input.externalUrl || null,
      is_client_visible: input.isClientVisible,
    })
    return { success: true, data: projectDeliverableRow(row) }
  })

  app.patch('/projects/:projectId/deliverables/:id', async (request, reply) => {
    const params = projectChildParamSchema.safeParse(request.params)
    if (!params.success) return reply.code(400).send({ error: 'invalid_deliverable_id' })
    const input = request.body as Record<string, unknown>
    const row = await updateReturning(app.pg, 'project_deliverables', params.data.id, {
      title: input.title,
      description: input.description || null,
      phase_id: input.phaseId || null,
      due_date: input.dueDate || null,
      external_url: input.externalUrl || null,
      status: input.status,
      is_client_visible: input.isClientVisible,
    }, { project_id: params.data.projectId })
    return { success: true, data: projectDeliverableRow(row) }
  })

  app.get('/projects/:projectId/approvals', async (request, reply) => {
    const params = projectParamSchema.safeParse(request.params)
    if (!params.success) return reply.code(400).send({ error: 'invalid_project_id' })
    const { rows } = await app.pg.query(`
      SELECT ar.*, COALESCE((
        SELECT jsonb_agg(to_jsonb(ad) ORDER BY ad.created_at)
        FROM public.approval_decisions ad
        WHERE ad.approval_request_id = ar.id
      ), '[]'::jsonb) AS approval_decisions
      FROM public.approval_requests ar
      WHERE ar.project_id = $1
      ORDER BY ar.submitted_at DESC
    `, [params.data.projectId])
    const approvals = rows.map(approvalRequestRow)
    return { success: true, data: approvals, approvals }
  })

  app.post('/projects/:projectId/approvals', async (request, reply) => {
    const params = projectParamSchema.safeParse(request.params)
    if (!params.success) return reply.code(400).send({ error: 'invalid_project_id' })
    const input = request.body as Record<string, unknown>
    const row = await insertReturning(app.pg, 'approval_requests', {
      project_id: params.data.projectId,
      target_type: input.targetType,
      target_id: input.targetId,
      title: input.title,
      instructions: input.instructions || null,
      is_client_visible: input.isClientVisible ?? true,
    })
    return { success: true, data: approvalRequestRow({ ...row, approval_decisions: [] }) }
  })

  app.post('/approval-decisions', async (request, reply) => {
    const parsed = approvalDecisionSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_approval_decision' })
    const row = await insertReturning(app.pg, 'approval_decisions', {
      approval_request_id: parsed.data.approvalRequestId,
      decision: parsed.data.decision,
      comment: parsed.data.comment?.trim() || null,
    })
    return { success: true, data: approvalDecisionRow(row) }
  })

  app.get('/projects/:projectId/timeline', async (request, reply) => {
    const params = projectParamSchema.safeParse(request.params)
    if (!params.success) return reply.code(400).send({ error: 'invalid_project_id' })
    const { rows } = await app.pg.query('SELECT * FROM public.project_timeline_entries WHERE project_id = $1 ORDER BY created_at DESC', [params.data.projectId])
    const entries = rows.map(projectTimelineRow)
    return { success: true, data: entries, entries }
  })

  app.post('/projects/:projectId/timeline', async (request, reply) => {
    const params = projectParamSchema.safeParse(request.params)
    if (!params.success) return reply.code(400).send({ error: 'invalid_project_id' })
    const input = request.body as Record<string, unknown>
    const row = await insertReturning(app.pg, 'project_timeline_entries', {
      project_id: params.data.projectId,
      title: input.title,
      body: input.body || null,
      is_client_visible: input.isClientVisible,
    })
    return { success: true, data: projectTimelineRow(row) }
  })
}
