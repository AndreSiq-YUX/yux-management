import type { FastifyInstance } from 'fastify'
import type pg from 'pg'
import { z } from 'zod'
import {
  buildSetPasswordUrl,
  createInvitationToken,
  hashInvitationToken,
  invitationExpiry,
} from './invitations.js'
import { hashPassword, MIN_PASSWORD_LENGTH, verifyPassword } from './password.js'
import { createSessionToken, hashSessionToken, sessionExpiry } from './session.js'
import { sendConfiguredSmtp2GoEmail } from '../email/smtp2goConfigured.js'
import { renderClientAccessEmail } from '../modules/workspace/clientAccessEmails.js'

export type AuthUser = {
  id: string
  email: string
  name: string
  role: string
}

type UserWithPassword = AuthUser & {
  passwordHash: string
}

export type AuthStore = {
  findActiveUserByEmail(email: string): Promise<UserWithPassword | null>
  createSession(userId: string, sessionTokenHash: string, expiresAt: Date): Promise<void>
  recordLogin?(userId: string): Promise<void>
  deleteSession(sessionTokenHash: string): Promise<void>
  findUserBySession(sessionTokenHash: string, now: Date): Promise<AuthUser | null>
}

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

const setPasswordSchema = z.object({
  token: z.string().min(20),
  password: z.string().min(MIN_PASSWORD_LENGTH),
})

const forgotPasswordSchema = z.object({
  email: z.string().email(),
})

declare module 'fastify' {
  interface FastifyInstance {
    authStore: AuthStore
  }
}

type UserRow = {
  id: string
  email: string
  password_hash: string
  display_name: string
  role: string
}

export function createPgAuthStore(pool: pg.Pool): AuthStore {
  return {
    async findActiveUserByEmail(email) {
      const result = await pool.query<UserRow>(
        `SELECT id, email, password_hash, display_name, role
         FROM app_users
         WHERE lower(email) = lower($1) AND is_active = TRUE
         LIMIT 1`,
        [email],
      )
      const user = result.rows[0]
      if (!user) return null

      return {
        id: user.id,
        email: user.email,
        name: user.display_name,
        role: user.role,
        passwordHash: user.password_hash,
      }
    },

    async createSession(userId, sessionTokenHash, expiresAt) {
      await pool.query(
        `INSERT INTO app_sessions (user_id, session_token_hash, expires_at)
         VALUES ($1, $2, $3)`,
        [userId, sessionTokenHash, expiresAt],
      )
    },

    async recordLogin(userId) {
      await Promise.all([
        pool.query('UPDATE app_users SET last_login = NOW(), updated_at = NOW() WHERE id = $1', [userId]),
        pool.query('UPDATE public.users SET last_login = NOW(), updated_at = NOW() WHERE id = $1', [userId]),
      ])
    },

    async deleteSession(sessionTokenHash) {
      await pool.query('DELETE FROM app_sessions WHERE session_token_hash = $1', [sessionTokenHash])
    },

    async findUserBySession(sessionTokenHash, now) {
      const result = await pool.query<Omit<UserRow, 'password_hash'>>(
        `SELECT u.id, u.email, u.display_name, u.role
         FROM app_sessions s
         JOIN app_users u ON u.id = s.user_id
         WHERE s.session_token_hash = $1
           AND s.expires_at > $2
           AND u.is_active = TRUE
         LIMIT 1`,
        [sessionTokenHash, now],
      )
      const user = result.rows[0]
      if (!user) return null

      return {
        id: user.id,
        email: user.email,
        name: user.display_name,
        role: user.role,
      }
    },
  }
}

