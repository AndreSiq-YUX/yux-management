import type { FastifyInstance } from 'fastify'
import type pg from 'pg'
import { z } from 'zod'
import { createSessionToken, hashSessionToken, sessionExpiry } from './session.js'
import { verifyPassword } from './password.js'

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
  deleteSession(sessionTokenHash: string): Promise<void>
  findUserBySession(sessionTokenHash: string, now: Date): Promise<AuthUser | null>
}

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
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
  app.post('/login', async (request, reply) => {
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
