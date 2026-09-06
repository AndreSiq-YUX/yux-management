import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { createPool } from '../src/db/client.js'

type MigrationQueryResult = {
  rowCount: number | null
  rows?: Array<Record<string, unknown>>
}

type MigrationClient = {
  query(sql: string, params?: unknown[]): Promise<MigrationQueryResult>
  release(): void
}

type MigrationPool = {
  connect(): Promise<MigrationClient>
}

export type MigrationLog = Pick<Console, 'log'>

export const ensureSchemaMigrationsSql = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  checksum_sha256 TEXT,
  checksum_algorithm TEXT,
  verification_origin TEXT NOT NULL DEFAULT 'legacy_unverified'
);
ALTER TABLE schema_migrations ADD COLUMN IF NOT EXISTS checksum_sha256 TEXT;
ALTER TABLE schema_migrations ADD COLUMN IF NOT EXISTS checksum_algorithm TEXT;
ALTER TABLE schema_migrations ADD COLUMN IF NOT EXISTS verification_origin TEXT NOT NULL DEFAULT 'legacy_unverified';
`

export const MIGRATION_LOCK_KEY = 98152026
export const MIGRATION_CHECKSUM_ALGORITHM = 'sha256:utf8:lf:bom-and-nul-removed:trim-start:v1'

export async function listMigrationFiles(migrationsDir: string) {
  const files = await readdir(migrationsDir)
  return files.filter((file) => file.endsWith('.sql')).sort()
}

export async function applyMigrations(pool: MigrationPool, migrationsDir: string, log: MigrationLog = console) {
  const client = await pool.connect()
  let lockAcquired = false
  try {
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_KEY])
    lockAcquired = true
    await client.query(ensureSchemaMigrationsSql)
    const files = await listMigrationFiles(migrationsDir)

    for (const file of files) {
      const version = file.replace(/\.sql$/, '')
      const sql = normalizeMigrationSql(await readFile(path.join(migrationsDir, file), 'utf8'))
      const checksumSha256 = migrationChecksum(sql)
      const existing = await client.query(
        `SELECT checksum_sha256, checksum_algorithm, verification_origin
         FROM schema_migrations
         WHERE version = $1`,
        [version],
      )

      if (existing.rowCount) {
        const recordedChecksum = existing.rows?.[0]?.checksum_sha256
        const recordedAlgorithm = existing.rows?.[0]?.checksum_algorithm
        const verificationOrigin = existing.rows?.[0]?.verification_origin
        if (typeof recordedChecksum === 'string' && recordedChecksum !== checksumSha256) {
          throw new Error(`migration_checksum_mismatch:${version}`)
        }
        if (typeof recordedChecksum === 'string' && recordedAlgorithm !== MIGRATION_CHECKSUM_ALGORITHM) {
          throw new Error(`migration_checksum_algorithm_mismatch:${version}`)
        }
        if (recordedChecksum == null && verificationOrigin !== 'legacy_unverified') {
          throw new Error(`migration_checksum_missing:${version}`)
        }
        continue
      }

      await client.query('BEGIN')
      try {
        log.log(`applying ${version} from ${file} (${sql.length} chars)`)
        await prepareMigrationReplayCompatibility(client, version)
        await client.query("SELECT set_config('app.service_role', 'migrator', true)")
        await client.query("SELECT set_config('app.current_role', 'yux_admin', true)")
        await client.query("SELECT set_config('app.current_orgs', '{}', true)")
        await client.query(sql)
        await client.query(
          `INSERT INTO schema_migrations(version,checksum_sha256,checksum_algorithm,verification_origin)
           VALUES ($1,$2,$3,'repository_artifact')`,
          [version, checksumSha256, MIGRATION_CHECKSUM_ALGORITHM],
        )
        await client.query('COMMIT')
        log.log(`applied ${version}`)
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined)
        throw error
      }
    }
  } finally {
    if (lockAcquired) {
      await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_KEY]).catch(() => undefined)
    }
    client.release()
  }
}

/**
 * The consolidated 0100 baseline already contains the email-template foreign
 * key later named by 0106. Fresh self-hosted installs still execute 0106, while
 * existing installs have it recorded and skip this path. Replacing the same,
 * structurally verified constraint inside 0106's transaction keeps historical
 * SQL immutable and makes a clean replay deterministic.
 */
export async function prepareMigrationReplayCompatibility(client: MigrationClient, version: string) {
  if (version !== '0106_email_template_management') return

  const existing = await client.query(
    `SELECT (
       constraint.contype = 'f'
       AND constraint.confrelid = 'public.email_template_versions'::regclass
       AND constraint.confdeltype = 'n'
       AND constraint.conkey = ARRAY[(
         SELECT attribute.attnum::SMALLINT
         FROM pg_attribute attribute
         WHERE attribute.attrelid = 'public.email_templates'::regclass
           AND attribute.attname = 'published_version_id'
       )]::SMALLINT[]
       AND constraint.confkey = ARRAY[(
         SELECT attribute.attnum::SMALLINT
         FROM pg_attribute attribute
         WHERE attribute.attrelid = 'public.email_template_versions'::regclass
           AND attribute.attname = 'id'
       )]::SMALLINT[]
     ) AS compatible
     FROM pg_constraint constraint
     WHERE constraint.conname = 'email_templates_published_version_fk'
       AND constraint.conrelid = 'public.email_templates'::regclass`,
  )
  if (!existing.rowCount) return
  if (existing.rows?.[0]?.compatible !== true) {
    throw new Error('migration_replay_precondition_mismatch:0106_email_template_management')
  }
  await client.query('ALTER TABLE public.email_templates DROP CONSTRAINT email_templates_published_version_fk')
}

export function normalizeMigrationSql(sql: string) {
  return sql
    .replace(/^\uFEFF/, '')
    .replace(/\u0000/g, '')
    .replace(/\r\n?/g, '\n')
    .trimStart()
}

export function migrationChecksum(normalizedSql: string) {
  return createHash('sha256').update(normalizedSql, 'utf8').digest('hex')
}

export async function runMigrations() {
  const dirname = path.dirname(fileURLToPath(import.meta.url))
  const migrationsDir = path.resolve(dirname, '../src/db/migrations')
  const pool = createPool(process.env.MIGRATOR_DATABASE_URL || undefined)

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
