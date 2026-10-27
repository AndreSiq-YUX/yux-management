import type { ActionPackVersion } from './action-pack.js'
import type { MissionAccountAvailability } from './mission-account-availability.js'

export function conversationPackAvailable(pack: ActionPackVersion, allowedKeys: Set<string>, state: MissionAccountAvailability) {
  if (!pack.topologyTemplate.steps.every(step => allowedKeys.has(step.capabilityKey))) return false
  if (pack.key === 'crm_preparation') return state.preparation?.available === true
  if (pack.key === 'funnel_nurture') return state.enabledModules.includes('funnel_nurture_agent')
    && state.preparation?.crmStatus === 'active' && state.connections?.some(item => item.key === 'email' && item.status === 'connected') === true
  return true
}
