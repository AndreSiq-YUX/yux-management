# VPS Backend Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Supabase-hosted backend dependencies with a self-hosted Dokploy stack using a new backend API, Postgres, Redis, workers, and the existing Agent Harness runtime.

**Architecture:** Add a new `backend/` TypeScript Fastify service that owns auth, authorization, data access, Edge Function replacements, jobs, and integration secrets. Keep `frontend/` as React/Vite served by Nginx, but migrate its data access from `@supabase/supabase-js` to `/api/*`. Use Postgres 17 and Redis in `docker-compose.dokploy.yml`, with `workers/marketing-studio-agent-runtime` remaining a separate Python service.

**Tech Stack:** Node.js 22, TypeScript, Fastify, Drizzle ORM, node-postgres, Zod, Argon2, cookie sessions, Redis, BullMQ, Postgres 17, Vitest, Docker Compose, Dokploy, existing React/Vite frontend, existing Python Agent Harness.

---

## File Structure

Create:

- `backend/package.json`: backend scripts and dependencies.
- `backend/tsconfig.json`: strict TypeScript config.
- `backend/vitest.config.ts`: backend unit/integration test config.
- `backend/src/server.ts`: Fastify app factory.
- `backend/src/index.ts`: production entrypoint.
- `backend/src/config/env.ts`: validated environment variables.
- `backend/src/db/client.ts`: Postgres connection pool and Drizzle instance.
- `backend/src/db/schema/auth.ts`: first-party auth tables.
- `backend/src/db/schema/index.ts`: schema export barrel.
- `backend/src/db/migrations/0001_auth_core.sql`: auth/session/audit bootstrap.
- `backend/scripts/create-admin-user.ts`: admin bootstrap command using a password supplied by environment variable.
- `backend/src/auth/password.ts`: password hashing and verification.
- `backend/src/auth/session.ts`: session create/read/delete helpers.
- `backend/src/auth/routes.ts`: `/api/auth/*` routes.
- `backend/src/policies/authorization.ts`: multi-tenant authorization checks.
- `backend/src/http/errors.ts`: shared API error model.
- `backend/src/http/request-context.ts`: authenticated request context.
- `backend/src/modules/health/routes.ts`: health/readiness endpoints.
- `backend/src/modules/platform/routes.ts`: first platform context endpoints.
- `backend/src/jobs/queue.ts`: BullMQ queue factory.
- `backend/src/worker.ts`: worker process entrypoint.
- `backend/tests/auth.test.ts`: auth/session tests.
- `backend/tests/policies.test.ts`: authorization tests.
- `backend/tests/health.test.ts`: API health tests.
- `backend/scripts/apply-migrations.ts`: simple migration runner.
- `frontend/src/lib/apiClient.ts`: browser API wrapper.
- `frontend/src/services/backendAuthService.ts`: frontend auth adapter for backend.
- `docs/backend-vps-runbook.md`: operator runbook.

Modify:

- `docker-compose.dokploy.yml`: add backend, worker, Postgres, Redis, volumes, and env wiring.
- `frontend/.env.example`: replace Supabase browser envs with `VITE_API_BASE_URL`.
- `frontend/src/stores/authStore.ts`: switch auth calls from Supabase to backend adapter.
- `frontend/src/lib/backendDataClient.ts`: backend data compatibility client for legacy query-style frontend code.
- `frontend/src/services/backendDataService.ts`: renamed project/client data service that now targets the backend compatibility API.
- `scripts/run-release-checks.ps1`: add backend tests and compose validation.
- `DEPLOY-DOKPLOY-VPS.md`: rename/supersede with self-hosted backend wording.

---

## Task 1: Backend Skeleton And Health API

**Files:**
- Create: `backend/package.json`
- Create: `backend/tsconfig.json`
- Create: `backend/vitest.config.ts`
- Create: `backend/src/config/env.ts`
- Create: `backend/src/server.ts`
- Create: `backend/src/index.ts`
- Create: `backend/src/modules/health/routes.ts`
- Test: `backend/tests/health.test.ts`

- [ ] **Step 1: Create backend package manifest**

Create `backend/package.json`:

```json
{
  "name": "yux-backend",
  "version": "1.0.0",
  "type": "module",
  "private": true,
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node dist/index.js",
    "test": "vitest run",
    "type-check": "tsc --noEmit",
    "migrate": "tsx scripts/apply-migrations.ts",
    "worker": "tsx src/worker.ts"
  },
  "dependencies": {
    "@fastify/cookie": "^9.4.0",
    "@fastify/cors": "^9.0.1",
    "@fastify/helmet": "^11.1.1",
    "argon2": "^0.41.1",
    "bullmq": "^5.12.12",
    "drizzle-orm": "^0.36.4",
    "fastify": "^4.28.1",
    "ioredis": "^5.4.1",
    "pg": "^8.13.1",
    "zod": "^3.25.76"
  },
  "devDependencies": {
    "@types/node": "^22.10.1",
    "@types/pg": "^8.11.10",
    "tsx": "^4.19.2",
    "typescript": "^5.6.3",
    "vitest": "^4.1.7"
  }
}
```

- [ ] **Step 2: Create TypeScript config**

Create `backend/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "."
  },
  "include": ["src", "tests", "scripts"]
}
```

- [ ] **Step 3: Create Vitest config**

Create `backend/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/**/*.test.ts'],
  },
})
```

- [ ] **Step 4: Create env validator**

Create `backend/src/config/env.ts`:

```ts
import { z } from 'zod'

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1).default('redis://localhost:6379'),
  SESSION_COOKIE_NAME: z.string().default('yux_session'),
  SESSION_SECRET: z.string().min(32),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  YUX_AGENT_RUNTIME_URL: z.string().url().optional(),
  YUX_AGENT_RUNTIME_TOKEN: z.string().optional(),
})

export type AppEnv = z.infer<typeof envSchema>

export function loadEnv(input: NodeJS.ProcessEnv = process.env): AppEnv {
  return envSchema.parse(input)
}
```

- [ ] **Step 5: Create health routes**

Create `backend/src/modules/health/routes.ts`:

```ts
import type { FastifyInstance } from 'fastify'

export async function registerHealthRoutes(app: FastifyInstance) {
  app.get('/health', async () => ({
    status: 'ok',
    service: 'yux-backend-api',
  }))

  app.get('/ready', async () => ({
    status: 'ready',
    service: 'yux-backend-api',
  }))
}
```

- [ ] **Step 6: Create app factory**

Create `backend/src/server.ts`:

```ts
import cookie from '@fastify/cookie'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import Fastify from 'fastify'
import { loadEnv, type AppEnv } from './config/env.js'
import { registerHealthRoutes } from './modules/health/routes.js'

export async function buildServer(env: AppEnv = loadEnv()) {
  const app = Fastify({ logger: env.NODE_ENV !== 'test' })

  await app.register(helmet)
  await app.register(cookie, { secret: env.SESSION_SECRET })
  await app.register(cors, {
    origin: env.CORS_ORIGIN,
    credentials: true,
  })

  await app.register(registerHealthRoutes, { prefix: '/api' })

  return app
}
```

- [ ] **Step 7: Create production entrypoint**

Create `backend/src/index.ts`:

```ts
import { loadEnv } from './config/env.js'
import { buildServer } from './server.js'

const env = loadEnv()
const app = await buildServer(env)

await app.listen({ host: '0.0.0.0', port: env.PORT })
```