export async function registerAuthRoutes(app: FastifyInstance) {
  app.post('/forgot-password', { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (request, reply) => {
    const parsed = forgotPasswordSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_forgot_password_request' })
    }

    const client = await app.pg.connect()
    let emailPayload: { to: string; contactName: string; resetUrl: string; tokenId: string } | null = null

    try {
      await client.query('BEGIN')
      const userResult = await client.query<{ id: string; email: string; display_name: string }>(
        `SELECT id, email, display_name
         FROM app_users
         WHERE lower(email) = lower($1)
           AND is_active = TRUE
         LIMIT 1
         FOR UPDATE`,
        [parsed.data.email],
      )
      const user = userResult.rows[0]

      if (user) {
        await client.query(
          `UPDATE app_password_reset_tokens
           SET used_at = NOW()
           WHERE user_id = $1
             AND purpose = 'password_reset'
             AND used_at IS NULL`,
          [user.id],
        )

        const token = createInvitationToken()
        const tokenResult = await client.query<{ id: string }>(
          `INSERT INTO app_password_reset_tokens (user_id, token_hash, purpose, expires_at)
           VALUES ($1, $2, 'password_reset', $3)
           RETURNING id`,
          [user.id, hashInvitationToken(token), invitationExpiry()],
        )

        emailPayload = {
          to: user.email,
          contactName: user.display_name,
          resetUrl: buildSetPasswordUrl(app.config.PUBLIC_APP_URL ?? app.config.CORS_ORIGIN, token),
          tokenId: tokenResult.rows[0].id,
        }
      }

      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }

    if (emailPayload) {
      const email = await renderClientAccessEmail(app.pg, {
        action: 'password_reset',
        contactName: emailPayload.contactName,
        accessUrl: emailPayload.resetUrl,
      })
      const emailResult = await sendConfiguredSmtp2GoEmail(app.pg, app.config.SESSION_SECRET, {
        to: emailPayload.to,
        subject: email.subject,
        textBody: email.text,
        htmlBody: email.html,
        customHeaders: [{ header: 'X-YUX-Password-Reset-ID', value: emailPayload.tokenId }],
      })

      if (!emailResult.sent) {
        app.log.warn(
          { reason: emailResult.reason, error: emailResult.error, email: emailPayload.to },
          'password reset email was not sent',
        )
      }
    }

    return { ok: true }
  })

  app.post('/invitations/set-password', async (request, reply) => {
    const parsed = setPasswordSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_set_password_request' })
    }

    const tokenHash = hashInvitationToken(parsed.data.token)
    const client = await app.pg.connect()

    try {
      await client.query('BEGIN')
      const tokenResult = await client.query<{ id: string; user_id: string }>(
        `SELECT t.id, t.user_id
         FROM app_password_reset_tokens t
         JOIN app_users u ON u.id = t.user_id
          WHERE t.token_hash = $1
            AND t.purpose = ANY($2::text[])
            AND t.used_at IS NULL
            AND t.expires_at > NOW()
            AND u.is_active = TRUE
         LIMIT 1
         FOR UPDATE OF t`,
        [tokenHash, ['set_password', 'client_invitation', 'password_reset']],
      )
      const token = tokenResult.rows[0]

      if (!token) {
        await client.query('ROLLBACK')
        return reply.code(400).send({ error: 'invalid_or_expired_invitation' })
      }

      const passwordHash = await hashPassword(parsed.data.password)
      await client.query('UPDATE app_users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [passwordHash, token.user_id])
      await client.query('UPDATE app_password_reset_tokens SET used_at = NOW() WHERE id = $1', [token.id])
      await client.query('DELETE FROM app_sessions WHERE user_id = $1', [token.user_id])
      await client.query('COMMIT')

      return { ok: true }
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  })

  app.post('/login', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_login_request' })
    }

    const user = await app.authStore.findActiveUserByEmail(parsed.data.email)
    if (!user) {
      return reply.code(401).send({ error: 'invalid_credentials' })
    }

    const passwordMatches = await verifyPassword(user.passwordHash, parsed.data.password)
    if (!passwordMatches) {
      return reply.code(401).send({ error: 'invalid_credentials' })
    }

    const token = createSessionToken()
    const tokenHash = hashSessionToken(token)
    const expiresAt = sessionExpiry()
    await app.authStore.createSession(user.id, tokenHash, expiresAt)
    await app.authStore.recordLogin?.(user.id)

    reply.setCookie(app.config.SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: app.config.NODE_ENV === 'production',
      path: '/',
      expires: expiresAt,
    })

    return {
      user: {
        id: user.id,
        email: user.email,
        displayName: user.name,
        name: user.name,
        role: user.role,
      },
    }
  })

  app.post('/logout', async (request, reply) => {
    const token = request.cookies[app.config.SESSION_COOKIE_NAME]
    if (token) {
      await app.authStore.deleteSession(hashSessionToken(token))
    }

    reply.clearCookie(app.config.SESSION_COOKIE_NAME, { path: '/' })
    return { ok: true }
  })

  app.get('/me', async (request, reply) => {
    const token = request.cookies[app.config.SESSION_COOKIE_NAME]
    if (!token) {
      return reply.code(401).send({ error: 'not_authenticated' })
    }

    const user = await app.authStore.findUserBySession(hashSessionToken(token), new Date())
    if (!user) {
      return reply.code(401).send({ error: 'not_authenticated' })
    }

    return {
      user: {
        ...user,
        displayName: user.name,
      },
    }
  })
}
