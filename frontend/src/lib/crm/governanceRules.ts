import type {
  CrmAssignmentMode,
  CrmInstance,
  CrmInstanceMember,
  CrmInstanceRole,
  CrmLead,
  CrmMigrationStrategy,
  CrmTeamMember,
} from '@/types/crm'

export interface SeatDecision {
  allowed: boolean
  reason?: 'seller_seat_limit_reached' | 'manager_seat_limit_reached' | 'admin_seat_limit_reached'
  currentCount: number
  limit: number
}

export interface PublishImpact {
  pipelinesChanged: boolean
  customFieldsChanged: boolean
  categoriesChanged: boolean
  impactedOpenLeadCount: number
  migrationStrategy?: CrmMigrationStrategy
}

export const seatLimitForRole = (instance: CrmInstance, role: CrmInstanceRole) => {
  if (role === 'seller') return instance.sellerSeatLimit
  if (role === 'manager') return instance.managerSeatLimit
  if (role === 'client_admin') return instance.adminSeatLimit
  return Number.POSITIVE_INFINITY
}

export const canAddCrmMember = (
  instance: CrmInstance,
  members: CrmInstanceMember[],
  role: CrmInstanceRole,
): SeatDecision => {
  const limit = seatLimitForRole(instance, role)
  const currentCount = members.filter(item => item.role === role && item.status !== 'disabled').length

  if (currentCount >= limit) {
    const reason = role === 'seller'
      ? 'seller_seat_limit_reached'
      : role === 'manager'
        ? 'manager_seat_limit_reached'
        : 'admin_seat_limit_reached'
    return { allowed: false, reason, currentCount, limit }
  }

  return { allowed: true, currentCount, limit }
}

export const canMemberSeeLead = (
  member: CrmInstanceMember,
  lead: Pick<CrmLead, 'ownerMemberId' | 'teamId'>,
  teamMemberships: CrmTeamMember[],
) => {
  if (member.role === 'yux_admin' || member.role === 'client_admin') return true
  if (member.role === 'seller') return lead.ownerMemberId === member.id

  if (member.role === 'manager') {
    return teamMemberships.some(item => (
      item.memberId === member.id &&
      item.role === 'manager' &&
      item.teamId === lead.teamId
    ))
  }

  return false
}

export const canManageCrmConfiguration = (
  member: CrmInstanceMember,
  capability: 'pipeline' | 'field' | 'category',
  instance: CrmInstance,
) => {
  if (member.role === 'yux_admin') return true
  if (member.role !== 'client_admin') return false
  if (capability === 'pipeline') return instance.allowClientPipelineCustomization
  if (capability === 'field') return instance.allowClientFieldCustomization
  return instance.allowClientCategoryCustomization
}

export const canPublishCrmConfiguration = (impact: PublishImpact) => {
  const structuralChange = impact.pipelinesChanged || impact.customFieldsChanged || impact.categoriesChanged

  if (!structuralChange) return { allowed: true as const }
  if (impact.impactedOpenLeadCount > 0 && !impact.migrationStrategy) {
    return { allowed: false as const, reason: 'migration_strategy_required' as const }
  }

  return { allowed: true as const }
}

export const chooseLeadMigrationStrategy = (
  input: Pick<PublishImpact, 'pipelinesChanged' | 'customFieldsChanged' | 'impactedOpenLeadCount'>,
): CrmMigrationStrategy => {
  if (!input.pipelinesChanged && !input.customFieldsChanged) return 'keep_existing'
  if (input.impactedOpenLeadCount === 0) return 'migrate_all'
  return 'mapped_stages'
}

export const normalizeAssignmentMode = (mode: CrmAssignmentMode | null | undefined): CrmAssignmentMode => (
  mode || 'queue'
)
