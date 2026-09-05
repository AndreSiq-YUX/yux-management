import { readFile } from 'node:fs/promises'
import { Ajv2020 } from 'ajv/dist/2020.js'
import formatsPlugin from 'ajv-formats'
import { describe, expect, it } from 'vitest'

const validManifest = {
  schemaVersion: 1,
  backupId: 'restore-rehearsal-01',
  createdAt: '2026-09-05T22:00:00Z',
  targetRpoSeconds: 3600,
  targetRtoSeconds: 14400,
  commit: '0'.repeat(40),
  images: [{ service: 'yux-backend-api', reference: 'yux/backend:test', digest: `sha256:${'a'.repeat(64)}` }],
  migrationVersions: ['0152_strategy_retrieval_embedding_status'],
  databaseArtifact: { path: 'postgres.dump', byteSize: 1024, sha256: 'b'.repeat(64) },
  volumeArtifacts: [
    { assetClass: 'materials', path: 'materials.tar.zst', byteSize: 10, sha256: 'c'.repeat(64) },
    { assetClass: 'company-knowledge', path: 'company-knowledge.tar.zst', byteSize: 11, sha256: 'd'.repeat(64) },
    { assetClass: 'omnichannel-attachments', path: 'omnichannel-attachments.tar.zst', byteSize: 12, sha256: 'e'.repeat(64) },
    { assetClass: 'redis-aof', path: 'redis-aof.tar.zst', byteSize: 13, sha256: 'f'.repeat(64) },
  ],
  secretCustodyReference: 'vault://yux/production/recovery',
  consistency: {
    mode: 'quiesced',
    windowStartedAt: '2026-09-05T21:58:00Z',
    windowEndedAt: '2026-09-05T22:00:00Z',
  },
  restoreExternalEffectsEnabled: false,
}

describe('backup manifest schema', () => {
  it('accepts a complete manifest without secret values', async () => {
    const validate = await createValidator()
    expect(validate(validManifest), JSON.stringify(validate.errors)).toBe(true)
  })

  it('rejects missing assets, enabled effects and secret-like values', async () => {
    const validate = await createValidator()
    const unsafe = {
      ...validManifest,
      volumeArtifacts: validManifest.volumeArtifacts.slice(0, 2),
      secretCustodyReference: 'password=do-not-store-this',
      restoreExternalEffectsEnabled: true,
    }
    expect(validate(unsafe)).toBe(false)
  })
})

async function createValidator() {
  const schema = JSON.parse(await readFile(new URL('../../ops/backup/manifest.schema.json', import.meta.url), 'utf8'))
  const ajv = new Ajv2020({ allErrors: true, strict: true })
  const addFormats = formatsPlugin as unknown as (target: Ajv2020) => Ajv2020
  addFormats(ajv)
  return ajv.compile(schema)
}
