import { randomBytes, randomUUID } from 'node:crypto'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import type pg from 'pg'
import { z } from 'zod'
import { hashPassword } from '../../auth/password.js'
import { sendConfiguredSmtp2GoEmail } from '../../email/smtp2goConfigured.js'
import { ApiError, forbidden } from '../../http/errors.js'
import { requireAuth } from '../../http/guards.js'
import { createClientAccessEmailToken, type ClientAccessEmailToken } from './clientAccessEmails.js'

const roleSchema = z.enum(['client_admin', 'client_member'])
const accountParams = z.object({ clientId: z.string().uuid() })
const memberParams = accountParams.extend({ userId: z.string().uuid() })
const inviteSchema = z.object({ name: z.string().trim().min(2).max(160), email: z.string().trim().toLowerCase().email().max(254), role: roleSchema }).strict()
const updateSchema = z.object({ role: roleSchema.optional(), isActive: z.boolean().optional() }).strict().refine(input => input.role !== undefined || input.isActive !== undefined)
const internalRoles = new Set(['yux_admin', 'yux_operator'])
type Account = { id: string; company_name: string; organization_id: string }
type MemberRow = { id: string; email: string; display_name: string; role: string; role_key: string; is_active: boolean; last_login: Date | string | null }
type Queryable = Pick<pg.PoolClient, 'query'>

function memberDto(row: MemberRow, actorId: string) {
  return { id: row.id, name: row.display_name, email: row.email, role: row.role_key, isActive: row.is_active,
    lastLogin: row.last_login, status: !row.is_active ? 'inactive' : row.last_login ? 'active' : 'invited',
    isCurrentUser: row.id === actorId }
}

async function loadAccount(db: Queryable, request: FastifyRequest, clientId: string, lock = false) {
  const ctx = requireAuth(request)
  const result = await db.query<Account>(
    `SELECT c.id, c.company_name, o.id AS organization_id
     FROM public.clients c JOIN public.organizations o ON o.client_id = c.id AND o.kind = 'client'
     WHERE c.id = $1 LIMIT 1`, [clientId])
  const account = result.rows[0]
  if (!account) throw new ApiError(404, 'client_account_not_found')
  if (!internalRoles.has(ctx.role) && !ctx.organizationIds.includes(account.organization_id)) throw forbidden()
  // All writers take the same lock before reading administrator state.
  if (lock) await db.query('SELECT id FROM public.organizations WHERE id = $1 FOR UPDATE', [account.organization_id])
  if (internalRoles.has(ctx.role)) return { account, canManage: true }
  const membership = await db.query<{ role_key: string }>(
    `SELECT role_key FROM public.memberships WHERE user_id = $1 AND organization_id = $2
     AND EXISTS (SELECT 1 FROM app_users WHERE id = $1 AND is_active = TRUE)`, [ctx.userId, account.organization_id])
  const canManage = membership.rows[0]?.role_key === 'client_admin'
  if (lock && !canManage) throw forbidden()
  return { account, canManage }
}

async function loadMembers(db: Queryable, organizationId: string, userId?: string) {
  const result = await db.query<MemberRow>(
    `SELECT au.id, au.email, au.display_name, au.role, au.is_active, au.last_login, m.role_key
     FROM public.memberships m JOIN app_users au ON au.id = m.user_id
     WHERE m.organization_id = $1 ${userId ? 'AND m.user_id = $2' : ''}
     ORDER BY au.display_name, au.email`, userId ? [organizationId, userId] : [organizationId])
  return result.rows
}

async function requireEditableMember(db: Queryable, account: Account, userId: string) {
  const member = (await loadMembers(db, account.organization_id, userId))[0]
  if (!member) throw new ApiError(404, 'client_member_not_found')
  if (!roleSchema.safeParse(member.role).success || !roleSchema.safeParse(member.role_key).success) throw new ApiError(409, 'internal_account_not_editable')
  const shared = await db.query(
    'SELECT id FROM public.memberships WHERE user_id = $1 AND organization_id <> $2 LIMIT 1', [userId, account.organization_id])
  if (shared.rows.length) throw new ApiError(409, 'shared_account_not_editable')
  return member
}

async function audit(db: Queryable, request: FastifyRequest, account: Account, userId: string, event: string, metadata: Record<string, unknown> = {}) {
  await db.query(
    `INSERT INTO audit_events (actor_user_id, organization_id, event_type, resource_type, resource_id, metadata)
     VALUES ($1, $2, $3, 'client_member', $4, $5::jsonb)`,
    [requireAuth(request).userId, account.organization_id, event, userId, JSON.stringify(metadata)])
}

async function mutate<T>(app: FastifyInstance, request: FastifyRequest, clientId: string, operation: (db: pg.PoolClient, account: Account) => Promise<T>) {
  requireAuth(request)
  const db = await app.pg.connect()
  try {
    await db.query('BEGIN')
    const { account } = await loadAccount(db, request, clientId, true)
    const result = await operation(db, account)
    await db.query('COMMIT')
    return result
  } catch (error) {
    await db.query('ROLLBACK')
    if (error && typeof error === 'object' && 'code' in error && error.code === '23505') throw new ApiError(409, 'client_login_email_already_exists')
    throw error
  } finally { db.release() }
}

