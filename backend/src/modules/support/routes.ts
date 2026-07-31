import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type pg from 'pg'
import { z } from 'zod'
import { hashSessionToken } from '../../auth/session.js'
import { getContractOrganizationId } from '../../http/contract-organization.js'
import { requireInternalRole, requireMembership, requireOrganizationScope } from '../../http/guards.js'

const optionalUuid = z.string().uuid().optional()
const ticketParamsSchema = z.object({ ticketId: z.string().uuid() })
const portalContractQuerySchema = z.object({ contractId: z.string().uuid() })

const ticketQuerySchema = z.object({
  organizationId: optionalUuid,
  clientId: optionalUuid,
  contractId: optionalUuid,
  projectId: optionalUuid,
  status: z.string().optional(),
  priority: z.string().optional(),
  category: z.string().optional(),
})

const createTicketSchema = z.object({
  organizationId: z.string().uuid(),
  clientId: z.string().uuid(),
  contractId: z.string().uuid(),
  projectId: optionalUuid,
  subject: z.string().min(1),
  category: z.string().min(1),
  priority: z.string().min(1),
  slaDueAt: z.string().nullable().optional(),
  internalNotes: z.string().nullable().optional(),
})

const createMessageSchema = z.object({
  ticketId: z.string().uuid(),
  authorType: z.enum(['client', 'internal', 'system']),
  authorName: z.string().nullable().optional(),
  body: z.string().min(1),
  isInternal: z.boolean().optional(),
})

const updateTicketSchema = z.object({
  status: z.string().optional(),
  priority: z.string().optional(),
  category: z.string().optional(),
  slaDueAt: z.string().nullable().optional(),
  internalNotes: z.string().nullable().optional(),
})

type SqlState = { values: unknown[]; where: string[] }

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

function addFilter(state: SqlState, column: string, value: unknown) {
  if (value === undefined || value === null || value === '') return
  state.values.push(value)
  state.where.push(`${column} = $${state.values.length}`)
}

function whereSql(state: SqlState) {
  return state.where.length ? `WHERE ${state.where.join(' AND ')}` : ''
}

async function loadTicket(pool: pg.Pool, ticketId: string) {
  const { rows } = await pool.query(ticketSql('WHERE t.id = $1'), [ticketId])
  return rows[0]
}

async function getTicketOrganizationId(pool: pg.Pool, ticketId: string) {
  const { rows } = await pool.query<{ organization_id: string }>(
    'SELECT organization_id FROM public.support_tickets WHERE id = $1 LIMIT 1',
    [ticketId],
  )
  return rows[0]?.organization_id ?? null
}

function isInternalRole(role: string) {
  return role === 'yux_admin' || role === 'yux_operator'
}

function ticketSql(where = '') {
  return `
    SELECT
      t.*,
      CASE WHEN c.id IS NULL THEN NULL ELSE jsonb_build_object('company_name', c.company_name) END AS clients,
      CASE WHEN co.id IS NULL THEN NULL ELSE jsonb_build_object('name', co.name) END AS contracts,
      CASE WHEN p.id IS NULL THEN NULL ELSE jsonb_build_object('name', p.name) END AS projects,
      COALESCE((
        SELECT jsonb_agg(to_jsonb(m) ORDER BY m.created_at ASC)
        FROM public.support_messages m
        WHERE m.ticket_id = t.id
      ), '[]'::jsonb) AS support_messages
    FROM public.support_tickets t
    LEFT JOIN public.clients c ON c.id = t.client_id
    LEFT JOIN public.contracts co ON co.id = t.contract_id
    LEFT JOIN public.projects p ON p.id = t.project_id
    ${where}
  `
}

