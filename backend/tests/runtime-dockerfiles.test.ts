import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const dockerfiles = [
  'backend/Dockerfile',
  'backend/Dockerfile.dokploy',
  'workers/marketing-studio-agent-runtime/Dockerfile',
]

describe('runtime Dockerfile dependency safeguards', () => {
  it.each(dockerfiles)('%s permits newer Alpine revisions while retaining security floors', async file => {
    const source = await readFile(new URL(file, new URL('../../', import.meta.url)), 'utf8')
    expect(source).toContain('apk add --no-cache --upgrade')
    expect(source).toContain("'libcrypto3>=3.5.8-r0'")
    expect(source).toContain("'libssl3>=3.5.8-r0'")
    expect(source).not.toMatch(/\blib(?:crypto3|ssl3|uuid)=/)
    expect(source).not.toContain('--allow-untrusted')
    expect(source.split('\n').filter(line => line.startsWith('FROM ')).every(line => /@sha256:[a-f0-9]{64}/.test(line))).toBe(true)
    if (file.includes('marketing-studio')) {
      expect(source).toContain("'libuuid>=2.42.3-r1'")
      expect(source).toContain('USER yux-runtime')
      expect(source).toContain('pip install --no-cache-dir --require-hashes -r requirements.lock')
    } else {
      expect(source).toContain('USER node')
      expect(source).toContain('npm ci --omit=dev')
      expect(source).toContain('rm -rf /usr/local/lib/node_modules/npm')
      expect(source).toContain('rm -f /usr/local/bin/npm /usr/local/bin/npx')
    }
  })
})
