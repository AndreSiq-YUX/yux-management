import { assertEquals, assertMatch, assertNotEquals } from 'jsr:@std/assert@1'
import { createPublicToken, hashToken } from './proposalSend.ts'

Deno.test('proposal public token creates a random token and stores a stable sha-256 hash', async () => {
  const first = createPublicToken()
  const second = createPublicToken()
  assertNotEquals(first, second)
  assertMatch(await hashToken(first), /^[a-f0-9]{64}$/)
  assertEquals(await hashToken(first), await hashToken(first))
})
