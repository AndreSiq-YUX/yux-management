import type { PermissionKey, PlatformModule, PlatformRole } from '@/types/platform'

export function hasPermission(role: PlatformRole | null, permission: PermissionKey) {
  if (!role) return false
  if (role.permissions.includes('platform.manage')) return true

  return role.permissions.includes(permission)
}

export function hasEveryPermission(role: PlatformRole | null, permissions: PermissionKey[]) {
  return permissions.every(permission => hasPermission(role, permission))
}

export function isModuleEnabled(module: PlatformModule, enabledModuleKeys: string[]) {
  return enabledModuleKeys.includes(module.key)
}

export function canAccessModule(
  module: PlatformModule,
  role: PlatformRole | null,
  enabledModuleKeys: string[],
) {
  return isModuleEnabled(module, enabledModuleKeys) && hasEveryPermission(role, module.requiredPermissions)
}
