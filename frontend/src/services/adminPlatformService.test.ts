import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiRequest } from '@/lib/apiClient'
import {
  adminPlatformService,
  buildClientModuleLimitPayload,
  buildEmailProviderConnectionPayload,
  buildProviderConnectionPayload,
  buildSmtp2GoSubaccountPayload,
} from './adminPlatformService'

vi.mock('@/lib/apiClient', () => ({
  apiRequest: vi.fn(),
}))

const apiRequestMock = vi.mocked(apiRequest)

describe('adminPlatformService', () => {
  beforeEach(() => {
    apiRequestMock.mockReset()
  })

  it('loads provider connections through the backend admin endpoint', async () => {
    apiRequestMock.mockResolvedValueOnce([{
      id: 'provider-1',
      providerType: 'email',
      providerKey: 'smtp2go',
      displayName: 'SMTP2GO',
      environment: 'production',
      status: 'active',
      publicConfig: { sender: 'mail.yux.com.br' },
      secretReference: 'smtp2go:master',
      isDefault: true,
    }])

    await expect(adminPlatformService.getProviderConnections()).resolves.toEqual([
      expect.objectContaining({
        id: 'provider-1',
        providerType: 'email',
        providerKey: 'smtp2go',
      }),
    ])
    expect(apiRequestMock).toHaveBeenCalledWith('/platform/admin/provider-connections')
  })

  it('upserts client module limits through the backend admin endpoint', async () => {
    apiRequestMock.mockResolvedValueOnce({
      id: 'limit-1',
      organizationId: 'org-1',
      contractId: null,
      moduleKey: 'crm',
      limitKey: 'ai_messages_monthly',
      limitValue: 1000,
      source: 'manual_override',
      metadata: { reason: 'pilot' },
    })

    const input = {
      organizationId: 'org-1',
      moduleKey: 'crm',
      limitKey: 'ai_messages_monthly',
      limitValue: 1000,
      source: 'manual_override' as const,
      effectiveFrom: '2026-06-04',
      metadata: { reason: 'pilot' },
    }

    await expect(adminPlatformService.upsertClientModuleLimit(input)).resolves.toEqual(expect.objectContaining({
      id: 'limit-1',
      organizationId: 'org-1',
      moduleKey: 'crm',
      limitValue: 1000,
    }))
    expect(apiRequestMock).toHaveBeenCalledWith('/platform/admin/client-module-limits', {
      method: 'POST',
      body: input,
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
    const input = {
      providerType: 'llm' as const,
      providerKey: 'openrouter',
      displayName: 'OpenRouter',
      publicConfig: { primaryModel: 'openai/gpt-4.1-mini' },
      secretReference: 'OPENROUTER_API_KEY',
      isDefault: true,
    }
    apiRequestMock.mockResolvedValueOnce({
      id: 'provider-2',
      providerType: 'llm',
      providerKey: 'openrouter',
      secretReference: 'OPENROUTER_API_KEY',
    })

    await expect(adminPlatformService.upsertProviderConnection(input)).resolves.toEqual(expect.objectContaining({
      id: 'provider-2',
      providerType: 'llm',
      providerKey: 'openrouter',
    }))
    expect(apiRequestMock).toHaveBeenCalledWith('/platform/admin/provider-connections', {
      method: 'POST',
      body: input,
    })
  })

  it('builds SMTP2GO organization connection payloads', () => {
    expect(buildEmailProviderConnectionPayload({
      organizationId: 'org-1',
      status: 'connected',
      tokenReference: ' smtp2go:client ',
      defaultFromEmail: ' contato@yux.com.br ',
      defaultFromName: ' YUX Hub ',
      dailySendLimit: 900,
      metadata: { domain: 'yux.com.br' },
    })).toEqual({
      organization_id: 'org-1',
      provider: 'smtp2go',
      status: 'connected',
      token_reference: 'smtp2go:client',
      default_from_email: 'contato@yux.com.br',
      default_from_name: 'YUX Hub',
      daily_send_limit: 900,
      metadata: { domain: 'yux.com.br' },
    })
  })

  it('summarizes SMTP2GO administration counters through the backend endpoint', async () => {
    apiRequestMock.mockResolvedValueOnce({
      connectionCount: 2,
      subaccountCount: 5,
      sentToday: 20,
      failedToday: 3,
      suppressedCount: 7,
    })

    await expect(adminPlatformService.getSmtp2GoSummary()).resolves.toEqual({
      connectionCount: 2,
      subaccountCount: 5,
      sentToday: 20,
      failedToday: 3,
      suppressedCount: 7,
    })
    expect(apiRequestMock).toHaveBeenCalledWith('/platform/admin/smtp2go-summary')
  })

  it('builds SMTP2GO subaccount payloads', () => {
    expect(buildSmtp2GoSubaccountPayload({
      organizationId: 'org-1',
      connectionId: 'conn-1',
      smtp2goAccountId: ' smtp-123 ',
      name: ' Cliente SMTP2GO ',
      status: 'active',
      dailySendLimit: 700,
      monthlyQuota: 20000,
      metadata: { domain: 'cliente.com.br' },
    })).toEqual({
      organization_id: 'org-1',
      connection_id: 'conn-1',
      smtp2go_account_id: 'smtp-123',
      name: 'Cliente SMTP2GO',
      monthly_quota: 20000,
      daily_send_limit: 700,
      status: 'active',
      metadata: { domain: 'cliente.com.br' },
    })
  })

  it('loads and upserts SMTP2GO subaccounts through the backend admin endpoint', async () => {
    const input = {
      organizationId: 'org-1',
      connectionId: 'conn-1',
      smtp2goAccountId: 'smtp-123',
      name: 'Cliente SMTP2GO',
      status: 'active' as const,
      dailySendLimit: 700,
      monthlyQuota: 20000,
      metadata: { domain: 'cliente.com.br' },
    }
    apiRequestMock
      .mockResolvedValueOnce([{ id: 'sub-1', ...input }])
      .mockResolvedValueOnce({ id: 'sub-1', ...input })

    await expect(adminPlatformService.getSmtp2GoSubaccounts()).resolves.toEqual([expect.objectContaining({
      id: 'sub-1',
      smtp2goAccountId: 'smtp-123',
    })])
    await expect(adminPlatformService.upsertSmtp2GoSubaccount(input)).resolves.toEqual(expect.objectContaining({
      id: 'sub-1',
      connectionId: 'conn-1',
    }))

    expect(apiRequestMock).toHaveBeenNthCalledWith(1, '/platform/admin/smtp2go-subaccounts')
    expect(apiRequestMock).toHaveBeenNthCalledWith(2, '/platform/admin/smtp2go-subaccounts', {
      method: 'POST',
      body: input,
    })
  })

  it('gets and updates global upload limit through the backend', async () => {
    apiRequestMock.mockResolvedValueOnce({ limit: 15 }).mockResolvedValueOnce({ ok: true })

    await expect(adminPlatformService.getGlobalUploadLimit()).resolves.toBe(15)
    await adminPlatformService.updateGlobalUploadLimit(20)

    expect(apiRequestMock).toHaveBeenNthCalledWith(1, '/platform/admin/upload-limit/global')
    expect(apiRequestMock).toHaveBeenNthCalledWith(2, '/platform/admin/upload-limit/global', {
      method: 'PUT',
      body: { limit: 20 },
    })
  })

  it('gets organizations list mapped with their custom upload limits', async () => {
    apiRequestMock.mockResolvedValueOnce([
      { id: 'org-1', name: 'Client 1', slug: 'client-1', limit: 25 },
      { id: 'org-2', name: 'Client 2', slug: 'client-2', limit: null },
    ])

    await expect(adminPlatformService.getOrganizationsWithLimits()).resolves.toEqual([
      { id: 'org-1', name: 'Client 1', slug: 'client-1', limit: 25 },
      { id: 'org-2', name: 'Client 2', slug: 'client-2', limit: null },
    ])
    expect(apiRequestMock).toHaveBeenCalledWith('/platform/admin/upload-limit/organizations')
  })

  it('updates custom client upload limit through the backend', async () => {
    apiRequestMock.mockResolvedValueOnce({ ok: true })

    await adminPlatformService.updateClientUploadLimit('org-1', 12)
    expect(apiRequestMock).toHaveBeenCalledWith('/platform/admin/upload-limit/organizations/org-1', {
      method: 'PUT',
      body: { limit: 12 },
    })
  })
})
