import { describe, expect, it } from 'vitest'
import {
  activateProvisionedCrmInstance,
  setContractModule,
  syncCrmInstanceEntitlement,
} from '../src/modules/platform/repository.js'

type QueryCall = {
  sql: string
  params?: unknown[]
}

class FakeExecutor {
  calls: QueryCall[] = []

  async query(sql: string, params?: unknown[]): Promise<{ rows: Array<Record<string, unknown>>; rowCount: number }> {
    this.calls.push({ sql, params })
    return { rows: [], rowCount: 1 }
  }
}

describe('platform CRM provisioning', () => {
  it('creates or restores a draft CRM instance when the module is enabled', async () => {
    const executor = new FakeExecutor()

    await syncCrmInstanceEntitlement(executor as never, 'contract-1', true)

    expect(executor.calls).toHaveLength(1)
    expect(executor.calls[0].sql).toContain('INSERT INTO public.crm_instances')
    expect(executor.calls[0].sql).toContain("SELECT target_organization.id, target_contract.id, 'draft'")
    expect(executor.calls[0].sql).toContain('ON CONFLICT (contract_id) DO UPDATE')
    expect(executor.calls[0].params).toEqual(['contract-1'])
  })

  it('pauses the CRM instance when the module is disabled', async () => {
    const executor = new FakeExecutor()

    await syncCrmInstanceEntitlement(executor as never, 'contract-1', false)

    expect(executor.calls).toHaveLength(1)
    expect(executor.calls[0].sql).toContain("ELSE 'paused'")
    expect(executor.calls[0].params).toEqual(['contract-1'])
  })

  it('activates CRM only after entitlement and an active pipeline exist', async () => {
    const executor = new FakeExecutor()

    await activateProvisionedCrmInstance(executor as never, 'crm-1', 'admin-1')

    expect(executor.calls).toHaveLength(1)
    expect(executor.calls[0].sql).toContain("SET status = 'active'")
    expect(executor.calls[0].sql).toContain("target_module.module_key = 'crm'")
    expect(executor.calls[0].sql).toContain('target_pipeline.is_active = TRUE')
    expect(executor.calls[0].params).toEqual(['crm-1', 'admin-1'])
  })

  it('updates module entitlement and CRM provisioning in one transaction', async () => {
    const client = new FakeExecutor()
    const originalQuery = client.query.bind(client)
    client.query = async (sql: string, params?: unknown[]) => {
      const result = await originalQuery(sql, params)
      if (sql.includes('INSERT INTO public.contract_modules')) {
        return {
          rows: [{ contract_id: 'contract-1', module_key: 'crm', enabled: true }],
          rowCount: 1,
        }
      }
      return result
    }
    let released = false
    const pool = {
      async connect() {
        return {
          query: client.query.bind(client),
          release() {
            released = true
          },
        }
      },
    }

    await expect(setContractModule(pool as never, 'contract-1', 'crm', true)).resolves.toEqual({
      contractId: 'contract-1',
      moduleKey: 'crm',
      enabled: true,
    })

    expect(client.calls.map(call => call.sql)).toEqual([
      'BEGIN',
      expect.stringContaining('INSERT INTO public.contract_modules'),
      expect.stringContaining('INSERT INTO public.crm_instances'),
      'COMMIT',
    ])
    expect(released).toBe(true)
  })
})
