import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  adminPlatformService,
  buildClientModuleLimitPayload,
  buildEmailProviderConnectionPayload,
  buildProviderConnectionPayload,
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

  it('builds provider connection payloads without raw secret values', () => {
    expect(buildProviderConnectionPayload({
      providerType: 'llm',
      providerKey: ' openrouter ',
      displayName: ' OpenRouter ',
      publicConfig: { primaryModel: 'openai/gpt-4.1-mini' },
      secretReference: ' OPENROUTER_API_KEY ',
      isDefault: true,
    })).toEqual({
      provider_type: 'llm',
      provider_key: 'openrouter',
      display_name: 'OpenRouter',
      environment: 'production',
      status: 'not_configured',
      public_config: { primaryModel: 'openai/gpt-4.1-mini' },
      secret_reference: 'OPENROUTER_API_KEY',
      is_default: true,
      fallback_provider_id: null,
    })
  })

  it('upserts provider connections by provider type key and environment', async () => {
    const upsertMock = vi.fn(() => ({
      select: () => ({
        single: async () => ({
          data: {
            id: 'provider-2',
            provider_type: 'llm',
            provider_key: 'openrouter',
            display_name: 'OpenRouter',
            environment: 'production',
            status: 'not_configured',
            public_config: { primaryModel: 'openai/gpt-4.1-mini' },
            secret_reference: 'OPENROUTER_API_KEY',
            last_checked_at: null,
            last_error: null,
            is_default: true,
            fallback_provider_id: null,
            created_at: '2026-06-04T12:00:00Z',
            updated_at: '2026-06-04T12:00:00Z',
          },
          error: null,
        }),
      }),
    }))

    fromMock.mockReturnValueOnce({ upsert: upsertMock })

    await expect(adminPlatformService.upsertProviderConnection({
      providerType: 'llm',
      providerKey: 'openrouter',
      displayName: 'OpenRouter',
      publicConfig: { primaryModel: 'openai/gpt-4.1-mini' },
      secretReference: 'OPENROUTER_API_KEY',
      isDefault: true,
    })).resolves.toEqual(expect.objectContaining({
      id: 'provider-2',
      providerType: 'llm',
      providerKey: 'openrouter',
      secretReference: 'OPENROUTER_API_KEY',
    }))

    expect(upsertMock).toHaveBeenCalledWith(expect.objectContaining({
      provider_type: 'llm',
      provider_key: 'openrouter',
    }), { onConflict: 'provider_type,provider_key,environment' })
  })

  it('builds SMTP2GO organization connection payloads', () => {
    expect(buildEmailProviderConnectionPayload({
      organizationId: 'org-1',
      status: 'connected',
      tokenReference: ' SMTP2GO_API_KEY ',
      defaultFromEmail: ' contato@yux.com.br ',
      defaultFromName: ' YUX Hub ',
      dailySendLimit: 900,
      metadata: { domain: 'yux.com.br' },
    })).toEqual({
      organization_id: 'org-1',
      provider: 'smtp2go',
      status: 'connected',
      token_reference: 'SMTP2GO_API_KEY',
      default_from_email: 'contato@yux.com.br',
      default_from_name: 'YUX Hub',
      daily_send_limit: 900,
      metadata: { domain: 'yux.com.br' },
    })
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

  it('gets global upload limit from system_config', async () => {
    fromMock.mockReturnValueOnce({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: async () => ({
            data: { value: { limit: 15 } },
            error: null,
          }),
        })),
      })),
    })

    const limit = await adminPlatformService.getGlobalUploadLimit()
    expect(limit).toBe(15)
    expect(fromMock).toHaveBeenCalledWith('system_config')
  })

  it('updates global upload limit in system_config', async () => {
    const upsertMock = vi.fn(async () => ({ error: null }))
    fromMock.mockReturnValueOnce({ upsert: upsertMock })

    await adminPlatformService.updateGlobalUploadLimit(20)
    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'global_max_upload_size_mb',
        value: { limit: 20 },
      }),
      { onConflict: 'key' }
    )
  })

  it('gets organizations list mapped with their custom upload limits', async () => {
    // 1. mock organizations query
    fromMock.mockReturnValueOnce({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          order: async () => ({
            data: [
              { id: 'org-1', name: 'Client 1', slug: 'client-1' },
              { id: 'org-2', name: 'Client 2', slug: 'client-2' },
            ],
            error: null,
          }),
        })),
      })),
    })

    // 2. mock omnichannel settings query
    fromMock.mockReturnValueOnce({
      select: vi.fn(async () => ({
        data: [
          { organization_id: 'org-1', max_upload_size_mb: 25 },
        ],
        error: null,
      })),
    })

    const result = await adminPlatformService.getOrganizationsWithLimits()
    expect(result).toEqual([
      { id: 'org-1', name: 'Client 1', slug: 'client-1', limit: 25 },
      { id: 'org-2', name: 'Client 2', slug: 'client-2', limit: null },
    ])
  })

  it('updates or inserts custom client upload limit in omnichannel_settings', async () => {
    // Test case: settings exist (update path)
    fromMock.mockReturnValueOnce({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: async () => ({
            data: { organization_id: 'org-1' },
            error: null,
          }),
        })),
      })),
    })

    const updateMock = vi.fn(() => ({
      eq: async () => ({ error: null }),
    }))
    fromMock.mockReturnValueOnce({ update: updateMock })

    await adminPlatformService.updateClientUploadLimit('org-1', 12)
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ max_upload_size_mb: 12 })
    )
  })
})
