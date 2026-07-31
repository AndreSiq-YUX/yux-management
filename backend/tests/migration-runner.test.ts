import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { applyMigrations, listMigrationFiles } from '../scripts/apply-migrations.js'

type QueryCall = {
  sql: string
  params?: unknown[]
}

class FakePool {
  calls: QueryCall[] = []
  appliedVersions = new Set<string>()
  failOnSql?: string

  async query(sql: string, params?: unknown[]) {
    this.calls.push({ sql, params })

    if (this.failOnSql && sql.includes(this.failOnSql)) {
      throw new Error('migration failed')
    }

    if (sql === 'SELECT 1 FROM schema_migrations WHERE version = $1') {
      return { rowCount: this.appliedVersions.has(String(params?.[0])) ? 1 : 0, rows: [] }
    }

    if (sql === 'INSERT INTO schema_migrations(version) VALUES ($1)') {
      this.appliedVersions.add(String(params?.[0]))
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

    expect(pool.appliedVersions).toEqual(new Set(['0001_first', '0002_second']))
    expect(logs).toEqual([
      'applying 0001_first from 0001_first.sql (9 chars)',
      'applied 0001_first',
      'applying 0002_second from 0002_second.sql (9 chars)',
      'applied 0002_second',
    ])
    expect(pool.calls.map((call) => call.sql)).toEqual([
      expect.stringContaining('CREATE TABLE IF NOT EXISTS schema_migrations'),
      'SELECT 1 FROM schema_migrations WHERE version = $1',
      'BEGIN',
      'SELECT 1;',
      'INSERT INTO schema_migrations(version) VALUES ($1)',
      'COMMIT',
      'SELECT 1 FROM schema_migrations WHERE version = $1',
      'BEGIN',
      'SELECT 2;',
      'INSERT INTO schema_migrations(version) VALUES ($1)',
      'COMMIT',
    ])
  })

  it('skips migrations that are already recorded', async () => {
    const migrationsDir = await createMigrations({
      '0001_first.sql': 'SELECT 1;',
      '0002_second.sql': 'SELECT 2;',
    })
    const pool = new FakePool()
    pool.appliedVersions.add('0001_first')

    await applyMigrations(pool, migrationsDir, { log: () => undefined })

    expect(pool.appliedVersions).toEqual(new Set(['0001_first', '0002_second']))
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
    expect(pool.appliedVersions).toEqual(new Set())
  })
})
