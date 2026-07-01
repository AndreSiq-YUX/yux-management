import type { FastifyInstance } from 'fastify'
import type { OutgoingHttpHeaders } from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'
import { buildSetPasswordUrl, createInvitationToken, hashInvitationToken } from '../src/auth/invitations.js'
import { hashPassword, verifyPassword } from '../src/auth/password.js'
import { type AuthStore, type AuthUser } from '../src/auth/routes.js'
import { createSessionToken, hashSessionToken, sessionExpiry } from '../src/auth/session.js'
import { buildServer } from '../src/server.js'

const testEnv = {
  NODE_ENV: 'test' as const,
  PORT: 4000,
  DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/yux_test',
  REDIS_URL: 'redis://localhost:6379',
  SESSION_COOKIE_NAME: 'yux_session',
  SESSION_SECRET: 'test-secret-value-with-at-least-32-chars',
  CORS_ORIGIN: 'http://localhost:3000',
}

class FakeAuthStore implements AuthStore {
  user:
    | (AuthUser & {
        passwordHash: string
        active: boolean
      })
    | null = null

  sessions = new Map<string, { userId: string; expiresAt: Date }>()
  loggedInUserId: string | null = null

  async findActiveUserByEmail(email: string) {
    if (!this.user || !this.user.active || this.user.email.toLowerCase() !== email.toLowerCase()) {
      return null
    }

    return {
      id: this.user.id,
      email: this.user.email,
      name: this.user.name,
      role: this.user.role,
      passwordHash: this.user.passwordHash,
    }
  }

  async createSession(userId: string, sessionTokenHash: string, expiresAt: Date) {
    this.sessions.set(sessionTokenHash, { userId, expiresAt })
  }

  async recordLogin(userId: string) {
    this.loggedInUserId = userId
  }

  async deleteSession(sessionTokenHash: string) {
    this.sessions.delete(sessionTokenHash)
  }

  async findUserBySession(sessionTokenHash: string, now: Date) {
    const session = this.sessions.get(sessionTokenHash)
    if (!this.user || !session || session.userId !== this.user.id || session.expiresAt <= now || !this.user.active) {
      return null
    }

    return {
      id: this.user.id,
      email: this.user.email,
      name: this.user.name,
      role: this.user.role,
    }
  }
}

const noopPool = {
  async end() {
    return undefined
  },
}

class FakePasswordResetClient {
  tokenId = 'token-row-1'
  userId = 'client-user-1'
  passwordHash = 'old-password-hash'
  usedAt: Date | null = null
  sessionsDeleted = false
  committed = false
  rolledBack = false
  released = false

  constructor(
    private readonly tokenHash: string,
    private readonly expiresAt = new Date(Date.now() + 60_000),
  ) {}

  async query(sql: string, params: unknown[] = []) {
    if (sql === 'BEGIN') return { rows: [], rowCount: null }
    if (sql === 'COMMIT') {
      this.committed = true
      return { rows: [], rowCount: null }
    }
    if (sql === 'ROLLBACK') {
      this.rolledBack = true
      return { rows: [], rowCount: null }
    }
    if (sql.includes('FROM app_password_reset_tokens')) {
      const valid = params[0] === this.tokenHash && !this.usedAt && this.expiresAt > new Date()
      return {
        rows: valid ? [{ id: this.tokenId, user_id: this.userId }] : [],
        rowCount: valid ? 1 : 0,
      }
    }
    if (sql.startsWith('UPDATE app_users SET password_hash')) {
      this.passwordHash = params[0] as string
      return { rows: [], rowCount: 1 }
    }
    if (sql.startsWith('UPDATE app_password_reset_tokens SET used_at')) {
      this.usedAt = new Date()
      return { rows: [], rowCount: 1 }
    }
    if (sql.startsWith('DELETE FROM app_sessions')) {
      this.sessionsDeleted = true
      return { rows: [], rowCount: 1 }
    }

    throw new Error(`Unexpected SQL: ${sql}`)
  }

  release() {
    this.released = true
  }
}

class FakePasswordResetPool {
  constructor(readonly client: FakePasswordResetClient) {}

  async connect() {
    return this.client
  }

  async end() {
    return undefined
  }
}

let app: FastifyInstance | undefined

afterEach(async () => {
  await app?.close()
  app = undefined
})

function cookieHeader(response: { headers: OutgoingHttpHeaders }) {
  const header = response.headers['set-cookie']
  const cookie = Array.isArray(header) ? header[0] : header
  if (!cookie) throw new Error('missing set-cookie header')
  return cookie.split(';')[0]
}

describe('auth helpers', () => {
  it('hashes and verifies passwords', async () => {
    const hash = await hashPassword('correct-horse-password')

    await expect(verifyPassword(hash, 'correct-horse-password')).resolves.toBe(true)
    await expect(verifyPassword(hash, 'wrong-password')).resolves.toBe(false)
  })

  it('rejects short passwords before hashing', async () => {
    expect(() => hashPassword('too-short')).toThrow('password_too_short')
  })

  it('hashes session tokens deterministically without storing plaintext', () => {
    const token = createSessionToken()
    const hash = hashSessionToken(token)

    expect(hash).not.toBe(token)
    expect(hash).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(hashSessionToken(token)).toBe(hash)
  })

  it('sets the default session expiry to seven days', () => {
    const now = Date.now()
    const expiry = sessionExpiry()
    const diffInDays = (expiry.getTime() - now) / 86_400_000

    expect(diffInDays).toBeGreaterThan(6.99)
    expect(diffInDays).toBeLessThan(7.01)
  })

  it('creates one-way invitation token hashes and set-password URLs', () => {
    const token = createInvitationToken()
    const hash = hashInvitationToken(token)

    expect(hash).not.toBe(token)
    expect(hashInvitationToken(token)).toBe(hash)
    expect(buildSetPasswordUrl('https://hub.yux.com.br/', token)).toBe(`https://hub.yux.com.br/auth/set-password?token=${encodeURIComponent(token)}`)
  })
})

