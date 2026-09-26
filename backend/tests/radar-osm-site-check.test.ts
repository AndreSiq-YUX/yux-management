import { describe, expect, it, vi } from 'vitest'
import { checkRadarOsmSite, isPublicRadarSiteIp } from '../src/modules/radar/osm-site-check.js'

describe('Radar OSM site check', () => {
  it('rejects private, reserved and IPv6 addresses', () => {
    expect(isPublicRadarSiteIp('127.0.0.1')).toBe(false)
    expect(isPublicRadarSiteIp('10.0.0.1')).toBe(false)
    expect(isPublicRadarSiteIp('169.254.169.254')).toBe(false)
    expect(isPublicRadarSiteIp('::1')).toBe(false)
    expect(isPublicRadarSiteIp('8.8.8.8')).toBe(true)
  })

  it('keeps a missing site unknown and never requests it', async () => {
    const head = vi.fn()
    expect(await checkRadarOsmSite(null, { head })).toMatchObject({ status: 'unknown', reason: 'site_not_in_source' })
    expect(head).not.toHaveBeenCalled()
  })

  it('confirms a reachable public site but never infers absence from HTTP failure', async () => {
    const resolve = vi.fn(async () => ['8.8.8.8'])
    const found = await checkRadarOsmSite('https://clinic.example', { resolve, head: async () => ({ status: 200 }) })
    const missing = await checkRadarOsmSite('https://clinic.example', { resolve, head: async () => ({ status: 404 }) })
    expect(found.status).toBe('verified_present')
    expect(missing.status).toBe('unknown')
  })

  it('blocks private redirect destinations before contacting them', async () => {
    const head = vi.fn(async () => ({ status: 302, location: 'http://127.0.0.1/admin' }))
    const result = await checkRadarOsmSite('https://clinic.example', { resolve: async () => ['8.8.8.8'], head })
    expect(result).toMatchObject({ status: 'blocked', reason: 'private_or_reserved_address' })
    expect(head).toHaveBeenCalledTimes(1)
  })
})
