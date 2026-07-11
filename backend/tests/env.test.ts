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
})