describe('auth routes', () => {
  it('sets a password from a valid invitation token and consumes the token', async () => {
    const rawToken = createInvitationToken()
    const client = new FakePasswordResetClient(hashInvitationToken(rawToken))
    app = await buildServer(testEnv, {
      authStore: new FakeAuthStore(),
      pool: new FakePasswordResetPool(client) as never,
    })

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/invitations/set-password',
      payload: {
        token: rawToken,
        password: 'new-client-password',
      },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ ok: true })
    await expect(verifyPassword(client.passwordHash, 'new-client-password')).resolves.toBe(true)
    expect(client.usedAt).toBeInstanceOf(Date)
    expect(client.sessionsDeleted).toBe(true)
    expect(client.committed).toBe(true)
    expect(client.released).toBe(true)
  })

  it('rejects invalid invitation tokens without setting a password', async () => {
    const validToken = createInvitationToken()
    const client = new FakePasswordResetClient(hashInvitationToken(validToken))
    app = await buildServer(testEnv, {
      authStore: new FakeAuthStore(),
      pool: new FakePasswordResetPool(client) as never,
    })

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/invitations/set-password',
      payload: {
        token: createInvitationToken(),
        password: 'new-client-password',
      },
    })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toEqual({ error: 'invalid_or_expired_invitation' })
    expect(client.passwordHash).toBe('old-password-hash')
    expect(client.rolledBack).toBe(true)
    expect(client.released).toBe(true)
  })

  it('logs in, sets a session cookie, and returns the authenticated user', async () => {
    const store = new FakeAuthStore()
    store.user = {
      id: 'user-1',
      email: 'admin@yux.com.br',
      name: 'Admin YUX',
      role: 'yux_admin',
      active: true,
      passwordHash: await hashPassword('correct-horse-password'),
    }
    app = await buildServer(testEnv, { authStore: store, pool: noopPool as never })

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        email: 'ADMIN@yux.com.br',
        password: 'correct-horse-password',
      },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      user: {
        id: 'user-1',
        email: 'admin@yux.com.br',
        displayName: 'Admin YUX',
        name: 'Admin YUX',
        role: 'yux_admin',
      },
    })
    expect(response.headers['set-cookie']).toEqual(expect.stringContaining('HttpOnly'))
    expect(response.headers['set-cookie']).toEqual(expect.stringContaining('SameSite=Lax'))
    expect(store.sessions.size).toBe(1)
  })

  it('rejects invalid credentials without creating a session', async () => {
    const store = new FakeAuthStore()
    store.user = {
      id: 'user-1',
      email: 'admin@yux.com.br',
      name: 'Admin YUX',
      role: 'yux_admin',
      active: true,
      passwordHash: await hashPassword('correct-horse-password'),
    }
    app = await buildServer(testEnv, { authStore: store, pool: noopPool as never })

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        email: 'admin@yux.com.br',
        password: 'wrong-password',
      },
    })

    expect(response.statusCode).toBe(401)
    expect(response.json()).toEqual({ error: 'invalid_credentials' })
    expect(store.sessions.size).toBe(0)
  })

  it('returns the current user for a valid session cookie', async () => {
    const store = new FakeAuthStore()
    store.user = {
      id: 'user-1',
      email: 'admin@yux.com.br',
      name: 'Admin YUX',
      role: 'yux_admin',
      active: true,
      passwordHash: await hashPassword('correct-horse-password'),
    }
    app = await buildServer(testEnv, { authStore: store, pool: noopPool as never })

    const loginResponse = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        email: 'admin@yux.com.br',
        password: 'correct-horse-password',
      },
    })
    const response = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: {
        cookie: cookieHeader(loginResponse),
      },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      user: {
        id: 'user-1',
        email: 'admin@yux.com.br',
        displayName: 'Admin YUX',
        name: 'Admin YUX',
        role: 'yux_admin',
      },
    })
  })

  it('logs out and invalidates the current session when a cookie is present', async () => {
    const store = new FakeAuthStore()
    store.user = {
      id: 'user-1',
      email: 'admin@yux.com.br',
      name: 'Admin YUX',
      role: 'yux_admin',
      active: true,
      passwordHash: await hashPassword('correct-horse-password'),
    }
    app = await buildServer(testEnv, { authStore: store, pool: noopPool as never })

    const loginResponse = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        email: 'admin@yux.com.br',
        password: 'correct-horse-password',
      },
    })
    const cookie = cookieHeader(loginResponse)
    const logoutResponse = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { cookie },
    })
    const meResponse = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie },
    })

    expect(logoutResponse.statusCode).toBe(200)
    expect(logoutResponse.json()).toEqual({ ok: true })
    expect(logoutResponse.headers['set-cookie']).toEqual(expect.stringContaining('Max-Age=0'))
    expect(meResponse.statusCode).toBe(401)
  })
})
