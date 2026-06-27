import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type pg from 'pg'
import { z } from 'zod'
import { hashSessionToken } from '../../auth/session.js'

const optionalUuid = z.string().uuid().optional()
const invoiceParamsSchema = z.object({ invoiceId: z.string().uuid() })

const invoiceQuerySchema = z.object({
  organizationId: optionalUuid,
  clientId: optionalUuid,
  contractId: optionalUuid,
  status: z.string().optional(),
  dueFrom: z.string().optional(),
  dueTo: z.string().optional(),
})

const createInvoiceSchema = z.object({
  organizationId: z.string().uuid(),
  clientId: z.string().uuid(),
  contractId: z.string().uuid(),
  invoiceNumber: z.string().min(1),
  issueDate: z.string().min(1),
  dueDate: z.string().min(1),
  periodStart: z.string().nullable().optional(),
  periodEnd: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  internalNotes: z.string().nullable().optional(),
})

const updateInvoiceStatusSchema = z.object({
  status: z.enum(['draft', 'issued', 'partial', 'paid', 'overdue', 'cancelled']),
  paidAmount: z.number().optional(),
})

const createBillingItemSchema = z.object({
  invoiceId: z.string().uuid(),
  description: z.string().min(1),
  quantity: z.number().positive(),
  unitAmount: z.number(),
  kind: z.enum(['setup', 'recurring', 'usage', 'adjustment', 'discount', 'other']),
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

function addFilter(state: SqlState, column: string, value: unknown, op = '=') {
  if (value === undefined || value === null || value === '') return
  state.values.push(value)
  state.where.push(`${column} ${op} $${state.values.length}`)
}

function whereSql(state: SqlState) {
  return state.where.length ? `WHERE ${state.where.join(' AND ')}` : ''
}

async function loadInvoice(pool: pg.Pool, invoiceId: string) {
  const { rows } = await pool.query(invoiceSql('WHERE i.id = $1'), [invoiceId])
  return rows[0]
}

function invoiceSql(where = '') {
  return `
    SELECT
      i.*,
      CASE WHEN c.id IS NULL THEN NULL ELSE jsonb_build_object('company_name', c.company_name) END AS clients,
      CASE WHEN co.id IS NULL THEN NULL ELSE jsonb_build_object('name', co.name, 'billing_cycle', co.billing_cycle) END AS contracts,
      COALESCE((
        SELECT jsonb_agg(to_jsonb(b) ORDER BY b.created_at ASC)
        FROM public.billing_items b
        WHERE b.invoice_id = i.id
      ), '[]'::jsonb) AS billing_items
    FROM public.invoices i
    LEFT JOIN public.clients c ON c.id = i.client_id
    LEFT JOIN public.contracts co ON co.id = i.contract_id
    ${where}
  `
}

export async function registerFinanceRoutes(app: FastifyInstance) {
  app.addHook('preHandler', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply
  })

  app.get('/invoices', async (request, reply) => {
    const parsed = invoiceQuerySchema.safeParse(request.query)
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_invoice_query' })

    const state: SqlState = { values: [], where: [] }
    addFilter(state, 'i.organization_id', parsed.data.organizationId)
    addFilter(state, 'i.client_id', parsed.data.clientId)
    addFilter(state, 'i.contract_id', parsed.data.contractId)
    addFilter(state, 'i.status', parsed.data.status)
    addFilter(state, 'i.due_date', parsed.data.dueFrom, '>=')
    addFilter(state, 'i.due_date', parsed.data.dueTo, '<=')

    const { rows } = await app.pg.query(`${invoiceSql(whereSql(state))} ORDER BY i.due_date ASC`, state.values)
    return rows
  })

  app.post('/invoices', async (request, reply) => {
    const parsed = createInvoiceSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_invoice_payload' })

    const input = parsed.data
    const { rows } = await app.pg.query<{ id: string }>(
      `INSERT INTO public.invoices (
         organization_id, client_id, contract_id, invoice_number, issue_date, due_date,
         period_start, period_end, notes, internal_notes
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id`,
      [
        input.organizationId,
        input.clientId,
        input.contractId,
        input.invoiceNumber,
        input.issueDate,
        input.dueDate,
        input.periodStart || null,
        input.periodEnd || null,
        input.notes || null,
        input.internalNotes || null,
      ],
    )

    return reply.code(201).send(await loadInvoice(app.pg, rows[0].id))
  })

  app.patch('/invoices/:invoiceId/status', async (request, reply) => {
    const params = invoiceParamsSchema.safeParse(request.params)
    const parsed = updateInvoiceStatusSchema.safeParse(request.body)
    if (!params.success || !parsed.success) return reply.code(400).send({ error: 'invalid_invoice_status_patch' })

    await app.pg.query(
      `UPDATE public.invoices
       SET status = $2,
           paid_amount = COALESCE($3, paid_amount),
           paid_at = CASE WHEN $2 = 'paid' THEN NOW() ELSE NULL END,
           updated_at = NOW()
       WHERE id = $1`,
      [params.data.invoiceId, parsed.data.status, parsed.data.paidAmount ?? null],
    )

    const invoice = await loadInvoice(app.pg, params.data.invoiceId)
    if (!invoice) return reply.code(404).send({ error: 'invoice_not_found' })
    return invoice
  })

  app.post('/billing-items', async (request, reply) => {
    const parsed = createBillingItemSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_billing_item_payload' })

    const input = parsed.data
    const { rows } = await app.pg.query(
      `INSERT INTO public.billing_items (invoice_id, description, quantity, unit_amount, kind)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [input.invoiceId, input.description, input.quantity, input.unitAmount, input.kind],
    )
    return reply.code(201).send(rows[0])
  })
}
