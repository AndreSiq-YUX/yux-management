import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { verifyRemediationReleaseManifest } from '../scripts/verify-remediation-release-manifest.js'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const manifestPath = path.join(repoRoot, 'docs/releases/yux-remediation-manifest.json')

async function manifest() {
  return JSON.parse(await readFile(manifestPath, 'utf8')) as Record<string, unknown>
}

describe('remediation release manifest', () => {
  it('matches the repository migration inventory and preserves disabled effect defaults', async () => {
    await expect(verifyRemediationReleaseManifest(await manifest(), repoRoot)).resolves.toBeUndefined()
  })

  it('cannot be promoted while required evidence is still blocked', async () => {
    const candidate = await manifest()
    candidate.releaseStatus = 'ready_for_pilot'
    await expect(verifyRemediationReleaseManifest(candidate, repoRoot)).rejects.toThrow(/release_manifest_not_promotable/)
  })

  it('cannot be accepted without 24-hour operational samples', async () => {
    const candidate = await manifest() as Record<string, any>
    candidate.releaseStatus = 'accepted'
    candidate.release.commit = 'a'.repeat(40)
    candidate.scope.organizationIds = ['10000000-0000-4000-8000-000000000001']
    Object.values(candidate.gates).forEach((gate: any) => { gate.status = 'passed' })
    Object.values(candidate.images).forEach((image: any) => { image.releaseDigest = `sha256:${'b'.repeat(64)}` })
    candidate.backup = { ...candidate.backup, status: 'restored', backupId: 'backup-1', restoreEvidence: 'evidence-1' }
    await expect(verifyRemediationReleaseManifest(candidate, repoRoot)).rejects.toThrow(/release_manifest_not_acceptable/)
  })
})
