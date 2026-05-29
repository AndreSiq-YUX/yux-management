import { describe, expect, it } from 'vitest'
import {
  canAccessModule,
  hasEveryPermission,
  hasPermission,
  isModuleEnabled,
} from '@/lib/platform/accessControl'
import { PLATFORM_MODULES, getPlatformModule } from '@/lib/platform/moduleRegistry'
import type { PlatformModule, PlatformRole } from '@/types/platform'

describe('platform domain types', () => {
  it('supports module and role primitives used by the platform foundation', () => {
    const module: PlatformModule = {
      key: 'crm',
      name: 'CRM',
      base: false,
      internalRoute: '/crm',
      portalRoute: null,
      requiredPermissions: ['crm.read'],
    }

    const role: PlatformRole = {
      key: 'yux_admin',
      name: 'YUX Admin',
      permissions: ['crm.read'],
      scope: 'internal',
    }

    expect(module.key).toBe('crm')
    expect(role.permissions).toContain('crm.read')
  })
})

describe('access control', () => {
  const role: PlatformRole = {
    key: 'yux_admin',
    name: 'YUX Admin',
    scope: 'internal',
    permissions: ['projects.read', 'clients.read'],
  }

  const ownerRole: PlatformRole = {
    key: 'yux_owner',
    name: 'YUX Owner',
    scope: 'internal',
    permissions: ['platform.manage'],
  }

  it('checks individual permissions', () => {
    expect(hasPermission(role, 'projects.read')).toBe(true)
    expect(hasPermission(role, 'finance.write')).toBe(false)
  })

  it('checks every required permission', () => {
    expect(hasEveryPermission(role, ['projects.read', 'clients.read'])).toBe(true)
    expect(hasEveryPermission(role, ['projects.read', 'campaigns.read'])).toBe(false)
  })

  it('allows platform.manage to satisfy any permission check', () => {
    expect(hasPermission(ownerRole, 'finance.write')).toBe(true)
    expect(hasEveryPermission(ownerRole, ['blueprints.write', 'automations.write'])).toBe(true)
  })

  it('requires base modules to be explicitly enabled', () => {
    const module = getPlatformModule('projects')!

    expect(isModuleEnabled(module, [])).toBe(false)
  })

  it('blocks optional modules that are not enabled', () => {
    const module = getPlatformModule('campaigns')!

    expect(isModuleEnabled(module, ['projects'])).toBe(false)
    expect(canAccessModule(module, role, ['projects'])).toBe(false)
  })

  it('allows an enabled module when role has required permissions', () => {
    const module = getPlatformModule('campaigns')!
    const campaignRole: PlatformRole = {
      key: 'campaign_manager',
      name: 'Campaign Manager',
      scope: 'internal',
      permissions: ['campaigns.read'],
    }

    expect(canAccessModule(module, campaignRole, ['campaigns'])).toBe(true)
  })
})

describe('module registry', () => {
  it('contains the modules required by the approved YUX OS design', () => {
    const keys = PLATFORM_MODULES.map(module => module.key)

    expect(keys).toContain('clients')
    expect(keys).toContain('crm')
    expect(keys).toContain('projects')
    expect(keys).toContain('proposals')
    expect(keys).toContain('whatsapp_ai')
    expect(keys).toContain('campaigns')
    expect(keys).toContain('bi_reports')
    expect(keys).toContain('automations')
    expect(keys).toContain('support')
    expect(keys).toContain('finance')
    expect(keys).toContain('blueprints')
  })

  it('can find a module by key', () => {
    expect(getPlatformModule('projects')?.name).toBe('Projetos e Entregas')
  })
})
