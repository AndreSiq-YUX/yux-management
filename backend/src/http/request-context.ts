export type UserRole = 'yux_admin' | 'yux_operator' | 'client_admin' | 'client_member'

export type RequestContext = {
  userId: string
  role: UserRole
  organizationIds: string[]
  activeOrganizationId?: string
  enabledModuleKeys: string[]
}
