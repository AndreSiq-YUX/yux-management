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