async function deliverAccess(app: FastifyInstance, email: string, token: ClientAccessEmailToken) {
  const result = await sendConfiguredSmtp2GoEmail(app.pg, app.config.SESSION_SECRET, {
    to: email, subject: token.subject, textBody: token.text, htmlBody: token.html,
    customHeaders: [{ header: token.action === 'client_invitation' ? 'X-YUX-Invitation-ID' : 'X-YUX-Password-Reset-ID', value: token.tokenId }],
  })
  if (!result.sent) app.log.warn({ reason: result.reason }, 'client member access email was not sent')
  return { action: token.action, emailSent: result.sent, ...(!result.sent ? { emailError: result.reason } : {}) }
}

export async function registerClientMemberRoutes(app: FastifyInstance) {
  app.get('/client-accounts/:clientId/members', async (request, reply) => {
    requireAuth(request)
    const params = accountParams.safeParse(request.params)
    if (!params.success) return reply.code(400).send({ error: 'invalid_client_id' })
    const { account, canManage } = await loadAccount(app.pg, request, params.data.clientId)
    if (!canManage) return { members: [], canManage: false }
    return { members: (await loadMembers(app.pg, account.organization_id)).map(row => memberDto(row, requireAuth(request).userId)), canManage }
  })

  app.post('/client-accounts/:clientId/members', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (request, reply) => {
    requireAuth(request)
    const params = accountParams.safeParse(request.params)
    const input = inviteSchema.safeParse(request.body)
    if (!params.success || !input.success) return reply.code(400).send({ error: 'invalid_client_member' })
    const result = await mutate(app, request, params.data.clientId, async (db, account) => {
      const existing = await db.query('SELECT id FROM app_users WHERE lower(email) = lower($1) LIMIT 1', [input.data.email])
      if (existing.rows.length) throw new ApiError(409, 'client_login_email_already_exists')
      const userId = randomUUID()
      const password = await hashPassword(randomBytes(48).toString('base64url'))
      await db.query(`INSERT INTO app_users (id, email, password_hash, display_name, role, is_active) VALUES ($1, $2, $3, $4, $5, TRUE)`, [userId, input.data.email, password, input.data.name, input.data.role])
      await db.query(`INSERT INTO public.users (id, name, role) VALUES ($1, $2, 'CLIENT')`, [userId, input.data.name])
      await db.query(`INSERT INTO public.memberships (user_id, organization_id, role_key) VALUES ($1, $2, $3)`, [userId, account.organization_id, input.data.role])
      const token = await createClientAccessEmailToken(db, app.config, { userId, contactName: input.data.name, companyName: account.company_name, hasLoggedIn: false })
      await audit(db, request, account, userId, 'client_member.invited', { role: input.data.role })
      return { member: memberDto({ id: userId, email: input.data.email, display_name: input.data.name, role: input.data.role, role_key: input.data.role, is_active: true, last_login: null }, requireAuth(request).userId), token }
    })
    const invitation = await deliverAccess(app, result.member.email, result.token)
    return reply.code(201).send({ member: result.member, invitation })
  })

  app.patch('/client-accounts/:clientId/members/:userId', async (request, reply) => {
    requireAuth(request)
    const params = memberParams.safeParse(request.params)
    const input = updateSchema.safeParse(request.body)
    if (!params.success || !input.success) return reply.code(400).send({ error: 'invalid_client_member_update' })
    const member = await mutate(app, request, params.data.clientId, async (db, account) => {
      const row = await requireEditableMember(db, account, params.data.userId)
      if (row.id === requireAuth(request).userId) throw new ApiError(409, 'cannot_change_own_access')
      const role = input.data.role ?? row.role_key
      const isActive = input.data.isActive ?? row.is_active
      if (row.role_key === 'client_admin' && row.is_active && (role !== 'client_admin' || !isActive)) {
        const admins = (await loadMembers(db, account.organization_id)).filter(item => item.id !== row.id && item.role_key === 'client_admin' && item.is_active)
        if (!admins.length) throw new ApiError(409, 'last_client_admin_required')
      }
      await db.query('UPDATE app_users SET role = $1, is_active = $2, updated_at = NOW() WHERE id = $3', [role, isActive, row.id])
      await db.query('UPDATE public.memberships SET role_key = $1, updated_at = NOW() WHERE user_id = $2 AND organization_id = $3', [role, row.id, account.organization_id])
      await db.query('DELETE FROM app_sessions WHERE user_id = $1', [row.id])
      if (!isActive) await db.query('UPDATE app_password_reset_tokens SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL', [row.id])
      await audit(db, request, account, row.id, 'client_member.updated', { previousRole: row.role_key, role, isActive })
      return memberDto({ ...row, role, role_key: role, is_active: isActive }, requireAuth(request).userId)
    })
    return { member }
  })

  app.post('/client-accounts/:clientId/members/:userId/access-email', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
    requireAuth(request)
    const params = memberParams.safeParse(request.params)
    if (!params.success) return reply.code(400).send({ error: 'invalid_client_member' })
    const result = await mutate(app, request, params.data.clientId, async (db, account) => {
      const member = await requireEditableMember(db, account, params.data.userId)
      if (!member.is_active) throw new ApiError(409, 'client_member_inactive')
      const token = await createClientAccessEmailToken(db, app.config, { userId: member.id, contactName: member.display_name, companyName: account.company_name, hasLoggedIn: Boolean(member.last_login) })
      await audit(db, request, account, member.id, 'client_member.access_email_requested', { action: token.action })
      return { member, token }
    })
    return { invitation: await deliverAccess(app, result.member.email, result.token) }
  })
}
