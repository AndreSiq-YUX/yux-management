import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  adminPlatformService,
  buildClientModuleLimitPayload,
} from './adminPlatformService'

const fromMock = vi.fn()

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (...args: unknown[]) => fromMock(...args),
  },
}))

describe('adminPlatformService', () => {
  beforeEach(() => {
    fromMock.mockReset()
  })

  it('loads provider connections and maps snake_case fields without exposing secret values', async () => {
    fromMock.mockReturnValue({
      select: () => ({
        order: async () => ({
          data: [{
            id: 'provider-1',
            provider_type: 'email',
            provider_key: 'smtp2go',
            display_name: 'SMTP2GO',
            environment: 'production',
            status: 'active',
            public_config: { sender: 'mail.yux.com.br' },
            secret_reference: 'smtp2go:master',
            last_checked_at: null,
            last_error: null,
            is_default: true,
            fallback_provider_id: null,
            created_at: '2026-06-04T12:00:00Z',
            updated_at: '2026-06-04T12:00:00Z',
          }],
          error: null,
        }),
      }),
    })

    await expect(adminPlatformService.getProviderConnections()).resolves.toEqual([
      expect.objectContaining({
        id: 'provider-1',
        providerType: 'email',
        providerKey: 'smtp2go',
        displayName: 'SMTP2GO',
        publicConfig: { sender: 'mail.yux.com.br' },
        secretReference: 'smtp2go:master',
        isDefault: true,
      }),
    ])

    expect(fromMock).toHaveBeenCalledWith('platform_provider_connections')
  })

  it('upserts client module limits using lookup plus insert for organization-level limits', async () => {
    const insertMock = vi.fn(() => ({
      select: () => ({
        single: async () => ({
          data: {
            id: 'limit-1',
            organization_id: 'org-1',
            contract_id: null,
            module_key: 'crm',
            limit_key: 'ai_messages_monthly',
            limit_value: '1000',
            source: 'manual_override',
            effective_from: '2026-06-04',
            effective_until: null,
            metadata: { reason: 'pilot' },
            created_at: '2026-06-04T12:00:00Z',
            updated_at: '2026-06-04T12:00:00Z',
          },
          error: null,
        }),
      }),
    }))
    const lookupTable = {
      select: () => ({
        eq: () => ({
          eq: () => ({
            eq: () => ({
              is: () => ({
                maybeSingle: async () => ({ data: null, error: null }),
              }),
            }),
          }),
        }),
      }),
    }

    fromMock
      .mockReturnValueOnce(lookupTable)
      .mockReturnValueOnce({ insert: insertMock })

    await expect(adminPlatformService.upsertClientModuleLimit({
      organizationId: 'org-1',
      moduleKey: 'crm',
      limitKey: 'ai_messages_monthly',
      limitValue: 1000,
      source: 'manual_override',
      effectiveFrom: '2026-06-04',
      metadata: { reason: 'pilot' },
    })).resolves.toEqual(expect.objectContaining({
      id: 'limit-1',
      organizationId: 'org-1',
      contractId: null,
      moduleKey: 'crm',
      limitKey: 'ai_messages_monthly',
      limitValue: 1000,
      source: 'manual_override',
      metadata: { reason: 'pilot' },
    }))

    expect(insertMock).toHaveBeenCalledWith({
      organization_id: 'org-1',
      contract_id: null,
      module_key: 'crm',
      limit_key: 'ai_messages_monthly',
      limit_value: 1000,
      source: 'manual_override',
      effective_from: '2026-06-04',
      effective_until: null,
      metadata: { reason: 'pilot' },
    })
  })

  it('builds default client module limit payloads in snake_case', () => {
    expect(buildClientModuleLimitPayload({
      organizationId: 'org-1',
      contractId: 'contract-1',
      moduleKey: 'support',
      limitKey: 'tickets_monthly',
      limitValue: 250,
    })).toEqual(expect.objectContaining({
      organization_id: 'org-1',
      contract_id: 'contract-1',
      module_key: 'support',
      limit_key: 'tickets_monthly',
      limit_value: 250,
      source: 'contract',
      effective_until: null,
      metadata: {},
    }))
  })

  it('summarizes SMTP2GO administration counters for today', async () => {
    vi.setSystemTime(new Date('2026-06-04T14:30:00Z'))

    const usageEqMock = vi.fn(async (column: string, value: string) => ({
      data: [
        { sent_count: 12, failed_count: 1 },
        { sent_count: '8', failed_count: '2' },
      ],
      error: null,
      column,
      value,
    }))
    const countTable = (count: number) => ({
      select: vi.fn(async () => ({ data: null, error: null, count })),
    })

    fromMock
      .mockReturnValueOnce(countTable(2))
      .mockReturnValueOnce(countTable(5))
      .mockReturnValueOnce({
        select: vi.fn(() => ({ eq: usageEqMock })),
      })
      .mockReturnValueOnce(countTable(7))

    await expect(adminPlatformService.getSmtp2GoSummary()).resolves.toEqual({
      connectionCount: 2,
      subaccountCount: 5,
      sentToday: 20,
      failedToday: 3,
      suppressedCount: 7,
    })

    expect(fromMock).toHaveBeenNthCalledWith(1, 'email_provider_connections')
    expect(fromMock).toHaveBeenNthCalledWith(2, 'smtp2go_subaccounts')
    expect(fromMock).toHaveBeenNthCalledWith(3, 'email_usage_counters')
    expect(fromMock).toHaveBeenNthCalledWith(4, 'email_suppression_entries')
    expect(usageEqMock).toHaveBeenCalledWith('period_date', '2026-06-04')

    vi.useRealTimers()
  })
})