- [ ] **Step 8: Write health test**

Create `backend/tests/health.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
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

describe('health routes', () => {
  it('returns health status', async () => {
    const app = await buildServer(testEnv)
    const response = await app.inject({ method: 'GET', url: '/api/health' })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ status: 'ok', service: 'yux-backend-api' })
  })
})
```

- [ ] **Step 9: Install dependencies and verify**

Run:

```powershell
cd backend
npm install
npm test
npm run type-check
```

Expected:

```text
1 test passed
tsc exits 0
```

- [ ] **Step 10: Commit**

```powershell
git add backend/package.json backend/package-lock.json backend/tsconfig.json backend/vitest.config.ts backend/src backend/tests
git commit -m "feat: add self-hosted backend skeleton"
```

---

## Task 2: Dokploy Compose For Backend, Postgres, Redis, And Worker

**Files:**
- Modify: `docker-compose.dokploy.yml`
- Create: `backend/Dockerfile`
- Create: `backend/.env.example`
- Modify: `frontend/.env.example`

- [ ] **Step 1: Create backend Dockerfile**

Create `backend/Dockerfile`:

```Dockerfile
FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package*.json ./
EXPOSE 4000
CMD ["node", "dist/src/index.js"]
```

- [ ] **Step 2: Create backend env example**

Create `backend/.env.example`:

```bash
NODE_ENV=production
PORT=4000
DATABASE_URL=postgresql://yux_app:yux_app_password@yux-postgres:5432/yux_hub
REDIS_URL=redis://yux-redis:6379
SESSION_COOKIE_NAME=yux_session
SESSION_SECRET=development-only-session-secret-with-64-characters-change-in-production
CORS_ORIGIN=https://hub.yux.com.br
YUX_AGENT_RUNTIME_URL=http://yux-agent-harness-runtime:8080
YUX_AGENT_RUNTIME_TOKEN=development-only-runtime-token-change-in-production
```

- [ ] **Step 3: Replace compose with self-hosted services**

Modify `docker-compose.dokploy.yml` to include:

```yaml
services:
  yux-frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
      args:
        VITE_API_BASE_URL: ${VITE_API_BASE_URL:-/api}
    ports:
      - "${YUX_FRONTEND_PORT:-3000}:80"
    depends_on:
      - yux-backend-api
    restart: unless-stopped

  yux-backend-api:
    build:
      context: ./backend
      dockerfile: Dockerfile
    ports:
      - "${YUX_BACKEND_PORT:-4000}:4000"
    environment:
      NODE_ENV: production
      PORT: 4000
      DATABASE_URL: ${DATABASE_URL}
      REDIS_URL: ${REDIS_URL}
      SESSION_COOKIE_NAME: ${SESSION_COOKIE_NAME:-yux_session}
      SESSION_SECRET: ${SESSION_SECRET}
      CORS_ORIGIN: ${CORS_ORIGIN:-https://hub.yux.com.br}
      YUX_AGENT_RUNTIME_URL: ${YUX_AGENT_RUNTIME_URL:-http://yux-agent-harness-runtime:8080}
      YUX_AGENT_RUNTIME_TOKEN: ${YUX_AGENT_RUNTIME_TOKEN}
    depends_on:
      - yux-postgres
      - yux-redis
      - yux-agent-harness-runtime
    restart: unless-stopped

  yux-backend-worker:
    build:
      context: ./backend
      dockerfile: Dockerfile
    command: ["node", "dist/src/worker.js"]
    environment:
      NODE_ENV: production
      DATABASE_URL: ${DATABASE_URL}
      REDIS_URL: ${REDIS_URL}
      SESSION_SECRET: ${SESSION_SECRET}
      CORS_ORIGIN: ${CORS_ORIGIN:-https://hub.yux.com.br}
      YUX_AGENT_RUNTIME_URL: ${YUX_AGENT_RUNTIME_URL:-http://yux-agent-harness-runtime:8080}
      YUX_AGENT_RUNTIME_TOKEN: ${YUX_AGENT_RUNTIME_TOKEN}
    depends_on:
      - yux-postgres
      - yux-redis
      - yux-agent-harness-runtime
    restart: unless-stopped

  yux-postgres:
    image: postgres:17-alpine
    environment:
      POSTGRES_DB: ${POSTGRES_DB:-yux_hub}
      POSTGRES_USER: ${POSTGRES_USER:-yux_app}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - yux_postgres_data:/var/lib/postgresql/data
    restart: unless-stopped

  yux-redis:
    image: redis:7-alpine
    command: ["redis-server", "--appendonly", "yes"]
    volumes:
      - yux_redis_data:/data
    restart: unless-stopped

  yux-agent-harness-runtime:
    build:
      context: ./workers/marketing-studio-agent-runtime
      dockerfile: Dockerfile
    ports:
      - "${YUX_AGENT_RUNTIME_PORT:-8080}:8080"
    environment:
      YUX_AGENT_RUNTIME_TOKEN: ${YUX_AGENT_RUNTIME_TOKEN}
      SUPABASE_URL: ""
      SUPABASE_SERVICE_ROLE_KEY: ""
      OPENROUTER_API_KEY: ${OPENROUTER_API_KEY}
      JINA_API_KEY: ${JINA_API_KEY}
    restart: unless-stopped

volumes:
  yux_postgres_data:
  yux_redis_data:
```

- [ ] **Step 4: Update frontend env example**

Modify `frontend/.env.example`:

```bash
VITE_API_BASE_URL=/api
```

- [ ] **Step 5: Validate compose syntax**

Run:

```powershell
docker compose -f docker-compose.dokploy.yml config
```

Expected:

```text
services:
  yux-backend-api:
  yux-backend-worker:
  yux-frontend:
  yux-postgres:
  yux-redis:
```

- [ ] **Step 6: Commit**

```powershell
git add docker-compose.dokploy.yml backend/Dockerfile backend/.env.example frontend/.env.example
git commit -m "feat: wire self-hosted backend services"
```

---

## Task 3: Database Migration Runner And Auth Schema

**Files:**
- Create: `backend/src/db/client.ts`
- Create: `backend/src/db/schema/auth.ts`
- Create: `backend/src/db/schema/index.ts`
- Create: `backend/src/db/migrations/0001_auth_core.sql`
- Create: `backend/scripts/apply-migrations.ts`
- Test: `backend/tests/migration-runner.test.ts`

- [ ] **Step 1: Create database client**

Create `backend/src/db/client.ts`:

```ts
import { drizzle } from 'drizzle-orm/node-postgres'
import pg from 'pg'
import { loadEnv } from '../config/env.js'
import * as schema from './schema/index.js'

const { Pool } = pg

export function createPool(databaseUrl = loadEnv().DATABASE_URL) {
  return new Pool({ connectionString: databaseUrl })
}

export function createDb(databaseUrl?: string) {
  const pool = createPool(databaseUrl)
  return {
    pool,
    db: drizzle(pool, { schema }),
  }
}
```

- [ ] **Step 2: Create auth schema**

Create `backend/src/db/schema/auth.ts`:

