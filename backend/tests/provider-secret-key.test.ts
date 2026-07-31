import { describe, expect, it } from 'vitest'
import { loadEnv } from '../src/config/env.js'

describe('provider secret encryption configuration', () => {
  it('requires a dedicated provider secret key in production', () => {
    expect(() => loadEnv({
      NODE_ENV: 'production', DATABASE_URL: 'postgresql://db', SESSION_SECRET: 'a'.repeat(32),
    })).toThrow('PROVIDER_SECRET_ENCRYPTION_KEY_B64 is required in production')
  })
})
