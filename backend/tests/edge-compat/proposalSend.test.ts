import { expect, it } from 'vitest'

function assertNotEquals(actual: unknown, expected: unknown) {
  expect(actual).not.toEqual(expected)
}

function assertMatch(actual: string, expected: RegExp) {
  expect(actual).toMatch(expected)
}

function assertEquals(actual: unknown, expected: unknown) {
  expect(actual).toEqual(expected)
}
import { createPublicToken, hashToken } from '../../src/lib/edge-compat/proposalSend.js'

it('proposal public token creates a random token and stores a stable sha-256 hash', async () => {
  const first = createPublicToken()
  const second = createPublicToken()
  assertNotEquals(first, second)
  assertMatch(await hashToken(first), /^[a-f0-9]{64}$/)
  assertEquals(await hashToken(first), await hashToken(first))
})
