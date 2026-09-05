import { drizzle } from 'drizzle-orm/node-postgres'
import pg from 'pg'
import { loadEnv } from '../config/env.js'
import { getDatabaseRequestContext, type DatabaseRequestContext } from './request-context.js'
import * as schema from './schema/index.js'

const { Pool } = pg

export function createPool(databaseUrl = loadEnv().DATABASE_URL) {
  const pool = new Pool({ connectionString: databaseUrl })
  return createContextAwarePool(pool, normalizeServiceRole(process.env.YUX_DATABASE_SERVICE_ROLE))
}

/**
 * Applies request identity inside a short transaction for every query. This is
 * intentionally per-query: `Pool.query` may use a different connection each
 * time, so setting a session variable on the shared pool would leak context
 * across concurrent HTTP requests.
 */
export function createContextAwarePool(pool: pg.Pool, defaultServiceRole: 'api' | 'worker' | 'runtime' = 'api'): pg.Pool {
  const wrapped = Object.create(pool) as pg.Pool
  const rawQuery = pool.query.bind(pool)

  wrapped.query = (async (...args: unknown[]) => {
    const context = getDatabaseRequestContext()
    if (!context || typeof (pool as unknown as { connect?: unknown }).connect !== 'function') {
      return rawQuery(...args as Parameters<typeof rawQuery>)
    }

    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await configureContext(client, context, defaultServiceRole)
      const result = await client.query(...args as Parameters<typeof client.query>)
      await client.query('COMMIT')
      return result
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined)
      throw error
    } finally {
      client.release()
    }
  }) as pg.Pool['query']

  wrapped.connect = (async () => {
    const client = await pool.connect()
    const context = getDatabaseRequestContext()
    if (!context) return client
    const scopedClient = Object.create(client) as pg.PoolClient
    let configured = false
    scopedClient.release = client.release.bind(client)
    scopedClient.query = (async (...args: unknown[]) => {
      const result = await client.query(...args as Parameters<typeof client.query>)
      const statement = typeof args[0] === 'string' ? args[0] : ''
      if (!configured && /^\s*begin\b/i.test(statement)) {
        await configureContext(client, context, defaultServiceRole)
        configured = true
      }
      return result
    }) as pg.PoolClient['query']
    return scopedClient
  }) as pg.Pool['connect']

  return wrapped
}

async function configureContext(
  client: Pick<pg.PoolClient, 'query'>,
  context: DatabaseRequestContext,
  defaultServiceRole: 'api' | 'worker' | 'runtime',
) {
  const organizationIds = context.organizationIds.map((value) => {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
      throw new Error('invalid_database_organization_context')
    }
    return value.toLowerCase()
  })
  if (!['yux_admin', 'yux_operator'].includes(context.role) && organizationIds.length === 0) {
    throw new Error('database_organization_context_required')
  }
  await client.query("SELECT set_config('app.service_role', $1, true)", [context.serviceRole ?? defaultServiceRole])
  await client.query("SELECT set_config('app.current_role', $1, true)", [context.role])
  await client.query("SELECT set_config('app.current_orgs', $1, true)", [`{${organizationIds.join(',')}}`])
}

function normalizeServiceRole(value: string | undefined): 'api' | 'worker' | 'runtime' {
  return value === 'worker' || value === 'runtime' ? value : 'api'
}

export function createDb(databaseUrl?: string) {
  const pool = createPool(databaseUrl)

  return {
    pool,
    db: drizzle(pool, { schema }),
  }
}
