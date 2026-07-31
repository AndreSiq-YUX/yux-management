import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createPool } from '../src/db/client.js'

type MigrationQueryResult = {
  rowCount: number | null
}

type MigrationPool = {
  query(sql: string, params?: unknown[]): Promise<MigrationQueryResult>
}

export type MigrationLog = Pick<Console, 'log'>

export const ensureSchemaMigrationsSql = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
)
`

export async function listMigrationFiles(migrationsDir: string) {
  const files = await readdir(migrationsDir)
  return files.filter((file) => file.endsWith('.sql')).sort()
}

export async function applyMigrations(pool: MigrationPool, migrationsDir: string, log: MigrationLog = console) {
  await pool.query(ensureSchemaMigrationsSql)

  const files = await listMigrationFiles(migrationsDir)

  for (const file of files) {
    const version = file.replace(/\.sql$/, '')
    const existing = await pool.query('SELECT 1 FROM schema_migrations WHERE version = $1', [version])

    if (existing.rowCount) {
      continue
    }

    const sql = normalizeMigrationSql(await readFile(path.join(migrationsDir, file), 'utf8'))

    await pool.query('BEGIN')
    try {
      log.log(`applying ${version} from ${file} (${sql.length} chars)`)
      await pool.query(sql)
      await pool.query('INSERT INTO schema_migrations(version) VALUES ($1)', [version])
      await pool.query('COMMIT')
      log.log(`applied ${version}`)
    } catch (error) {
      await pool.query('ROLLBACK')
      throw error
    }
  }
}

function normalizeMigrationSql(sql: string) {
  return sql.replace(/^\uFEFF/, '').replace(/\u0000/g, '').trimStart()
}

export async function runMigrations() {
  const dirname = path.dirname(fileURLToPath(import.meta.url))
  const migrationsDir = path.resolve(dirname, '../src/db/migrations')
  const pool = createPool()

  try {
    await applyMigrations(pool, migrationsDir)
  } finally {
    await pool.end()
  }
}

const isDirectRun = process.argv[1] ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) : false

if (isDirectRun) {
  await runMigrations()
}
