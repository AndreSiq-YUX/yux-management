import type { Queryable } from '../repository.js'
import { collectAutomationsBaseline } from './automations.js'
import { collectCampaignsBaseline } from './campaigns.js'
import { collectCrmBaseline } from './crm.js'

export async function collectMissionBaseline(client: Queryable, input: {
  organizationId: string
  allowedModules: string[]
}): Promise<Record<string, unknown>> {
  const allowed = new Set(input.allowedModules)
  const [crm, automations, campaigns] = await Promise.all([
    allowed.has('crm') ? safe(() => collectCrmBaseline(client, input.organizationId)) : Promise.resolve({ available: false, reason: 'module_not_allowed' }),
    allowed.has('automations') ? safe(() => collectAutomationsBaseline(client, input.organizationId)) : Promise.resolve({ available: false, reason: 'module_not_allowed' }),
    allowed.has('campaigns') ? safe(() => collectCampaignsBaseline(client, input.organizationId)) : Promise.resolve({ available: false, reason: 'module_not_allowed' }),
  ])
  return { crm, automations, campaigns }
}

async function safe<T>(collect: () => Promise<T>): Promise<T | { available: false; reason: string }> {
  try { return await collect() }
  catch { return { available: false, reason: 'module_state_unavailable' } }
}
