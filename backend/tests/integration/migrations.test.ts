import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import pg from 'pg'
import { afterEach, expect, it } from 'vitest'
import { applyMigrations, MIGRATION_CHECKSUM_ALGORITHM, migrationChecksum, normalizeMigrationSql } from '../../scripts/apply-migrations.js'
import { createIntegrationRig, getIntegrationDatabaseUrl, type IntegrationRig } from './support/rig.js'

let rig: IntegrationRig | undefined
let migrationPool: pg.Pool | undefined
const tempDirs: string[] = []

afterEach(async () => {
  await rig?.close()
  rig = undefined
  await migrationPool?.end()
  migrationPool = undefined
  await Promise.all(tempDirs.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

it('reverte integralmente uma migration que falha', async () => {
  rig = await createIntegrationRig()
  migrationPool = new pg.Pool({ connectionString: getIntegrationDatabaseUrl(), max: 2 })
  const directory = await migrationDirectory({
    '9901_atomic_failure.sql': `
      CREATE TABLE public.integration_partial_migration(id integer);
      SELECT missing_integration_function();
    `,
  })

  await expect(applyMigrations(migrationPool, directory, { log: () => undefined })).rejects.toThrow()
  expect((await rig.sql(`SELECT to_regclass('public.integration_partial_migration') AS relation`)).rows[0].relation).toBeNull()
  expect((await rig.sql(`SELECT 1 FROM schema_migrations WHERE version='9901_atomic_failure'`)).rowCount).toBe(0)
})

it('serializa migradores concorrentes e aplica uma única vez', async () => {
  rig = await createIntegrationRig()
  migrationPool = new pg.Pool({ connectionString: getIntegrationDatabaseUrl(), max: 2 })
  const directory = await migrationDirectory({
    '9902_concurrent.sql': `CREATE TABLE IF NOT EXISTS public.integration_concurrent_migration(id integer);`,
  })

  await Promise.all([
    applyMigrations(migrationPool, directory, { log: () => undefined }),
    applyMigrations(migrationPool, directory, { log: () => undefined }),
  ])

  expect((await rig.sql(`SELECT count(*)::int AS count FROM schema_migrations WHERE version='9902_concurrent'`)).rows[0].count).toBe(1)
})

it('bloqueia alteração de migration verificada e preserva legado não atestado', async () => {
  rig = await createIntegrationRig()
  migrationPool = new pg.Pool({ connectionString: getIntegrationDatabaseUrl(), max: 2 })
  const original = 'CREATE TABLE public.integration_checksum(id integer);'
  const directory = await migrationDirectory({ '9903_checksum.sql': original })
  await applyMigrations(migrationPool, directory, { log: () => undefined })

  const recorded = await rig.sql(
    `SELECT checksum_sha256,checksum_algorithm,verification_origin FROM schema_migrations WHERE version='9903_checksum'`,
  )
  expect(recorded.rows[0]).toEqual({
    checksum_sha256: migrationChecksum(normalizeMigrationSql(original)),
    checksum_algorithm: MIGRATION_CHECKSUM_ALGORITHM,
    verification_origin: 'repository_artifact',
  })

  await writeFile(path.join(directory, '9903_checksum.sql'), `${original}\nALTER TABLE public.integration_checksum ADD COLUMN changed boolean;`)
  await expect(applyMigrations(migrationPool, directory, { log: () => undefined }))
    .rejects.toThrow('migration_checksum_mismatch:9903_checksum')

  await rig.sql(`INSERT INTO schema_migrations(version) VALUES ('legacy_example') ON CONFLICT DO NOTHING`)
  const legacy = await rig.sql(
    `SELECT count(*)::int AS count
       FROM schema_migrations
      WHERE checksum_sha256 IS NULL AND verification_origin='legacy_unverified'`,
  )
  expect(legacy.rows[0].count).toBeGreaterThan(0)
})

async function migrationDirectory(files: Record<string, string>) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'yux-integration-migrations-'))
  tempDirs.push(directory)
  await Promise.all(Object.entries(files).map(([name, sql]) => writeFile(path.join(directory, name), sql)))
  return directory
}