```ts
import { pgTable, text, timestamp, uuid, jsonb, boolean, index } from 'drizzle-orm/pg-core'

export const appUsers = pgTable('app_users', {
  id: uuid('id').primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  displayName: text('display_name').notNull(),
  role: text('role').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const appSessions = pgTable('app_sessions', {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id').notNull().references(() => appUsers.id, { onDelete: 'cascade' }),
  sessionTokenHash: text('session_token_hash').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, table => ({
  userIdx: index('app_sessions_user_id_idx').on(table.userId),
}))

export const auditEvents = pgTable('audit_events', {
  id: uuid('id').primaryKey(),
  actorUserId: uuid('actor_user_id').references(() => appUsers.id, { onDelete: 'set null' }),
  organizationId: uuid('organization_id'),
  eventType: text('event_type').notNull(),
  resourceType: text('resource_type').notNull(),
  resourceId: uuid('resource_id'),
  metadata: jsonb('metadata').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
```

- [ ] **Step 3: Export schema**

Create `backend/src/db/schema/index.ts`:

```ts
export * from './auth.js'
```

- [ ] **Step 4: Create auth SQL migration**

Create `backend/src/db/migrations/0001_auth_core.sql`:

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS app_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('yux_admin', 'yux_operator', 'client_admin', 'client_member')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  session_token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS app_sessions_user_id_idx ON app_sessions(user_id);
CREATE INDEX IF NOT EXISTS app_sessions_expires_at_idx ON app_sessions(expires_at);

CREATE TABLE IF NOT EXISTS audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID REFERENCES app_users(id) ON DELETE SET NULL,
  organization_id UUID,
  event_type TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

- [ ] **Step 5: Create migration runner**

Create `backend/scripts/apply-migrations.ts`:

