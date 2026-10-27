import { describe, expect, it, vi } from 'vitest'
import { buildMissionOperationalContext } from '../src/modules/action-engine/context-builder.js'

const accountAvailability = { authority: 'server' as const, organizationId: 'org-a', contractId: null,
  enabledModules: [], actionAuthorization: 'not_granted_by_snapshot' as const, tools: [] }

function database(input: { ownEmail?: boolean; centralEmail?: boolean; unavailable?: boolean; whatsapp?: boolean } = {}) {
  return { query: vi.fn(async (sql: string, params?: unknown[]) => {
    if (sql.includes('action_mission_memory_summaries')) return { rows: [] }
    if (sql.includes('channel_connections')) {
      if (input.unavailable) throw new Error('synthetic database unavailable')
      expect(params?.[0]).toBe('org-a')
      return { rows: [
        ...(input.whatsapp ? [{ channel: 'whatsapp', is_active: true }] : []),
        ...(input.ownEmail && sql.includes('email_provider_connections') ? [{ channel: 'email', is_active: true }] : []),
      ] }
    }
    if (sql.includes('ad_provider_connections')) return { rows: [] }
    if (sql.includes('platform_provider_connections')) {
      if (input.unavailable) throw new Error('synthetic database unavailable')
      // No provider name, sender, credential or protected metadata may be returned.
      return { rows: [{ configured: Boolean(input.centralEmail), private_secret: 'DO_NOT_EXPOSE' }] }
    }
    throw new Error('unexpected query')
  }) }
}

async function context(input: Parameters<typeof database>[0]) {
  const db = database(input)
  const result = await buildMissionOperationalContext(db as never, { organizationId: 'org-a', query: 'Desenhar estratégia',
    requestedModules: [], capabilityManifest: [], accountAvailability })
  return { db, result }
}

describe('Mission connection state source', () => {
  it('recognizes an account email connection in its actual email table', async () => {
    const { db, result } = await context({ ownEmail: true })
    expect(result.accountAvailability?.connections).toContainEqual({ key: 'email', status: 'connected' })
    expect(db.query.mock.calls.some(([sql]) => sql.includes('email_provider_connections'))).toBe(true)
  })

  it('distinguishes central configured email from an unverified account sender without granting delivery', async () => {
    const { result } = await context({ centralEmail: true })
    expect(result.accountAvailability?.connections).toContainEqual({ key: 'email', status: 'unverified', platformConfigured: true })
    expect(result.providerHealth.channels.some(channel => channel.key === 'email' && channel.ready)).toBe(false)
    expect(result.capabilityManifest).toEqual([])
    expect(JSON.stringify(result)).not.toMatch(/DO_NOT_EXPOSE|private_secret|smtp2go/)
  })

  it('reports uncertainty after a failed query, and never infers a WhatsApp connection from a module', async () => {
    const { result } = await context({ unavailable: true })
    expect(result.accountAvailability?.connections).toContainEqual({ key: 'email', status: 'unverified' })
    expect(result.accountAvailability?.connections).toContainEqual({ key: 'whatsapp', status: 'unverified' })
    const missing = await context({})
    expect(missing.result.accountAvailability?.connections).toContainEqual({ key: 'whatsapp', status: 'not_connected' })
    const connected = await context({ whatsapp: true })
    expect(connected.result.accountAvailability?.connections).toContainEqual({ key: 'whatsapp', status: 'connected' })
  })
})
