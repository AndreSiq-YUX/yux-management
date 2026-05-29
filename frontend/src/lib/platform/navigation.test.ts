import { describe, expect, it } from 'vitest'
import { buildNavigation } from '@/lib/platform/navigation'
import type { PlatformContext } from '@/types/platform'

const internalContext: PlatformContext = {
  mode: 'internal',
  organization: null,
  membership: null,
  role: {
    key: 'yux_admin',
    name: 'YUX Admin',
    scope: 'internal',
    permissions: ['platform.manage'],
  },
  enabledModuleKeys: ['crm', 'projects', 'campaigns', 'blueprints'],
}

describe('buildNavigation', () => {
  it('builds internal navigation from active modules and permissions', () => {
    const items = buildNavigation(internalContext)
    const labels = items.map(item => item.label)

    expect(items[0]).toEqual({ label: 'Dashboard', href: '/dashboard' })
    expect(labels).toContain('Clientes')
    expect(labels).toContain('CRM')
    expect(labels).toContain('Projetos e Entregas')
    expect(labels).toContain('Campanhas e Ads')
    expect(labels).toContain('Blueprints')
    expect(items.find(item => item.moduleKey === 'crm')?.href).toBe('/leads')
  })

  it('builds portal navigation without internal-only modules', () => {
    const items = buildNavigation({
      ...internalContext,
      mode: 'portal',
      role: {
        key: 'client_admin',
        name: 'Client Admin',
        scope: 'client',
        permissions: ['projects.read', 'campaigns.read', 'support.read'],
      },
      enabledModuleKeys: ['projects', 'campaigns', 'support', 'blueprints'],
    })
    const labels = items.map(item => item.label)

    expect(items[0]).toEqual({ label: 'Portal', href: '/portal' })
    expect(labels).toContain('Projetos e Entregas')
    expect(labels).toContain('Campanhas e Ads')
    expect(labels).toContain('Suporte')
    expect(labels).not.toContain('Clientes')
    expect(labels).not.toContain('Blueprints')
    expect(items.find(item => item.moduleKey === 'campaigns')?.href).toBe('/portal/campaigns')
  })
})
