import type pg from 'pg'
import { describe, expect, it, vi } from 'vitest'
import { requireRadarScope } from '../src/modules/radar/access.js'
import { listRadarCampaigns, batchAnalyzeRadarOpportunities, updateRadarDataSource } from '../src/modules/radar/repository.js'

const client = { id: 'user', name: 'Cliente', email: 'client@example.test', role: 'client_admin' }
function database(allowed = true, rows = [{ id: 'resource', organization_id: 'org' }]) {
  const query = vi.fn(async (sql: string, _params: unknown[] = []) => {
    if (sql.includes('AS allowed')) return { rows: [{ allowed }] }
    if (sql.includes('SELECT id, organization_id')) return { rows }
    if (sql.includes('FROM public.radar_campaigns')) return { rows: [] }
    throw new Error('Unexpected effect: ' + sql)
  })
  return { query } as unknown as pg.Pool & { query: typeof query }
}

describe('contracted Radar client authorization', () => {
  it('allows the contracted member to read their organization', async () => {
    const pool = database()
    await expect(listRadarCampaigns(pool, client, 'org')).resolves.toEqual([])
    expect(pool.query.mock.calls[0][0]).toContain("module.module_key = 'radar'")
    expect(pool.query.mock.calls[0][0]).toContain("candidate.status = 'active'")
    expect(pool.query.mock.calls[0][0]).toContain('ORDER BY candidate.starts_at DESC, candidate.id DESC LIMIT 1')
  })

  it.each(['not contracted', 'disabled module', 'inactive contract', 'other organization', 'missing permission'])(
    'denies %s before reading campaign data', async () => {
      const pool = database(false)
      await expect(listRadarCampaigns(pool, client, 'org')).rejects.toMatchObject({ statusCode: 403 })
      expect(pool.query).toHaveBeenCalledTimes(1)
    },
  )

  it.each(['campaignId', 'candidateId', 'duplicateId', 'opportunityId'] as const)(
    'checks ownership of direct %s access', async key => {
      const pool = database(true, [{ id: 'resource', organization_id: 'other-org' }])
      await expect(requireRadarScope(pool, client, { organizationId: 'org', [key]: 'resource' }))
        .rejects.toMatchObject({ statusCode: 403 })
      expect(pool.query).toHaveBeenCalledTimes(1)
    },
  )

  it('rejects missing resource IDs without revealing whether they exist elsewhere', async () => {
    await expect(requireRadarScope(database(true, []), client, { candidateId: 'missing' }))
      .rejects.toMatchObject({ statusCode: 403 })
  })

  it('authorizes all organizations in a mixed batch before any mutation', async () => {
    const pool = database(true, [{ id: 'one', organization_id: 'org' }, { id: 'two', organization_id: 'other-org' }])
    pool.query.mockImplementation(async (sql, params) => {
      if (sql.includes('SELECT id, organization_id')) return { rows: [
        { id: 'one', organization_id: 'org' }, { id: 'two', organization_id: 'other-org' },
      ] } as never
      if (sql.includes('AS allowed')) return { rows: [{ allowed: params?.[1] === 'org' }] } as never
      throw new Error('A batch must not execute before all items are authorized')
    })
    await expect(batchAnalyzeRadarOpportunities(pool, client, ['one', 'two'])).rejects.toMatchObject({ statusCode: 403 })
    expect(pool.query).toHaveBeenCalledTimes(3)
  })

  it('requires management permission for writes and CRM separately for lead conversion', async () => {
    const pool = database()
    await requireRadarScope(pool, client, { opportunityId: 'resource' }, true, true)
    expect(pool.query.mock.calls[1][1]).toEqual(['user', 'org', 'radar:manage', true])
    expect(pool.query.mock.calls[1][0]).toContain("crm.module_key = 'crm'")
  })

  it('never lets a customer change the global source catalog', async () => {
    const pool = database()
    await expect(updateRadarDataSource(pool, client, 'source', { enabled: true }))
      .rejects.toMatchObject({ statusCode: 403 })
    expect(pool.query).not.toHaveBeenCalled()
  })

  it('preserves the internal operator path and denies unknown users', async () => {
    const pool = database()
    await requireRadarScope(pool, { ...client, role: 'yux_operator' }, { organizationId: 'org' })
    await expect(requireRadarScope(pool, { ...client, role: 'unknown' }, { organizationId: 'org' }))
      .rejects.toMatchObject({ statusCode: 403 })
    expect(pool.query).not.toHaveBeenCalled()
  })
})
