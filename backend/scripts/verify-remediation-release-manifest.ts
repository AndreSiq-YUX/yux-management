import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { MIGRATION_CHECKSUM_ALGORITHM, listMigrationFiles, migrationChecksum, normalizeMigrationSql } from './apply-migrations.js'

const requiredGateNames = [
  'backup_restored',
  'migrations_verified',
  'tenant_matrix_passed',
  'contracts_passed',
  'journeys_passed',
  'strategic_quality_passed',
] as const

const effectFlags = [
  'MISSION_SUPERVISOR_ENABLED',
  'MISSION_DECISIONS_ENABLED',
  'MISSION_DECISION_NOTIFICATIONS_ENABLED',
  'MISSION_SIMULATION_REPORTS_ENABLED',
  'MISSION_DECISION_FEEDBACK_ENABLED',
  'MISSION_CONVERSATIONS_ENABLED',
] as const

type JsonRecord = Record<string, unknown>

function record(value: unknown, field: string): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`release_manifest_invalid:${field}`)
  return value as JsonRecord
}

function text(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`release_manifest_invalid:${field}`)
  return value
}

function array(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`release_manifest_invalid:${field}`)
  return value
}

function assertNoSecrets(value: unknown, pathParts: string[] = []): void {
  if (Array.isArray(value)) return value.forEach((item, index) => assertNoSecrets(item, [...pathParts, String(index)]))
  if (!value || typeof value !== 'object') {
    if (typeof value === 'string' && /\$\{|-----BEGIN [A-Z ]+PRIVATE KEY-----/.test(value)) {
      throw new Error(`release_manifest_contains_secret_material:${pathParts.join('.')}`)
    }
    return
  }
  for (const [key, nested] of Object.entries(value as JsonRecord)) {
    if (/^(password|secret|token|apiKey|credential)(Value)?$/i.test(key)) {
      throw new Error(`release_manifest_contains_secret_key:${[...pathParts, key].join('.')}`)
    }
    assertNoSecrets(nested, [...pathParts, key])
  }
}

export async function migrationInventory(repoRoot: string) {
  const migrationsDir = path.join(repoRoot, 'backend/src/db/migrations')
  const files = await listMigrationFiles(migrationsDir)
  const entries: string[] = []
  for (const file of files) {
    const normalized = normalizeMigrationSql(await readFile(path.join(migrationsDir, file), 'utf8'))
    entries.push(`${file}:${migrationChecksum(normalized)}`)
  }
  const aggregateSha256 = createHash('sha256').update(`${entries.join('\n')}\n`, 'utf8').digest('hex')
  return { count: files.length, first: files[0], last: files.at(-1), aggregateSha256 }
}

export async function verifyRemediationReleaseManifest(manifest: unknown, repoRoot: string): Promise<void> {
  const root = record(manifest, 'root')
  assertNoSecrets(root)
  if (root.schemaVersion !== 1 || root.releaseMode !== 'pilot' || root.enabledScope !== 'explicit_allowlist') {
    throw new Error('release_manifest_invalid:identity')
  }
  if (!['blocked', 'ready_for_pilot', 'observing', 'accepted', 'rolled_back'].includes(String(root.releaseStatus))) {
    throw new Error('release_manifest_invalid:releaseStatus')
  }
  if (root.rollbackPolicy !== 'disable_new_effects_then_reconcile_then_compatible_images') {
    throw new Error('release_manifest_invalid:rollbackPolicy')
  }

  const requiredGates = array(root.requiredGates, 'requiredGates')
  if (JSON.stringify(requiredGates) !== JSON.stringify(requiredGateNames)) throw new Error('release_manifest_invalid:requiredGates')
  const gates = record(root.gates, 'gates')
  for (const name of requiredGateNames) {
    const gate = record(gates[name], `gates.${name}`)
    if (!['passed', 'blocked', 'not_run'].includes(String(gate.status))) throw new Error(`release_manifest_invalid:gates.${name}.status`)
    text(gate.scope, `gates.${name}.scope`)
    array(gate.evidence, `gates.${name}.evidence`)
  }

  const inventory = record(root.migrations, 'migrations')
  const calculated = await migrationInventory(repoRoot)
  if (inventory.checksumAlgorithm !== MIGRATION_CHECKSUM_ALGORITHM || inventory.aggregateAlgorithm !== 'sha256:filename-checksum-lines:v1') {
    throw new Error('release_manifest_invalid:migrations.algorithm')
  }
  for (const field of ['count', 'first', 'last', 'aggregateSha256'] as const) {
    if (inventory[field] !== calculated[field]) throw new Error(`release_manifest_migration_drift:${field}`)
  }

  const images = record(root.images, 'images')
  if (JSON.stringify(Object.keys(images).sort()) !== JSON.stringify(['agentRuntime', 'backend', 'frontend'])) {
    throw new Error('release_manifest_invalid:images')
  }
  for (const [name, value] of Object.entries(images)) {
    const image = record(value, `images.${name}`)
    const dockerfile = text(image.dockerfile, `images.${name}.dockerfile`)
    const baseImage = text(image.baseImage, `images.${name}.baseImage`)
    if (!baseImage.includes('@sha256:') || !(await readFile(path.join(repoRoot, dockerfile), 'utf8')).includes(baseImage)) {
      throw new Error(`release_manifest_image_drift:${name}.baseImage`)
    }
  }

  const flags = record(root.flags, 'flags')
  for (const flag of effectFlags) {
    if (flags[flag] !== false) throw new Error(`release_manifest_unsafe_default:${flag}`)
  }
  const legacyConsumers = array(root.legacyQueueConsumers, 'legacyQueueConsumers').map((item, index) => record(item, `legacyQueueConsumers.${index}`))
  const draining = legacyConsumers.filter(item => item.drainsLegacyQueue === true)
  if (draining.length !== 1 || draining[0]?.queueClass !== 'interactive') throw new Error('release_manifest_invalid:legacyQueueConsumers')

  const observation = record(root.pilotObservation, 'pilotObservation')
  if (!['passed', 'blocked', 'not_run'].includes(String(observation.status)) || Number(observation.minimumHours) < 24) {
    throw new Error('release_manifest_invalid:pilotObservation')
  }
  const routineSamples = record(observation.routineSamples, 'pilotObservation.routineSamples')
  const requiredRoutines = ['sequence_scheduler', 'maintenance_scheduler', 'learning_checkpoint', 'outbox', 'queue_classes', 'unknown_effect_reconciliation']
  if (JSON.stringify(Object.keys(routineSamples).sort()) !== JSON.stringify(requiredRoutines.sort())) {
    throw new Error('release_manifest_invalid:pilotObservation.routineSamples')
  }

  if (root.releaseStatus !== 'blocked') {
    const release = record(root.release, 'release')
    if (!/^[a-f0-9]{40}$/.test(String(release.commit))) throw new Error('release_manifest_not_promotable:release.commit')
    const organizations = array(record(root.scope, 'scope').organizationIds, 'scope.organizationIds')
    const organizationIds = organizations.map(value => String(value))
    if (organizationIds.length === 0 || organizationIds.length > 2 || new Set(organizationIds).size !== organizationIds.length
      || organizationIds.some(value => !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))) {
      throw new Error('release_manifest_not_promotable:scope.organizationIds')
    }
    for (const name of requiredGateNames) {
      if (record(gates[name], `gates.${name}`).status !== 'passed') throw new Error(`release_manifest_not_promotable:gates.${name}`)
    }
    for (const [name, image] of Object.entries(images)) {
      if (!/^sha256:[a-f0-9]{64}$/.test(String(record(image, `images.${name}`).releaseDigest))) {
        throw new Error(`release_manifest_not_promotable:images.${name}.releaseDigest`)
      }
    }
    const backup = record(root.backup, 'backup')
    if (backup.status !== 'restored' || typeof backup.backupId !== 'string' || backup.backupId.length === 0
      || typeof backup.restoreEvidence !== 'string' || backup.restoreEvidence.length === 0) {
      throw new Error('release_manifest_not_promotable:backup')
    }
    if (root.releaseStatus === 'accepted' && (observation.status !== 'passed' || Object.values(routineSamples).some(value => Number(value) < 1))) {
      throw new Error('release_manifest_not_acceptable:pilotObservation')
    }
  }
}

const dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(dirname, '../..')
const manifestPath = path.join(repoRoot, 'docs/releases/yux-remediation-manifest.json')
const isDirectRun = process.argv[1] ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) : false

if (isDirectRun) {
  const manifestContents = await readFile(manifestPath, 'utf8')
  const manifest = JSON.parse(manifestContents) as unknown
  await verifyRemediationReleaseManifest(manifest, repoRoot)
  const manifestSha256 = createHash('sha256').update(manifestContents, 'utf8').digest('hex')
  console.log(`verified remediation release manifest: ${manifestPath}`)
  console.log(`manifest sha256: ${manifestSha256}`)
}
