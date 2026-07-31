import { describe, expect, it } from 'vitest'
import {
  getLimitStatus,
  isProviderFailing,
  maskSecretReference,
  summarizeAdminHub,
} from '@/lib/platform/adminRules'

describe('adminRules', () => {
  it('marks ok usage below attention threshold', () => {
    expect(getLimitStatus(79, 100)).toBe('ok')
  })

  it('marks near limit at 80 percent usage', () => {
    expect(getLimitStatus(80, 100)).toBe('near_limit')
  })

  it('marks over limit above the configured limit', () => {
    expect(getLimitStatus(101, 100)).toBe('over_limit')
  })

  it('treats missing or zero limits as ok', () => {
    expect(getLimitStatus(500)).toBe('ok')
    expect(getLimitStatus(500, null)).toBe('ok')
    expect(getLimitStatus(500, 0)).toBe('ok')
  })

  it('masks provider secret references', () => {
    expect(maskSecretReference('smtp2go:master-api-key')).toBe('smtp2go:***********')
    expect(maskSecretReference('vault-provider-key')).toBe('***********')
    expect(maskSecretReference(null)).toBe('Nao configurado')
  })

  it('detects provider statuses that require attention', () => {
    expect(isProviderFailing('failed')).toBe(true)
    expect(isProviderFailing('needs_reauth')).toBe(true)
    expect(isProviderFailing('stale')).toBe(true)
    expect(isProviderFailing('degraded')).toBe(true)
    expect(isProviderFailing('active')).toBe(false)
    expect(isProviderFailing('disabled')).toBe(false)
    expect(isProviderFailing('not_configured')).toBe(false)
  })

  it('summarizes failing providers and limit attention states', () => {
    expect(summarizeAdminHub({
      clients: [{ id: 'org-1' }, { id: 'org-2' }],
      contracts: [
        { id: 'contract-1', status: 'active' },
        { id: 'contract-2', status: 'paused' },
      ],
      modules: ['crm', 'automations', 'crm'],
      providers: [
        { id: 'provider-1', status: 'failed' },
        { id: 'provider-2', status: 'active' },
        { id: 'provider-3', status: 'stale' },
      ],
      usage: [
        { id: 'usage-1', status: 'near_limit' },
        { id: 'usage-2', status: 'over_limit' },
        { id: 'usage-3', status: 'blocked' },
        { id: 'usage-4', status: 'ok' },
      ],
    })).toEqual({
      clientCount: 2,
      activeContractCount: 1,
      activeModuleCount: 2,
      failingProviderCount: 2,
      nearLimitCount: 3,
    })
  })
})
