import { randomBytes, randomUUID } from 'node:crypto'
import type pg from 'pg'
import type { AppEnv } from '../../config/env.js'
import { createInvitationToken, hashInvitationToken, invitationExpiry, buildSetPasswordUrl } from '../../auth/invitations.js'
import { hashPassword } from '../../auth/password.js'

export class ClientAccessError extends Error {
  statusCode: number

  constructor(message: string, statusCode = 400) {
    super(message)
    this.name = 'ClientAccessError'
    this.statusCode = statusCode
  }
}

export type ClientAccessProvisioningResult = {
  userId: string
  organizationId: string
  invitationTokenId: string
  invitationUrl: string
}

type ClientRow = {
  id: string
  company_name: string
  contact_name: string
  email: string
}

export async function provisionClientPortalAccess(
  client: pg.PoolClient,
  env: Pick<AppEnv, 'CORS_ORIGIN' | 'PUBLIC_APP_URL'>,
  row: ClientRow,
): Promise<ClientAccessProvisioningResult> {
  const existingUser = await client.query<{ id: string; role: string }>(
    'SELECT id, role FROM app_users WHERE lower(email) = lower($1) LIMIT 1',
    [row.email],
  )
  if (existingUser.rows[0]) {
    throw new ClientAccessError('client_login_email_already_exists', 409)
  }

  const userId = randomUUID()
  const provisionalPasswordHash = await hashPassword(randomBytes(48).toString('base64url'))

  await client.query(
    `INSERT INTO app_users (id, email, password_hash, display_name, role, is_active)
     VALUES ($1, $2, $3, $4, 'client_admin', TRUE)`,
    [userId, row.email, provisionalPasswordHash, row.contact_name],
  )

  await client.query(
    `INSERT INTO public.users (id, name, role)
     VALUES ($1, $2, 'CLIENT')
     ON CONFLICT (id)
     DO UPDATE SET name = EXCLUDED.name, role = EXCLUDED.role, updated_at = NOW()`,
    [userId, row.contact_name],
  )

  await client.query('UPDATE public.clients SET user_id = $1, updated_at = NOW() WHERE id = $2', [userId, row.id])

  const organizationId = await ensureClientOrganization(client, row)

  await client.query(
    `INSERT INTO public.memberships (user_id, organization_id, role_key)
     VALUES ($1, $2, 'client_admin')
     ON CONFLICT (user_id, organization_id)
     DO UPDATE SET role_key = EXCLUDED.role_key, updated_at = NOW()`,
    [userId, organizationId],
  )

  const token = createInvitationToken()
  const tokenHash = hashInvitationToken(token)
  await client.query(
    `UPDATE app_password_reset_tokens
     SET used_at = NOW()
     WHERE user_id = $1
       AND purpose = 'client_invitation'
       AND used_at IS NULL`,
    [userId],
  )
  const tokenResult = await client.query<{ id: string }>(
    `INSERT INTO app_password_reset_tokens (user_id, token_hash, purpose, expires_at)
     VALUES ($1, $2, 'client_invitation', $3)
     RETURNING id`,
    [userId, tokenHash, invitationExpiry()],
  )

  return {
    userId,
    organizationId,
    invitationTokenId: tokenResult.rows[0].id,
    invitationUrl: buildSetPasswordUrl(env.PUBLIC_APP_URL ?? env.CORS_ORIGIN, token),
  }
}

async function ensureClientOrganization(client: pg.PoolClient, row: ClientRow) {
  const existing = await client.query<{ id: string }>(
    'SELECT id FROM public.organizations WHERE client_id = $1 LIMIT 1',
    [row.id],
  )
  if (existing.rows[0]) return existing.rows[0].id

  const baseSlug = slugify(row.company_name) || `cliente-${row.id.slice(0, 8)}`
  const inserted = await client.query<{ id: string }>(
    `INSERT INTO public.organizations (name, slug, kind, client_id)
     VALUES ($1, $2, 'client', $3)
     RETURNING id`,
    [row.company_name.trim(), `${baseSlug}-${row.id.slice(0, 8)}`, row.id],
  )

  return inserted.rows[0].id
}

function slugify(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}
