import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AppEnv } from '../src/config/env.js'
import { createDefaultAutomationCommandServices } from '../src/modules/automation/command-adapters.js'

afterEach(() => vi.unstubAllGlobals())

describe('automation AI actions', () => {
  it('sends organization scope to the central agent runtime instead of the external webhook', async () => {
    const pool = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes('FROM public.organizations organization')) {
          return { rows: [{ client_id: 'client-1', contract_id: 'contract-1' }] }
        }
        return { rows: [] }
      }),
    }
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      const request = JSON.parse(String(init.body))
      expect(request).toMatchObject({
        organization_id: 'org-1',
        client_id: 'client-1',
        contract_id: 'contract-1',
        lead_id: 'lead-1',
        profile_key: 'ai_sdr_customizado',
        source: 'automation',
        mode: 'ai_generate_message',
        retrieval_context: { delivery_channel: 'whatsapp' },
      })
      return { ok: true, json: async () => ({ synthesis: { reply: { body: 'Mensagem contextualizada' } } }) }
    }))
    const services = createDefaultAutomationCommandServices(pool as never, {
      YUX_AGENT_RUNTIME_URL: 'http://agent-runtime:8080',
      YUX_AGENT_RUNTIME_TOKEN: 'runtime-token',
    } as AppEnv)

    const result = await services.dispatchExternal({
      organizationId: 'org-1',
      leadId: 'lead-1',
      idempotencyKey: 'idem-1',
      correlationId: 'correlation-1',
      causationId: 'cause-1',
      depth: 0,
      automationTrace: [],
      actor: { type: 'system' },
    }, 'ai_generate_message', { profileKey: 'ai_sdr_customizado', channel: 'whatsapp' }, {
      id: 'lead-1', organization_id: 'org-1', name: 'Ana',
    })

    expect(result).toMatchObject({ generated: true, actionType: 'ai_generate_message' })
  })
})
