import { drizzle } from 'drizzle-orm/node-postgres'
import pg from 'pg'
import { loadEnv } from '../config/env.js'
import { getDatabaseRequestContext } from './request-context.js'
import * as schema from './schema/index.js'

const { Pool } = pg

export function createPool(databaseUrl = loadEnv().DATABASE_URL) {
  const pool = new Pool({ connectionString: databaseUrl })
  return createContextAwarePool(pool)
}

/**
 * Applies request identity inside a short transaction for every query. This is
 * intentionally per-query: `Pool.query` may use a different connection each
 * time, so setting a session variable on the shared pool would leak context
 * across concurrent HTTP requests.
 */
export function createContextAwarePool(pool: pg.Pool): pg.Pool {
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
      await client.query("SELECT set_config('app.current_role', $1, true)", [context.role])
      await client.query("SELECT set_config('app.current_orgs', $1, true)", [`{${context.organizationIds.join(',')}}`])
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
        await client.query("SELECT set_config('app.current_role', $1, true)", [context.role])
        await client.query("SELECT set_config('app.current_orgs', $1, true)", [`{${context.organizationIds.join(',')}}`])
        configured = true
      }
      return result
    }) as pg.PoolClient['query']
    return scopedClient
  }) as pg.Pool['connect']

  return wrapped
}

export function createDb(databaseUrl?: string) {
  const pool = createPool(databaseUrl)

  return {
    pool,
    db: drizzle(pool, { schema }),
  }
}
