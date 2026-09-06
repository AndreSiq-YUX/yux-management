import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { applyMigrations, listMigrationFiles, prepareMigrationReplayCompatibility } from '../scripts/apply-migrations.js'

type QueryCall = {
  sql: string
  params?: unknown[]
}

class FakePool {
  calls: QueryCall[] = []
  appliedVersions = new Map<string, string | null>()
  failOnSql?: string

  async connect() {
    return {
      query: (sql: string, params?: unknown[]) => this.query(sql, params),
      release: () => { this.calls.push({ sql: 'RELEASE' }) },
    }
  }

  private async query(sql: string, params?: unknown[]) {
    this.calls.push({ sql, params })

    if (this.failOnSql && sql.includes(this.failOnSql)) {
      throw new Error('migration failed')
    }

    if (sql.includes('SELECT checksum_sha256, checksum_algorithm, verification_origin')) {
      const version = String(params?.[0])
      const checksum = this.appliedVersions.get(version)
      return checksum === undefined
        ? { rowCount: 0, rows: [] }
        : { rowCount: 1, rows: [{
            checksum_sha256: checksum,
            checksum_algorithm: checksum ? 'sha256:utf8:lf:bom-and-nul-removed:trim-start:v1' : null,
            verification_origin: checksum ? 'repository_artifact' : 'legacy_unverified',
          }] }
    }

    if (sql.includes('INSERT INTO schema_migrations(version,checksum_sha256,checksum_algorithm,verification_origin)')) {
      this.appliedVersions.set(String(params?.[0]), String(params?.[1]))
    }

    return { rowCount: 0, rows: [] }
  }

  async end() {
    this.calls.push({ sql: 'END_POOL' })
  }
}

let tempDir: string | undefined

afterEach(async () => {
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true })
    tempDir = undefined
  }
})

async function createMigrations(files: Record<string, string>) {
  tempDir = await mkdtemp(path.join(os.tmpdir(), 'yux-migrations-'))

  await Promise.all(
    Object.entries(files).map(([file, contents]) => writeFile(path.join(tempDir as string, file), contents)),
  )

  return tempDir
}

