import { forbidden } from '../http/errors.js'
import type { RequestContext } from '../http/request-context.js'

export type Operation =
  | 'platform.read'
  | 'platform.manage'
  | 'crm.read'
  | 'crm.write'
  | 'automations.read'
  | 'automations.write'
  | 'omnichannel.read'
  | 'omnichannel.write'
  | 'strategy.manage'
  | 'action_engine.read'
  | 'action_engine.write'
  | 'action_engine.economics.read'
  | 'action_engine.policy.manage'

export type Resource = {
  organizationId?: string | null
  moduleKey?: string
}

const moduleOperationKeys: Partial<Record<Operation, string>> = {
  'crm.read': 'crm',
  'crm.write': 'crm',
  'automations.read': 'automations',
  'automations.write': 'automations',
  'omnichannel.read': 'omnichannel',
  'omnichannel.write': 'omnichannel',
  'action_engine.read': 'action_engine',
  'action_engine.write': 'action_engine',
  'action_engine.economics.read': 'action_engine',
  'action_engine.policy.manage': 'action_engine',
}

export function canAccess(ctx: RequestContext, operation: Operation, resource: Resource = {}) {
  if (ctx.role === 'yux_admin') return true

  if (operation === 'platform.manage' || operation === 'strategy.manage') return false

  if (resource.organizationId && !ctx.organizationIds.includes(resource.organizationId)) return false

  const moduleKey = resource.moduleKey ?? moduleOperationKeys[operation]
  if (moduleKey && !ctx.enabledModuleKeys.includes(moduleKey)) return false

  if (ctx.role === 'yux_operator') return operation.endsWith('.read') || operation.endsWith('.write') || operation === 'action_engine.policy.manage'
  if (operation === 'action_engine.write') return false
  if (operation === 'action_engine.economics.read') return false
  if (operation === 'action_engine.policy.manage') return false
  if (ctx.role === 'client_admin') return !operation.startsWith('platform.')
  if (ctx.role === 'client_member') return operation.endsWith('.read')

  return false
}

export function requireAccess(ctx: RequestContext, operation: Operation, resource: Resource = {}) {
  if (!canAccess(ctx, operation, resource)) throw forbidden()
}
