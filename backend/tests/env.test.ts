import { describe, expect, it } from 'vitest'
import { loadEnv } from '../src/config/env.js'

const baseEnv = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/yux_test',
  SESSION_SECRET: 'test-secret-value-with-at-least-32-chars',
} as NodeJS.ProcessEnv

describe('environment validation', () => {
  it('fails at boot when the n8n webhook URL is set without its HMAC secret', () => {
    expect(() => loadEnv({ ...baseEnv, N8N_CRM_WEBHOOK_URL: 'https://n8n.example.com/webhook/crm' }))
      .toThrowError(/N8N_WEBHOOK_SECRET/)
  })

  it('accepts the n8n webhook URL when the secret is configured', () => {
    const env = loadEnv({
      ...baseEnv,
      N8N_CRM_WEBHOOK_URL: 'https://n8n.example.com/webhook/crm',
      N8N_WEBHOOK_SECRET: 'super-secret',
    })
    expect(env.N8N_CRM_WEBHOOK_URL).toBe('https://n8n.example.com/webhook/crm')
  })

  it('accepts only immutable release identities or the explicit unrecorded fallback', () => {
    const env = loadEnv({
      ...baseEnv,
      YUX_RELEASE_COMMIT: 'a'.repeat(40),
      YUX_RELEASE_MANIFEST_SHA256: 'b'.repeat(64),
    })
    expect(env.YUX_RELEASE_COMMIT).toBe('a'.repeat(40))
    expect(env.YUX_RELEASE_MANIFEST_SHA256).toBe('b'.repeat(64))
    expect(() => loadEnv({ ...baseEnv, YUX_RELEASE_COMMIT: 'main' })).toThrowError(/YUX_RELEASE_COMMIT/)
  })
})
