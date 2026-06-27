import { describe, expect, it } from 'vitest'
import { ApiError } from '../src/http/errors.js'
import type { RequestContext } from '../src/http/request-context.js'
import { canAccess, requireAccess } from '../src/policies/authorization.js'

const clientMemberCtx: RequestContext = {
  userId: 'user-1',
  role: 'client_member',
  organizationIds: ['org-1'],
  activeOrganizationId: 'org-1',
  enabledModuleKeys: ['crm', 'omnichannel'],
}

describe('authorization policy', () => {
  it('allows yux_admin to manage platform and strategy across modules', () => {
    const adminCtx: RequestContext = {
      ...clientMemberCtx,
      role: 'yux_admin',
      organizationIds: [],
      enabledModuleKeys: [],
    }

    expect(canAccess(adminCtx, 'platform.manage')).toBe(true)
    expect(canAccess(adminCtx, 'strategy.manage', { organizationId: 'org-2', moduleKey: 'automations' })).toBe(true)
  })

  it('allows client member reads but denies writes for enabled modules', () => {
    expect(canAccess(clientMemberCtx, 'crm.read', { organizationId: 'org-1', moduleKey: 'crm' })).toBe(true)
    expect(canAccess(clientMemberCtx, 'crm.write', { organizationId: 'org-1', moduleKey: 'crm' })).toBe(false)
  })

  it('denies cross-organization access', () => {
    expect(canAccess(clientMemberCtx, 'crm.read', { organizationId: 'org-2', moduleKey: 'crm' })).toBe(false)
  })

  it('checks the operation module when moduleKey is absent', () => {
    expect(canAccess(clientMemberCtx, 'omnichannel.read', { organizationId: 'org-1' })).toBe(true)
    expect(canAccess(clientMemberCtx, 'automations.read', { organizationId: 'org-1' })).toBe(false)
  })

  it('denies platform and strategy management for non-admin roles', () => {
    const clientAdminCtx: RequestContext = {
      ...clientMemberCtx,
      role: 'client_admin',
    }
    const operatorCtx: RequestContext = {
      ...clientMemberCtx,
      role: 'yux_operator',
    }

    expect(canAccess(clientAdminCtx, 'platform.manage')).toBe(false)
    expect(canAccess(operatorCtx, 'strategy.manage')).toBe(false)
  })

  it('throws forbidden for unauthorized operations', () => {
    expect(() => requireAccess(clientMemberCtx, 'platform.manage')).toThrow('forbidden')
    expect(() => requireAccess(clientMemberCtx, 'platform.manage')).toThrow(ApiError)
  })
})