```ts
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createPool } from '../src/db/client.js'

const dirname = path.dirname(fileURLToPath(import.meta.url))
const migrationsDir = path.resolve(dirname, '../src/db/migrations')
const pool = createPool()

await pool.query(`
  CREATE TABLE IF NOT EXISTS schema_migrations (
    version TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`)

const files = (await readdir(migrationsDir)).filter(file => file.endsWith('.sql')).sort()

for (const file of files) {
  const version = file.replace(/\.sql$/, '')
  const existing = await pool.query('SELECT 1 FROM schema_migrations WHERE version = $1', [version])
  if (existing.rowCount) continue

  const sql = await readFile(path.join(migrationsDir, file), 'utf8')
  await pool.query('BEGIN')
  try {
    await pool.query(sql)
    await pool.query('INSERT INTO schema_migrations(version) VALUES ($1)', [version])
    await pool.query('COMMIT')
    console.log(`applied ${version}`)
  } catch (error) {
    await pool.query('ROLLBACK')
    throw error
  }
}

await pool.end()
```

- [ ] **Step 6: Validate against Postgres**

Run after Postgres is available:

```powershell
cd backend
$env:DATABASE_URL = "postgresql://yux_app:<password>@localhost:5432/yux_hub"
npm run migrate
```

Expected:

```text
applied 0001_auth_core
```

- [ ] **Step 7: Commit**

```powershell
git add backend/src/db backend/scripts/apply-migrations.ts
git commit -m "feat: add postgres migration runner and auth schema"
```

---

## Task 4: Backend Auth And Session Routes

**Files:**
- Create: `backend/src/auth/password.ts`
- Create: `backend/src/auth/session.ts`
- Create: `backend/src/auth/routes.ts`
- Modify: `backend/src/server.ts`
- Test: `backend/tests/auth.test.ts`

- [ ] **Step 1: Create password helpers**

Create `backend/src/auth/password.ts`:

```ts
import argon2 from 'argon2'

export function hashPassword(password: string) {
  if (password.length < 10) throw new Error('password_too_short')
  return argon2.hash(password)
}

export function verifyPassword(hash: string, password: string) {
  return argon2.verify(hash, password)
}
```

- [ ] **Step 2: Create session helpers**

Create `backend/src/auth/session.ts`:

```ts
import crypto from 'node:crypto'

export function createSessionToken() {
  return crypto.randomBytes(32).toString('base64url')
}

export function hashSessionToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex')
}

export function sessionExpiry(days = 14) {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return date
}
```

- [ ] **Step 3: Create auth routes**

Create `backend/src/auth/routes.ts`:

```ts
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { hashSessionToken, createSessionToken, sessionExpiry } from './session.js'
import { verifyPassword } from './password.js'

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

export async function registerAuthRoutes(app: FastifyInstance) {
  app.post('/login', async (request, reply) => {
    const input = loginSchema.parse(request.body)
    const db = app.pg
    const userResult = await db.query(
      'SELECT id, email, password_hash, display_name, role, is_active FROM app_users WHERE lower(email) = lower($1)',
      [input.email],
    )
    const user = userResult.rows[0]
    if (!user || !user.is_active) return reply.code(401).send({ error: 'invalid_credentials' })

    const ok = await verifyPassword(user.password_hash, input.password)
    if (!ok) return reply.code(401).send({ error: 'invalid_credentials' })

    const token = createSessionToken()
    await db.query(
      'INSERT INTO app_sessions(user_id, session_token_hash, expires_at) VALUES ($1, $2, $3)',
      [user.id, hashSessionToken(token), sessionExpiry()],
    )

    reply.setCookie('yux_session', token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
    })

    return {
      user: {
        id: user.id,
        email: user.email,
        displayName: user.display_name,
        role: user.role,
      },
    }
  })

  app.post('/logout', async (request, reply) => {
    const token = request.cookies.yux_session
    if (token) {
      await app.pg.query('DELETE FROM app_sessions WHERE session_token_hash = $1', [hashSessionToken(token)])
    }
    reply.clearCookie('yux_session', { path: '/' })
    return { ok: true }
  })

  app.get('/me', async (request, reply) => {
    const token = request.cookies.yux_session
    if (!token) return reply.code(401).send({ error: 'not_authenticated' })

    const result = await app.pg.query(
      `SELECT u.id, u.email, u.display_name, u.role
       FROM app_sessions s
       JOIN app_users u ON u.id = s.user_id
       WHERE s.session_token_hash = $1 AND s.expires_at > NOW() AND u.is_active = TRUE`,
      [hashSessionToken(token)],
    )
    const user = result.rows[0]
    if (!user) return reply.code(401).send({ error: 'not_authenticated' })

    return {
      user: {
        id: user.id,
        email: user.email,
        displayName: user.display_name,
        role: user.role,
      },
    }
  })
}
```

- [ ] **Step 4: Register routes and decorate Postgres pool**

Modify `backend/src/server.ts`:

```ts
import pg from 'pg'
import { registerAuthRoutes } from './auth/routes.js'

declare module 'fastify' {
  interface FastifyInstance {
    pg: pg.Pool
  }
}

// inside buildServer, after app creation:
const pool = new pg.Pool({ connectionString: env.DATABASE_URL })
app.decorate('pg', pool)
app.addHook('onClose', async () => pool.end())
await app.register(registerAuthRoutes, { prefix: '/api/auth' })
```

- [ ] **Step 5: Add auth test with mocked pool**

Create `backend/tests/auth.test.ts` with focused password/session tests first:

```ts
import { describe, expect, it } from 'vitest'
import { createSessionToken, hashSessionToken } from '../src/auth/session.js'
import { hashPassword, verifyPassword } from '../src/auth/password.js'

describe('auth helpers', () => {
  it('hashes and verifies passwords', async () => {
    const hash = await hashPassword('correct-horse-password')
    await expect(verifyPassword(hash, 'correct-horse-password')).resolves.toBe(true)
    await expect(verifyPassword(hash, 'wrong-password')).resolves.toBe(false)
  })

  it('hashes session tokens deterministically without storing plaintext', () => {
    const token = createSessionToken()
    const hash = hashSessionToken(token)
    expect(hash).toHaveLength(64)
    expect(hash).not.toBe(token)
    expect(hashSessionToken(token)).toBe(hash)
  })
})
```

- [ ] **Step 6: Run tests**

```powershell
cd backend
npm test
npm run type-check
```

Expected:

```text
auth helpers tests pass
tsc exits 0
```

- [ ] **Step 7: Commit**

```powershell
git add backend/src/auth backend/src/server.ts backend/tests/auth.test.ts
git commit -m "feat: add backend cookie auth"
```

---

## Task 5: Authorization Policy Layer

**Files:**
- Create: `backend/src/policies/authorization.ts`
- Create: `backend/src/http/errors.ts`
- Create: `backend/src/http/request-context.ts`
- Test: `backend/tests/policies.test.ts`

- [ ] **Step 1: Create API error helpers**

Create `backend/src/http/errors.ts`:

```ts
export class ApiError extends Error {
  constructor(public statusCode: number, public code: string) {
    super(code)
  }
}

export function unauthorized() {
  return new ApiError(401, 'not_authenticated')
}

export function forbidden() {
  return new ApiError(403, 'forbidden')
}
```

- [ ] **Step 2: Create request context types**

Create `backend/src/http/request-context.ts`:

```ts
export type UserRole = 'yux_admin' | 'yux_operator' | 'client_admin' | 'client_member'

export type RequestContext = {
  userId: string
  role: UserRole
  organizationIds: string[]
  activeOrganizationId?: string
  enabledModuleKeys: string[]
}
```

- [ ] **Step 3: Create authorization policy**

Create `backend/src/policies/authorization.ts`:

```ts
import { forbidden } from '../http/errors.js'
import type { RequestContext } from '../http/request-context.js'

type Operation =
  | 'platform.read'
  | 'platform.manage'
  | 'crm.read'
  | 'crm.write'
  | 'automations.read'
  | 'automations.write'
  | 'omnichannel.read'
  | 'omnichannel.write'
  | 'strategy.manage'

type Resource = {
  organizationId?: string | null
  moduleKey?: string
}

export function canAccess(ctx: RequestContext, operation: Operation, resource: Resource = {}) {
  if (ctx.role === 'yux_admin') return true

  if (operation === 'platform.manage' || operation === 'strategy.manage') return false

  if (resource.organizationId && !ctx.organizationIds.includes(resource.organizationId)) return false

  if (resource.moduleKey && !ctx.enabledModuleKeys.includes(resource.moduleKey)) return false

  if (ctx.role === 'yux_operator') return operation.endsWith('.read') || operation.endsWith('.write')
  if (ctx.role === 'client_admin') return !operation.startsWith('platform.')
  if (ctx.role === 'client_member') return operation.endsWith('.read')

  return false
}

export function requireAccess(ctx: RequestContext, operation: Operation, resource: Resource = {}) {
  if (!canAccess(ctx, operation, resource)) throw forbidden()
}
```

- [ ] **Step 4: Create policy tests**

Create `backend/tests/policies.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { canAccess, requireAccess } from '../src/policies/authorization.js'
import type { RequestContext } from '../src/http/request-context.js'

const clientCtx: RequestContext = {
  userId: 'user-1',
  role: 'client_member',
  organizationIds: ['org-1'],
  activeOrganizationId: 'org-1',
  enabledModuleKeys: ['crm'],
}

describe('authorization policy', () => {
  it('allows yux_admin to manage strategy', () => {
    expect(canAccess({ ...clientCtx, role: 'yux_admin' }, 'strategy.manage')).toBe(true)
  })

  it('denies client member writes', () => {
    expect(canAccess(clientCtx, 'crm.write', { organizationId: 'org-1', moduleKey: 'crm' })).toBe(false)
  })

  it('denies cross-organization reads', () => {
    expect(canAccess(clientCtx, 'crm.read', { organizationId: 'org-2', moduleKey: 'crm' })).toBe(false)
  })

  it('throws forbidden for unauthorized operations', () => {
    expect(() => requireAccess(clientCtx, 'platform.manage')).toThrow('forbidden')
  })
})
```

- [ ] **Step 5: Run tests**

```powershell
cd backend
npm test
```

Expected:

```text
authorization policy tests pass
```

- [ ] **Step 6: Commit**

```powershell
git add backend/src/policies backend/src/http backend/tests/policies.test.ts
git commit -m "feat: add backend authorization policy"
```

---

## Task 6: Frontend API Client And Auth Migration

**Files:**
- Create: `frontend/src/lib/apiClient.ts`
- Create: `frontend/src/services/backendAuthService.ts`
- Modify: `frontend/src/stores/authStore.ts`
- Modify: `frontend/src/vite-env.d.ts`
- Test: `frontend/src/services/backendAuthService.test.ts`

- [ ] **Step 1: Create API client**

Create `frontend/src/lib/apiClient.ts`:

```ts
const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL as string | undefined) || '/api'

export class ApiClientError extends Error {
  constructor(public status: number, public code: string) {
    super(code)
  }
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  })

  const body = response.status === 204 ? null : await response.json().catch(() => null)
  if (!response.ok) {
    throw new ApiClientError(response.status, body?.error || 'request_failed')
  }
  return body as T
}
```

- [ ] **Step 2: Create backend auth service**

Create `frontend/src/services/backendAuthService.ts`:

```ts
import { apiRequest } from '@/lib/apiClient'

export type BackendUser = {
  id: string
  email: string
  displayName: string
  role: 'yux_admin' | 'yux_operator' | 'client_admin' | 'client_member'
}

export async function backendLogin(email: string, password: string) {
  return apiRequest<{ user: BackendUser }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
}

export async function backendLogout() {
  return apiRequest<{ ok: true }>('/auth/logout', { method: 'POST' })
}

export async function backendMe() {
  return apiRequest<{ user: BackendUser }>('/auth/me')
}
```

- [ ] **Step 3: Update Vite env types**

Modify `frontend/src/vite-env.d.ts`:

```ts
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
```

- [ ] **Step 4: Write auth service tests**

Create `frontend/src/services/backendAuthService.test.ts`:

```ts
import { describe, expect, it, vi, afterEach } from 'vitest'
import { backendLogin, backendLogout, backendMe } from './backendAuthService'

afterEach(() => vi.restoreAllMocks())

describe('backendAuthService', () => {
  it('posts login credentials to backend auth', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      user: { id: 'u1', email: 'admin@yux.com.br', displayName: 'Admin', role: 'yux_admin' },
    }), { status: 200 })))

    const result = await backendLogin('admin@yux.com.br', 'password')
    expect(result.user.role).toBe('yux_admin')
    expect(fetch).toHaveBeenCalledWith('/api/auth/login', expect.objectContaining({ method: 'POST', credentials: 'include' }))
  })

  it('loads current backend user', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      user: { id: 'u1', email: 'admin@yux.com.br', displayName: 'Admin', role: 'yux_admin' },
    }), { status: 200 })))

    const result = await backendMe()
    expect(result.user.email).toBe('admin@yux.com.br')
  })

  it('logs out through backend', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })))
    await expect(backendLogout()).resolves.toEqual({ ok: true })
  })
})
```

- [ ] **Step 5: Update auth store**

Modify `frontend/src/stores/authStore.ts` so login/logout/session use backend auth service instead of Supabase auth:

```ts
import { backendLogin, backendLogout, backendMe } from '@/services/backendAuthService'
```

Replace the Supabase sign-in call with:

```ts
const { user } = await backendLogin(email, password)
set({
  user: {
    id: user.id,
    email: user.email,
    name: user.displayName,
    role: user.role === 'yux_admin' ? 'ADMIN' : user.role === 'yux_operator' ? 'MANAGER' : 'CLIENT',
  },
  isAuthenticated: true,
  isLoading: false,
})
```

Replace sign-out with:

```ts
await backendLogout()
set({ user: null, isAuthenticated: false, isLoading: false })
```

Replace session bootstrap with:

```ts
const { user } = await backendMe()
set({
  user: {
    id: user.id,
    email: user.email,
    name: user.displayName,
    role: user.role === 'yux_admin' ? 'ADMIN' : user.role === 'yux_operator' ? 'MANAGER' : 'CLIENT',
  },
  isAuthenticated: true,
  isLoading: false,
})
```

- [ ] **Step 6: Run focused frontend tests**

```powershell
cd frontend
npm test -- backendAuthService.test.ts
npm run type-check
```

Expected:

```text
backendAuthService tests pass
type-check exits 0
```

- [ ] **Step 7: Commit**

```powershell
git add frontend/src/lib/apiClient.ts frontend/src/services/backendAuthService.ts frontend/src/services/backendAuthService.test.ts frontend/src/stores/authStore.ts frontend/src/vite-env.d.ts
git commit -m "feat: migrate frontend auth to backend api"
```

---

## Task 7: Convert Supabase Migrations Into Backend Postgres Bootstrap

**Files:**
- Create: `backend/src/db/migrations/0100_portal_schema.sql`
- Create: `backend/scripts/create-admin-user.ts`
- Create: `scripts/convert-supabase-migrations.ps1`
- Test: `backend/tests/schema-smoke.test.ts`

- [x] **Step 1: Create conversion script**

Create `scripts/convert-supabase-migrations.ps1`:

```powershell
$ErrorActionPreference = 'Stop'
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$source = Join-Path $repoRoot 'supabase/migrations'
$target = Join-Path $repoRoot 'backend/src/db/migrations/0100_portal_schema.sql'

$files = Get-ChildItem $source -Filter '*.sql' | Sort-Object Name
$header = @'
-- Portal YUX self-hosted schema bootstrap.
-- Generated from reviewed Supabase migration files.
-- Application authorization is enforced by backend policies.

'@

Set-Content -Path $target -Value $header -Encoding UTF8
foreach ($file in $files) {
  Add-Content -Path $target -Value "`n-- source: $($file.Name)`n" -Encoding UTF8
  Get-Content -Path $file.FullName -Encoding UTF8 |
    Where-Object { $_ -notmatch 'auth\.uid\(\)' } |
    Add-Content -Path $target -Encoding UTF8
}

Write-Host "Wrote $target"
```

- [x] **Step 2: Run conversion script**

```powershell
.\scripts\convert-supabase-migrations.ps1
```

Expected:

```text
Wrote backend/src/db/migrations/0100_portal_schema.sql
```

- [x] **Step 3: Manually review generated SQL**

Run:

```powershell
rg -n "auth\.uid|auth\.role|supabase|storage\.|vault\.|extensions\.http" backend/src/db/migrations/0100_portal_schema.sql
```

Expected:

```text
No auth.uid/auth.role remains.
Any storage/vault/http references are reviewed and either removed or replaced before applying.
```

- [x] **Step 4: Create admin bootstrap script**

Create `backend/scripts/create-admin-user.ts`:

```ts
import { randomUUID } from 'node:crypto'
import { createPool } from '../src/db/client.js'
import { hashPassword } from '../src/auth/password.js'

const email = process.env.ADMIN_EMAIL || 'admin@yux.com.br'
const password = process.env.ADMIN_PASSWORD

if (!password) {
  throw new Error('ADMIN_PASSWORD is required')
}

const pool = createPool()
const passwordHash = await hashPassword(password)

await pool.query(
  `INSERT INTO app_users (id, email, password_hash, display_name, role)
   VALUES ($1, $2, $3, $4, $5)
   ON CONFLICT (email)
   DO UPDATE SET password_hash = EXCLUDED.password_hash, is_active = TRUE, updated_at = NOW()`,
  [randomUUID(), email, passwordHash, 'Admin YUX', 'yux_admin'],
)

await pool.end()
console.log(`admin user ready: ${email}`)
```

Run this command only from a trusted operator machine or inside the backend container with a temporary environment variable. Do not commit `ADMIN_PASSWORD`.

- [ ] **Step 5: Apply migrations to disposable Postgres**

Status on 2026-06-27: pending on this workstation because neither `docker` nor `psql` is available in PATH. The generated migration was statically reviewed by smoke tests and forbidden Supabase runtime pattern scans; apply it on the VPS or a machine with Postgres available before production cutover.

```powershell
cd backend
$env:DATABASE_URL = "postgresql://yux_app:<password>@localhost:5432/yux_hub"
npm run migrate
$env:ADMIN_PASSWORD = "<type-password-in-shell-history-safe-context>"
npx tsx scripts/create-admin-user.ts
```

Expected:

```text
applied 0001_auth_core
applied 0100_portal_schema
admin user ready: admin@yux.com.br
```

- [ ] **Step 6: Commit**

```powershell
git add scripts/convert-supabase-migrations.ps1 backend/src/db/migrations/0100_portal_schema.sql backend/scripts/create-admin-user.ts
git commit -m "feat: add self-hosted portal schema migrations"
```

---

## Task 8: Core Platform API Routes

**Files:**
- Create: `backend/src/modules/platform/routes.ts`
- Create: `backend/src/modules/platform/repository.ts`
- Modify: `backend/src/server.ts`
- Test: `backend/tests/platform-routes.test.ts`

- [x] **Step 1: Create platform repository**

Create `backend/src/modules/platform/repository.ts`:

```ts
import type pg from 'pg'

export async function getPlatformContext(pool: pg.Pool, userId: string) {
  const memberships = await pool.query(
    `SELECT organization_id, role, enabled_module_keys
     FROM organization_memberships
     WHERE user_id = $1 AND status = 'active'
     ORDER BY created_at ASC`,
    [userId],
  )

  return {
    memberships: memberships.rows,
    activeOrganizationId: memberships.rows[0]?.organization_id ?? null,
    enabledModuleKeys: memberships.rows[0]?.enabled_module_keys ?? [],
  }
}
```

- [x] **Step 2: Create platform routes**

Create `backend/src/modules/platform/routes.ts`:

```ts
import type { FastifyInstance } from 'fastify'
import { getPlatformContext } from './repository.js'

export async function registerPlatformRoutes(app: FastifyInstance) {
  app.get('/context', async (request, reply) => {
    const user = request.user
    if (!user) return reply.code(401).send({ error: 'not_authenticated' })
    return getPlatformContext(app.pg, user.id)
  })
}
```

- [x] **Step 3: Add request user decoration**

Implemented as a route-local authenticated session resolver using the shared `authStore` and signed session cookie, instead of a broad `request.user` decoration.

Extend `backend/src/server.ts` after auth helper work:

```ts
declare module 'fastify' {
  interface FastifyRequest {
    user?: { id: string; email: string; role: string }
  }
}
```

Add a preHandler that loads `request.user` from `yux_session` for `/api/platform/*`.

- [x] **Step 4: Register platform routes**

Modify `backend/src/server.ts`:

```ts
import { registerPlatformRoutes } from './modules/platform/routes.js'

await app.register(registerPlatformRoutes, { prefix: '/api/platform' })
```

- [x] **Step 5: Add route test**

Create `backend/tests/platform-routes.test.ts` with a mocked authenticated context or integration DB fixture. The first assertion should verify unauthenticated access returns `401`:

```ts
import { describe, expect, it } from 'vitest'
import { buildServer } from '../src/server.js'

describe('platform routes', () => {
  it('rejects unauthenticated platform context requests', async () => {
    const app = await buildServer({
      NODE_ENV: 'test',
      PORT: 4000,
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/yux_test',
      REDIS_URL: 'redis://localhost:6379',
      SESSION_COOKIE_NAME: 'yux_session',
      SESSION_SECRET: 'test-secret-value-with-at-least-32-chars',
      CORS_ORIGIN: 'http://localhost:3000',
    })

    const response = await app.inject({ method: 'GET', url: '/api/platform/context' })
    expect(response.statusCode).toBe(401)
  })
})
```

- [ ] **Step 6: Commit**

```powershell
git add backend/src/modules/platform backend/src/server.ts backend/tests/platform-routes.test.ts
git commit -m "feat: add platform context api"
```

---

## Task 9: Migrate Frontend Services Module By Module

**Files:**
- Modify: `frontend/src/services/backendDataService.ts`
- Modify: `frontend/src/services/platformService.ts`
- Modify: `frontend/src/services/crmService.ts`
- Modify: `frontend/src/services/automationService.ts`
- Modify: `frontend/src/services/omnichannelService.ts`
- Modify: `frontend/src/services/marketingStudioService.ts`
- Modify: `frontend/src/services/strategyEngineService.ts`
- Create backend route/repository files per module under `backend/src/modules/*`

- [x] **Step 1: Start with read-only platform endpoints**

Add backend endpoints:

```text
GET /api/platform/modules
GET /api/platform/contracts
GET /api/platform/blueprints
```

Then change only `frontend/src/services/platformService.ts` to call `apiRequest`.

- [x] **Step 2: Run platform tests**

```powershell
cd frontend
npm test -- platformService accessControl navigation
npm run type-check
```

Expected: platform tests pass before moving to CRM.

- [x] **Step 3: Migrate CRM endpoints**

Add backend endpoints:

```text
GET /api/crm/leads
POST /api/crm/leads
PATCH /api/crm/leads/:id
GET /api/crm/leads/:id/interactions
POST /api/crm/leads/:id/interactions
GET /api/crm/leads/:id/tasks
POST /api/crm/leads/:id/tasks
```

Change `frontend/src/services/crmService.ts` to use `apiRequest`.

- [x] **Step 4: Run CRM tests**

```powershell
cd frontend
npm test -- crmService followUpRules pipelineRules conversationRules
npm run type-check
```

- [x] **Step 5: Migrate automations endpoints**

Status on 2026-06-27: flow CRUD, trigger/condition/action CRUD, simulation persistence, version persistence, active-version updates, dispatch queueing, CRM sequences/enrollments/executions, and organization material upload/storage now run through the backend API. Material files are stored on the VPS through `MATERIALS_STORAGE_DIR`, backed by the `yux_materials_data` Docker volume.

Add backend endpoints:

```text
GET /api/automations/flows
POST /api/automations/flows
PATCH /api/automations/flows/:id
DELETE /api/automations/flows/:id
POST /api/automations/simulations
POST /api/automations/dispatch
```

Move dispatch behavior from Supabase function logic into backend service and BullMQ job.

- [x] **Step 6: Migrate remaining modules in this order**

1. `proposalService` - completed on 2026-06-27. Protected proposal CRUD, diagnostics, price rules, versioning, send/public token flow, portal/public decisions, generation fallback, conversion retry job and frontend service now use the VPS backend API.
2. `omnichannelService` - completed on 2026-06-27. Inbox, portal inbox, conversation detail/messages, teams, queues, handoff rules/events, settings, widgets, knowledge base, metrics, webhook logs, human replies, scheduling and outbound retry/simulation now use the VPS backend API and BullMQ jobs.
3. CRM sequence scheduler - completed on 2026-06-27. Due enrollments are scanned by `backend/src/modules/crm/scheduler.ts`, the worker processes pending `automation_executions`, internal sequence steps create `lead_tasks`, and external email/WhatsApp steps call `N8N_CRM_WEBHOOK_URL`.
4. VPS file storage - completed for organization materials and omnichannel message attachments on 2026-06-27. Materials use `MATERIALS_STORAGE_DIR`; message attachments use `OMNICHANNEL_ATTACHMENTS_DIR` and the `yux_omnichannel_attachments_data` Docker volume. The old Supabase Storage signed-upload path is no longer used by the webchat runtime.
5. Public webchat - completed for the Edge Function replacement on 2026-06-27. `frontend/public/yux-webchat.js` and `WebchatWidget` now call `/api/public/webchat/events`; the backend registers `backend/src/modules/webchat/routes.ts`.
6. `marketingStudioService`, `campaignService`, `reportService`, `strategyEngineService`, `financeService`, and `supportService` - runtime migration completed on 2026-06-27 through `frontend/src/lib/backendDataClient.ts`, `frontend/src/services/backendDataService.ts`, `POST /api/data/query`, `POST /api/data/rpc`, and `POST /api/functions/:name`. These modules no longer import `@supabase/supabase-js` or call Supabase URLs from the browser.
7. Domain hardening still required after cutover: replace the generic compatibility paths with explicit backend services for complex joins, realtime subscriptions, and provider side effects that are currently queued through compatibility jobs.

For each service:

```powershell
rg -n "Supabase|supabase|@/lib/supabase|@supabase/supabase-js|VITE_SUPABASE|functions/v1|@/services/supabaseService" frontend/src frontend/package.json frontend/package-lock.json frontend/.env frontend/.env.local
npm test -- <service-name>
npm run type-check
```

Expected: no Supabase runtime references remain in frontend source, package manifests, or browser env files.

- [ ] **Step 7: Commit after each module**

Use commit messages:

```powershell
git commit -m "feat: migrate platform data to backend api"
git commit -m "feat: migrate crm data to backend api"
git commit -m "feat: migrate automations to backend api"
```

---

## Task 10: Replace Edge Functions With Backend Routes And Jobs

**Files:**
- Create: `backend/src/jobs/queue.ts`
- Create: `backend/src/worker.ts`
- Create: `backend/src/modules/automations/jobs.ts`
- Create: `backend/src/modules/omnichannel/jobs.ts`
- Create: `backend/src/modules/integrations/routes.ts`
- Create: `backend/src/lib/edge-compat/*`
- Create: `backend/tests/edge-compat/*.test.ts`
- Create: `backend/src/modules/public/routes.ts`
- Modify: `backend/src/server.ts`
- Test: `backend/tests/jobs.test.ts`

- [ ] **Step 1: Create queue factory**

Create `backend/src/jobs/queue.ts`:

```ts
import { Queue, Worker } from 'bullmq'
import IORedis from 'ioredis'
import { loadEnv } from '../config/env.js'

export type JobName =
  | 'automation.dispatch'
  | 'omnichannel.processMessage'
  | 'provider.syncMetrics'
  | 'email.send'
  | 'strategy.adminChat'

export function createRedisConnection(redisUrl = loadEnv().REDIS_URL) {
  return new IORedis(redisUrl, { maxRetriesPerRequest: null })
}

export function createQueue(name = 'yux-jobs') {
  return new Queue(name, { connection: createRedisConnection() })
}

export function createWorker(processor: (job: { name: string; data: unknown }) => Promise<unknown>) {
  return new Worker('yux-jobs', processor, { connection: createRedisConnection() })
}
```

- [ ] **Step 2: Create worker entrypoint**

Create `backend/src/worker.ts`:

```ts
import { createWorker } from './jobs/queue.js'

const worker = createWorker(async job => {
  if (job.name === 'automation.dispatch') return { ok: true }
  if (job.name === 'omnichannel.processMessage') return { ok: true }
  if (job.name === 'provider.syncMetrics') return { ok: true }
  if (job.name === 'email.send') return { ok: true }
  if (job.name === 'strategy.adminChat') return { ok: true }
  throw new Error(`unknown_job:${job.name}`)
})

worker.on('completed', job => console.log(`completed ${job.name}:${job.id}`))
worker.on('failed', (job, error) => console.error(`failed ${job?.name}:${job?.id}`, error))
```

- [ ] **Step 3: Map Edge Functions to backend routes**

Create routes:

```text
POST /api/automations/dispatch
POST /api/omnichannel/process-ai-message
POST /api/webhooks/meta/channel-event
POST /api/public/webchat/events
POST /api/strategy-engine/admin-chat
POST /api/integrations/marketing/start
POST /api/integrations/marketing/complete
POST /api/integrations/marketing/publish
POST /api/public/proposals/:token/decision
```

Each route validates request body with Zod, authorizes the current user or webhook secret, then either executes synchronously or enqueues a BullMQ job.

- [ ] **Step 4: Add idempotency tests**

Create `backend/tests/jobs.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

function idempotencyKey(parts: Array<string | number | null | undefined>) {
  return parts.filter(part => part !== null && part !== undefined).join(':')
}

describe('job idempotency', () => {
  it('builds stable keys for automation dispatches', () => {
    expect(idempotencyKey(['automation', 'flow-1', 'event-1'])).toBe('automation:flow-1:event-1')
  })

  it('builds stable keys for inbound channel events', () => {
    expect(idempotencyKey(['channel', 'meta', 'message-1'])).toBe('channel:meta:message-1')
  })
})
```

- [ ] **Step 5: Commit**

```powershell
git add backend/src/jobs backend/src/worker.ts backend/src/modules backend/tests/jobs.test.ts
git commit -m "feat: replace edge functions with backend jobs"
```

---

## Task 11: Agent Harness Runtime Integration Without Supabase

**Files:**
- Modify: `workers/marketing-studio-agent-runtime/yux_agent_runtime/api.py`
- Modify: `workers/marketing-studio-agent-runtime/yux_agent_runtime/runtime_store.py`
- Modify: `workers/marketing-studio-agent-runtime/docker-compose.yml`
- Create: `backend/src/modules/strategy-engine/agentRuntimeClient.ts`
- Test: `workers/marketing-studio-agent-runtime/tests/test_agent_harness_runtime.py`
- Test: `backend/tests/agent-runtime-client.test.ts`

- [ ] **Step 1: Add backend runtime client**

Create `backend/src/modules/strategy-engine/agentRuntimeClient.ts`:

```ts
import { loadEnv } from '../../config/env.js'

export async function executeAgentWorkflow(input: Record<string, unknown>) {
  const env = loadEnv()
  if (!env.YUX_AGENT_RUNTIME_URL) throw new Error('agent_runtime_not_configured')

  const response = await fetch(`${env.YUX_AGENT_RUNTIME_URL.replace(/\/$/, '')}/workflows/execute`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(env.YUX_AGENT_RUNTIME_TOKEN ? { Authorization: `Bearer ${env.YUX_AGENT_RUNTIME_TOKEN}` } : {}),
    },
    body: JSON.stringify(input),
  })

  const body = await response.json().catch(() => null)
  if (!response.ok) throw new Error(body?.detail || 'agent_runtime_failed')
  return body
}
```

- [ ] **Step 2: Remove required Supabase envs from runtime compose**

Modify `workers/marketing-studio-agent-runtime/docker-compose.yml` so Supabase envs are not required for local runtime boot:

```yaml
environment:
  YUX_AGENT_RUNTIME_TOKEN: ${YUX_AGENT_RUNTIME_TOKEN}
  OPENROUTER_API_KEY: ${OPENROUTER_API_KEY}
  JINA_API_KEY: ${JINA_API_KEY}
```

- [ ] **Step 3: Add runtime persistence decision**

Keep the runtime in-memory store for first migration release, but send durable run records to backend API in a follow-up task after backend strategy routes exist. The production durable source of truth is Postgres through `yux-backend-api`.

- [ ] **Step 4: Run runtime tests**

```powershell
cd workers/marketing-studio-agent-runtime
python -m unittest discover tests
```

Expected: all existing runtime tests pass.

- [ ] **Step 5: Commit**

```powershell
git add backend/src/modules/strategy-engine workers/marketing-studio-agent-runtime
git commit -m "feat: connect backend to agent harness runtime"
```

---

## Task 12: Remove Supabase Runtime Dependency From Frontend

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/package-lock.json`
- Delete: `frontend/src/lib/supabase.ts`
- Create: `frontend/src/lib/backendDataClient.ts`
- Rename: `frontend/src/services/supabaseService.ts` to `frontend/src/services/backendDataService.ts`
- Modify all frontend files still importing `@/lib/supabase` or `@/services/supabaseService`

- [x] **Step 1: Find remaining runtime imports**

Run:

```powershell
rg -n "Supabase|supabase|@/lib/supabase|@supabase/supabase-js|VITE_SUPABASE|functions/v1|@/services/supabaseService" frontend/src frontend/package.json frontend/package-lock.json frontend/.env frontend/.env.local
```

Status on 2026-06-27: returned no frontend matches after replacing the package client with `backendDataClient`, renaming `supabaseService` to `backendDataService`, and updating user-facing/test strings.

- [x] **Step 2: Migrate each remaining file**

For every file in the search result:

1. Add backend route if missing.
2. Add or update frontend service method using `apiRequest`.
3. Replace direct Supabase call.
4. Run focused test for the affected service/component.

- [x] **Step 3: Remove package dependency**

Run:

```powershell
cd frontend
npm uninstall @supabase/supabase-js
npm run type-check
npm test
```

Expected:

```text
No TypeScript errors.
No runtime import of @supabase/supabase-js.
```

Status on 2026-06-27: `@supabase/supabase-js` was removed from `frontend/package.json` and `frontend/package-lock.json`. Runtime reads/writes now go through `/api/data/query`, `/api/data/rpc`, and `/api/functions/:name`.

- [ ] **Step 4: Commit**

```powershell
git add frontend/package.json frontend/package-lock.json frontend/src
git commit -m "refactor: remove supabase frontend runtime"
```

Status on 2026-06-27: not committed in this working tree because the operator did not request a commit.

---

## Task 12B: Remove Supabase Edge Function Runtime Artifacts

**Files:**
- Create: `backend/src/lib/edge-compat/*`
- Create: `backend/tests/edge-compat/*.test.ts`
- Delete: `supabase/functions/`
- Delete: `supabase/config.toml`
- Delete: `supabase/seed.sql`
- Modify: `scripts/run-release-checks.ps1`

- [x] **Step 1: Port shared Edge helpers to backend**

Status on 2026-06-27: shared helpers formerly tested under `supabase/functions/_shared` were copied to `backend/src/lib/edge-compat`, with Node-compatible `process.env` access replacing `Deno.env.get`.

- [x] **Step 2: Port Deno shared tests to Vitest**

Status on 2026-06-27: the former 54 shared Edge Function tests now run inside the backend Vitest suite under `backend/tests/edge-compat`.

- [x] **Step 3: Remove Deno checks from release script**

Status on 2026-06-27: `scripts/run-release-checks.ps1` no longer requires Deno or `supabase/functions`.

- [x] **Step 4: Remove Edge Function source/config and legacy Supabase folders**

Status on 2026-06-27: `supabase/functions/`, `supabase/config.toml`, `supabase/seed.sql`, `supabase/migrations`, `supabase/probes`, `supabase/legacy-migrations`, and the Supabase conversion/probe scripts were removed from the active codebase. The active database path is `backend/src/db/migrations/`.

---

## Task 13: Release Checks And Operational Runbook

**Files:**
- Modify: `scripts/run-release-checks.ps1`
- Create: `docs/backend-vps-runbook.md`
- Modify: `DEPLOY-DOKPLOY-VPS.md`
- Modify: `README.md`
- Modify: `QUICK-START.md`

- [ ] **Step 1: Update release script**

Modify `scripts/run-release-checks.ps1` to run backend checks before frontend:

```powershell
$backendRoot = Join-Path $repoRoot 'backend'

Push-Location $backendRoot
try {
  if (-not $SkipInstall) {
    Invoke-Step 'Install backend dependencies' { npm ci }
  }
  Invoke-Step 'Run backend tests' { npm test }
  Invoke-Step 'Run backend type-check' { npm run type-check }
  Invoke-Step 'Build backend' { npm run build }
}
finally {
  Pop-Location
}
```

Keep existing frontend, Deno, and whitespace checks while Supabase functions are still in the repository. Remove Deno checks only after Edge Function code is fully replaced and archived.

- [ ] **Step 2: Create runbook**

Create `docs/backend-vps-runbook.md`:

```markdown
# Backend VPS Runbook

## Production Domains

- Frontend: `https://hub.yux.com.br`
- Backend API: proxied under `https://hub.yux.com.br/api`
- Agent Runtime: `https://agents.yux.com.br`

## Required Dokploy Variables

- `DATABASE_URL`
- `POSTGRES_PASSWORD`
- `REDIS_URL`
- `SESSION_SECRET`
- `CORS_ORIGIN=https://hub.yux.com.br`
- `YUX_AGENT_RUNTIME_URL=http://yux-agent-harness-runtime:8080`
- `YUX_AGENT_RUNTIME_TOKEN`
- `OPENROUTER_API_KEY`
- `JINA_API_KEY`

## Deploy

1. Run `.\scripts\run-release-checks.ps1`.
2. Run `docker compose -f docker-compose.dokploy.yml config`.
3. Deploy in Dokploy.
4. Run `npm run migrate` inside `yux-backend-api`.
5. Check `/api/health`, `/api/ready`, and `https://agents.yux.com.br/health`.

## Backup

Run daily Postgres dumps and retain at least 7 daily and 4 weekly backups.
```

- [ ] **Step 3: Update docs**

Update `README.md`, `QUICK-START.md`, and `DEPLOY-DOKPLOY-VPS.md` to say:

```text
Supabase is no longer the production backend target. Production uses self-hosted Postgres, backend API, Redis, workers, and Agent Harness on Dokploy.
```

- [ ] **Step 4: Final validation**

Run:

```powershell
.\scripts\run-release-checks.ps1
docker compose -f docker-compose.dokploy.yml config
rg -n "Supabase|supabase|@/lib/supabase|@supabase/supabase-js|VITE_SUPABASE|functions/v1|@/services/supabaseService" frontend/src frontend/package.json frontend/package-lock.json frontend/.env frontend/.env.local
```

Expected:

```text
Release checks pass.
Compose config renders.
No Supabase runtime references remain in frontend. Backend compatibility routes now own the former browser data/function calls; explicit domain routes should continue replacing compatibility paths after VPS cutover.
```

- [ ] **Step 5: Commit**

```powershell
git add scripts/run-release-checks.ps1 docs/backend-vps-runbook.md DEPLOY-DOKPLOY-VPS.md README.md QUICK-START.md
git commit -m "docs: document self-hosted backend operations"
```

---

## Task 14: Production Cutover Checklist

**Files:**
- Create: `docs/vps-backend-cutover-checklist.md`

- [ ] **Step 1: Create cutover checklist**

Create `docs/vps-backend-cutover-checklist.md`:

```markdown
# VPS Backend Cutover Checklist

## Before Deploy

- [ ] `.\scripts\run-release-checks.ps1` passes.
- [ ] `docker compose -f docker-compose.dokploy.yml config` passes.
- [ ] Postgres backup path is configured.
- [ ] `SESSION_SECRET` has at least 64 random characters.
- [ ] Admin seed password hash was generated locally and committed only as a hash.
- [ ] No browser env var contains a database URL, service secret, provider token, or runtime token.
- [ ] `rg -n "Supabase|supabase|@/lib/supabase|@supabase/supabase-js|VITE_SUPABASE|functions/v1|@/services/supabaseService" frontend/src frontend/package.json frontend/package-lock.json frontend/.env frontend/.env.local` returns no runtime dependency.

## Deploy

- [ ] Deploy compose in Dokploy.
- [ ] Run backend migrations.
- [ ] Confirm `https://hub.yux.com.br/api/health`.
- [ ] Confirm `https://hub.yux.com.br/api/ready`.
- [ ] Confirm `https://agents.yux.com.br/health`.
- [ ] Log in as `admin@yux.com.br`.

## Smoke Test

- [ ] Dashboard loads.
- [ ] Client workspaces load.
- [ ] CRM leads load.
- [ ] Automations load and simulation runs.
- [ ] Omnichannel conversations load.
- [ ] Strategy Engine admin chat returns a response.
- [ ] Marketing Studio loads.
- [ ] Public proposal decision endpoint accepts a valid token.
- [ ] Webchat public endpoint accepts a test event.

## Rollback

- [ ] Keep previous Dokploy deployment available.
- [ ] Keep pre-release Postgres dump.
- [ ] If backend fails, roll back frontend and backend containers together.
- [ ] If migrations fail, restore database dump before retrying.
```

- [ ] **Step 2: Commit**

```powershell
git add docs/vps-backend-cutover-checklist.md
git commit -m "docs: add vps backend cutover checklist"
```

---

## Self-Review Notes

- Spec coverage: backend skeleton, Postgres, auth, policies, frontend migration, Edge Function replacement, Agent Harness integration, compose, release checks, and cutover are covered.
- No implementation task relies on direct browser-to-Postgres access.
- The plan keeps Supabase files during migration for reference and removes runtime dependencies only after module replacement.
- The largest risk is converting 64 Supabase migrations. Task 7 makes that a reviewed migration artifact instead of an automatic production push.
