import { canAccessModule } from '@/lib/platform/accessControl'
import { PLATFORM_MODULES } from '@/lib/platform/moduleRegistry'
import type { PlatformContext } from '@/types/platform'

export interface NavigationItem {
  label: string
  href: string
  moduleKey?: string
}

export function buildNavigation(context: PlatformContext): NavigationItem[] {
  const baseItems: NavigationItem[] =
    context.mode === 'internal'
      ? [
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Contratos', href: '/contracts' },
          { label: 'Modulos', href: '/modules' },
        ]
      : [{ label: 'Portal', href: '/portal' }]

  const moduleItems = PLATFORM_MODULES.flatMap(module => {
    const href = context.mode === 'internal' ? module.internalRoute : module.portalRoute

    if (!href || !canAccessModule(module, context.role, context.enabledModuleKeys)) {
      return []
    }

    return [
      {
        label: module.name,
        href,
        moduleKey: module.key,
      },
    ]
  })

  return [...baseItems, ...moduleItems]
}
