import { describe, expect, it } from 'vitest'
import { createPublicToken, hashToken } from './proposalSend'

describe('proposal public token', () => {
  it('creates a random token and stores a stable sha-256 hash', async () => {
    const first = createPublicToken()
    const second = createPublicToken()
    expect(first).not.toBe(second)
    expect(await hashToken(first)).toMatch(/^[a-f0-9]{64}$/)
    expect(await hashToken(first)).toBe(await hashToken(first))
  })
})