export async function registerSupportRoutes(app: FastifyInstance) {
  app.addHook('preHandler', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply
  })

  app.get('/tickets', async (request, reply) => {
    const parsed = ticketQuerySchema.safeParse(request.query)
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_support_ticket_query' })
    // Full ticket payload includes internal_notes and internal messages;
    // client roles must use /portal/tickets, which projects a safe DTO.
    requireInternalRole(request)

    const state: SqlState = { values: [], where: [] }
    addFilter(state, 't.organization_id', parsed.data.organizationId)
    addFilter(state, 't.client_id', parsed.data.clientId)
    addFilter(state, 't.contract_id', parsed.data.contractId)
    addFilter(state, 't.project_id', parsed.data.projectId)
    addFilter(state, 't.status', parsed.data.status)
    addFilter(state, 't.priority', parsed.data.priority)
    addFilter(state, 't.category', parsed.data.category)

    const { rows } = await app.pg.query(`${ticketSql(whereSql(state))} ORDER BY t.updated_at DESC`, state.values)
    return rows
  })

  app.get('/portal/tickets', async (request, reply) => {
    const parsed = portalContractQuerySchema.safeParse(request.query)
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_portal_ticket_query' })
    const organizationId = await getContractOrganizationId(app.pg, parsed.data.contractId)
    if (!organizationId) return reply.code(404).send({ error: 'contract_not_found' })
    requireMembership(request, organizationId)

    const { rows } = await app.pg.query(
      `SELECT t.id, t.organization_id, t.client_id, t.contract_id, t.project_id, t.subject,
              t.category, t.priority, t.status, t.sla_due_at, t.last_message_at, t.resolved_at,
              t.closed_at, t.created_at, t.updated_at,
              jsonb_build_object('company_name', c.company_name) AS clients,
              jsonb_build_object('name', co.name) AS contracts,
              CASE WHEN p.id IS NULL THEN NULL ELSE jsonb_build_object('name', p.name) END AS projects,
              COALESCE((SELECT jsonb_agg(jsonb_build_object(
                'id', m.id, 'ticket_id', m.ticket_id, 'author_type', m.author_type,
                'author_name', m.author_name, 'body', m.body, 'is_internal', m.is_internal,
                'created_at', m.created_at, 'updated_at', m.updated_at
              ) ORDER BY m.created_at ASC)
              FROM public.support_messages m WHERE m.ticket_id = t.id AND m.is_internal = FALSE), '[]'::jsonb) AS support_messages
       FROM public.support_tickets t
       JOIN public.clients c ON c.id = t.client_id
       JOIN public.contracts co ON co.id = t.contract_id
       LEFT JOIN public.projects p ON p.id = t.project_id
       WHERE t.contract_id = $1 AND t.organization_id = $2
       ORDER BY t.updated_at DESC`,
      [parsed.data.contractId, organizationId],
    )
    return rows
  })

  app.post('/tickets', async (request, reply) => {
    const parsed = createTicketSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_support_ticket_payload' })
    requireOrganizationScope(request, parsed.data.organizationId)

    const input = parsed.data
    const { rows } = await app.pg.query<{ id: string }>(
      `INSERT INTO public.support_tickets (
         organization_id, client_id, contract_id, project_id, subject, category, priority, sla_due_at, internal_notes
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [
        input.organizationId,
        input.clientId,
        input.contractId,
        input.projectId || null,
        input.subject,
        input.category,
        input.priority,
        input.slaDueAt || null,
        input.internalNotes || null,
      ],
    )

    return reply.code(201).send(await loadTicket(app.pg, rows[0].id))
  })

  app.post('/messages', async (request, reply) => {
    const parsed = createMessageSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_support_message_payload' })

    const input = parsed.data
    const organizationId = await getTicketOrganizationId(app.pg, input.ticketId)
    if (!organizationId) return reply.code(404).send({ error: 'support_ticket_not_found' })
    const ctx = requireMembership(request, organizationId)

    // Client roles can only reply as themselves with public messages.
    const clientCaller = !isInternalRole(ctx.role)
    const authorType = clientCaller ? 'client' : input.authorType
    const isInternal = clientCaller ? false : Boolean(input.isInternal)

    const { rows } = await app.pg.query(
      `INSERT INTO public.support_messages (ticket_id, author_type, author_name, body, is_internal)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        input.ticketId,
        authorType,
        input.authorName || null,
        input.body,
        isInternal,
      ],
    )
    return reply.code(201).send(rows[0])
  })

  app.patch('/tickets/:ticketId', async (request, reply) => {
    const params = ticketParamsSchema.safeParse(request.params)
    const parsed = updateTicketSchema.safeParse(request.body)
    if (!params.success || !parsed.success) return reply.code(400).send({ error: 'invalid_support_ticket_patch' })
    // Ticket management (status, SLA, internal notes) is an internal queue operation.
    requireInternalRole(request)

    const fields: Array<[string, unknown]> = [
      ['status', parsed.data.status],
      ['priority', parsed.data.priority],
      ['category', parsed.data.category],
      ['sla_due_at', parsed.data.slaDueAt],
      ['internal_notes', parsed.data.internalNotes],
    ]
    const columns: string[] = []
    const values: unknown[] = []
    for (const [column, value] of fields) {
      if (value !== undefined) {
        columns.push(column)
        values.push(value)
      }
    }
    if (columns.length) {
      const assignments = columns.map((column, index) => `${column} = $${index + 2}`)
      await app.pg.query(
        `UPDATE public.support_tickets SET ${assignments.join(', ')}, updated_at = NOW() WHERE id = $1`,
        [params.data.ticketId, ...values],
      )
    }

    const ticket = await loadTicket(app.pg, params.data.ticketId)
    if (!ticket) return reply.code(404).send({ error: 'support_ticket_not_found' })
    return ticket
  })
}