describe('migration runner', () => {
  it('provisions the Supabase compatibility roles required by standalone PostgreSQL integration tests', async () => {
    const initSql = await readFile(
      new URL('./integration/support/postgres-init.sql', import.meta.url),
      'utf8',
    )

    expect(initSql).toContain("rolname = 'authenticated'")
    expect(initSql).toContain('CREATE ROLE authenticated NOLOGIN')
    expect(initSql).toContain("rolname = 'service_role'")
    expect(initSql).toContain('CREATE ROLE service_role NOLOGIN')
  })

  it('keeps a role-scoped permissive RLS policy alongside restrictive tenant enforcement', async () => {
    const migrationSql = await readFile(
      new URL('../src/db/migrations/0153_service_roles_and_tenant_scope.sql', import.meta.url),
      'utf8',
    )

    expect(migrationSql).toContain('CREATE POLICY yux_service_tenant_access')
    expect(migrationSql).toContain('AS PERMISSIVE FOR ALL TO yux_api,yux_worker,yux_runtime')
    expect(migrationSql).toContain('CREATE POLICY yux_tenant_scope')
    expect(migrationSql).toContain('AS RESTRICTIVE FOR ALL')
  })

  it('keeps historical email migration SQL immutable and safely prepares its consolidated replay', async () => {
    const migrationSql = await readFile(
      new URL('../src/db/migrations/0106_email_template_management.sql', import.meta.url),
      'utf8',
    )
    const calls: string[] = []
    const client = {
      async query(sql: string) {
        calls.push(sql)
        return sql.includes('FROM pg_constraint')
          ? { rowCount: 1, rows: [{ compatible: true }] }
          : { rowCount: 1, rows: [] }
      },
      release() {},
    }

    expect(migrationSql).toContain('ADD CONSTRAINT email_templates_published_version_fk')
    expect(migrationSql).not.toContain('pg_constraint')
    await prepareMigrationReplayCompatibility(client, '0106_email_template_management')
    expect(calls[0]).toContain('FROM pg_constraint migration_constraint')
    expect(calls[0]).not.toContain('FROM pg_constraint constraint')
    expect(calls.at(-1)).toContain('DROP CONSTRAINT email_templates_published_version_fk')
  })

  it('references the canonical private organization access helper in mission migrations', async () => {
    const migrationFiles = [
      '0143_composite_mission_manifests.sql',
      '0144_mission_autonomy_grants.sql',
      '0145_campaign_optimization_pack.sql',
    ]

    for (const migrationFile of migrationFiles) {
      const sql = await readFile(new URL(`../src/db/migrations/${migrationFile}`, import.meta.url), 'utf8')
      expect(sql).toContain('private.rls_can_access_organization(organization_id)')
      expect(sql).not.toContain('public.app_can_access_organization')
    }

    const autonomySql = await readFile(
      new URL('../src/db/migrations/0144_mission_autonomy_grants.sql', import.meta.url),
      'utf8',
    )
    expect(autonomySql).toContain('REFERENCES public.users(id)')
    expect(autonomySql).not.toContain('public.user_profiles')
  })

  it('lists sql migration files in lexical order', async () => {
    const migrationsDir = await createMigrations({
      '0002_second.sql': 'SELECT 2;',
      '0001_first.sql': 'SELECT 1;',
      'README.md': 'ignored',
    })

    await expect(listMigrationFiles(migrationsDir)).resolves.toEqual(['0001_first.sql', '0002_second.sql'])
  })

  it('applies pending migrations inside transactions and records versions', async () => {
    const migrationsDir = await createMigrations({
      '0002_second.sql': 'SELECT 2;',
      '0001_first.sql': 'SELECT 1;',
    })
    const pool = new FakePool()
    const logs: string[] = []

    await applyMigrations(pool, migrationsDir, { log: (message) => logs.push(String(message)) })

    expect([...pool.appliedVersions.keys()]).toEqual(['0001_first', '0002_second'])
    expect(logs).toEqual([
      'applying 0001_first from 0001_first.sql (9 chars)',
      'applied 0001_first',
      'applying 0002_second from 0002_second.sql (9 chars)',
      'applied 0002_second',
    ])
    expect(pool.calls.map((call) => call.sql)).toEqual([
      'SELECT pg_advisory_lock($1)',
      expect.stringContaining('CREATE TABLE IF NOT EXISTS schema_migrations'),
      expect.stringContaining('SELECT checksum_sha256, checksum_algorithm, verification_origin'),
      'BEGIN',
      "SELECT set_config('app.service_role', 'migrator', true)",
      "SELECT set_config('app.current_role', 'yux_admin', true)",
      "SELECT set_config('app.current_orgs', '{}', true)",
      'SELECT 1;',
      expect.stringContaining('INSERT INTO schema_migrations(version,checksum_sha256,checksum_algorithm,verification_origin)'),
      'COMMIT',
      expect.stringContaining('SELECT checksum_sha256, checksum_algorithm, verification_origin'),
      'BEGIN',
      "SELECT set_config('app.service_role', 'migrator', true)",
      "SELECT set_config('app.current_role', 'yux_admin', true)",
      "SELECT set_config('app.current_orgs', '{}', true)",
      'SELECT 2;',
      expect.stringContaining('INSERT INTO schema_migrations(version,checksum_sha256,checksum_algorithm,verification_origin)'),
      'COMMIT',
      'SELECT pg_advisory_unlock($1)',
      'RELEASE',
    ])
  })

  it('skips migrations that are already recorded', async () => {
    const migrationsDir = await createMigrations({
      '0001_first.sql': 'SELECT 1;',
      '0002_second.sql': 'SELECT 2;',
    })
    const pool = new FakePool()
    pool.appliedVersions.set('0001_first', null)

    await applyMigrations(pool, migrationsDir, { log: () => undefined })

    expect([...pool.appliedVersions.keys()]).toEqual(['0001_first', '0002_second'])
    expect(pool.calls.map((call) => call.sql)).not.toContain('SELECT 1;')
    expect(pool.calls.map((call) => call.sql)).toContain('SELECT 2;')
  })

  it('rolls back and rethrows when a migration fails', async () => {
    const migrationsDir = await createMigrations({
      '0001_first.sql': 'SELECT fail;',
    })
    const pool = new FakePool()
    pool.failOnSql = 'SELECT fail'

    await expect(applyMigrations(pool, migrationsDir, { log: () => undefined })).rejects.toThrow('migration failed')

    expect(pool.calls.map((call) => call.sql)).toContain('ROLLBACK')
    expect(pool.calls.map((call) => call.sql)).not.toContain('COMMIT')
    expect(pool.appliedVersions).toEqual(new Map())
    expect(pool.calls.map((call) => call.sql)).toContain('SELECT pg_advisory_unlock($1)')
    expect(pool.calls.map((call) => call.sql)).toContain('RELEASE')
  })

  it('rejects a changed migration when a verified checksum exists', async () => {
    const migrationsDir = await createMigrations({ '0001_first.sql': 'SELECT 1;' })
    const pool = new FakePool()
    pool.appliedVersions.set('0001_first', '0'.repeat(64))

    await expect(applyMigrations(pool, migrationsDir, { log: () => undefined }))
      .rejects.toThrow('migration_checksum_mismatch:0001_first')

    expect(pool.calls.map((call) => call.sql)).not.toContain('BEGIN')
    expect(pool.calls.map((call) => call.sql)).toContain('SELECT pg_advisory_unlock($1)')
    expect(pool.calls.map((call) => call.sql)).toContain('RELEASE')
  })
})
