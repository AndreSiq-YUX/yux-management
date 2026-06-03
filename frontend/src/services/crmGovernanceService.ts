import { supabase } from '@/lib/supabase'
import type {
  CrmAssignmentMode,
  CrmGovernanceContext,
  CrmInstance,
  CrmInstanceMember,
  CrmInstanceRole,
  CrmMigrationStrategy,
  CrmTeam,
  CrmTeamMember,
} from '@/types/crm'

export interface CreateCrmInstanceInput {
  organizationId: string
  contractId: string
  sectorKey?: string
  blueprintId?: string
  blueprintApplicationRunId?: string
  sellerSeatLimit?: number
  managerSeatLimit?: number
  adminSeatLimit?: number
  maxPipelineCount?: number
  maxCustomFieldCount?: number
  maxAutomationCount?: number
  allowClientPipelineCustomization?: boolean
  allowClientFieldCustomization?: boolean
  allowClientCategoryCustomization?: boolean
  defaultAssignmentMode?: CrmAssignmentMode
}

export interface InviteCrmMemberInput {
  crmInstanceId: string
  userId: string
  role: CrmInstanceRole
  displayName?: string
  email?: string
}

export interface PublishCrmConfigurationInput {
  crmInstanceId: string
  draftId: string
  migrationStrategy: CrmMigrationStrategy
  impactSummary: Record<string, unknown>
}

export const buildCrmInstanceInsertPayload = (input: CreateCrmInstanceInput) => ({
  organization_id: input.organizationId,
  contract_id: input.contractId,
  status: 'draft',
  ...(input.sectorKey ? { sector_key: input.sectorKey } : {}),
  ...(input.blueprintId ? { blueprint_id: input.blueprintId } : {}),
  ...(input.blueprintApplicationRunId ? { blueprint_application_run_id: input.blueprintApplicationRunId } : {}),
  seller_seat_limit: input.sellerSeatLimit ?? 1,
  manager_seat_limit: input.managerSeatLimit ?? 0,
  admin_seat_limit: input.adminSeatLimit ?? 1,
  max_pipeline_count: input.maxPipelineCount ?? 3,
  max_custom_field_count: input.maxCustomFieldCount ?? 20,
  max_automation_count: input.maxAutomationCount ?? 5,
  allow_client_pipeline_customization: input.allowClientPipelineCustomization ?? true,
  allow_client_field_customization: input.allowClientFieldCustomization ?? true,
  allow_client_category_customization: input.allowClientCategoryCustomization ?? true,
  default_assignment_mode: input.defaultAssignmentMode || 'queue',
})

export const buildCrmMemberInvitePayload = (input: InviteCrmMemberInput) => ({
  crm_instance_id: input.crmInstanceId,
  user_id: input.userId,
  role: input.role,
  status: 'invited',
  display_name: input.displayName || null,
  email: input.email || null,
})

export const buildCrmPublicationPayload = (input: PublishCrmConfigurationInput) => ({
  crm_instance_id: input.crmInstanceId,
  draft_id: input.draftId,
  status: 'reviewing',
  migration_strategy: input.migrationStrategy,
  impact_summary: input.impactSummary,
})

const mapInstance = (row: any): CrmInstance => ({
  id: row.id,
  organizationId: row.organization_id,
  contractId: row.contract_id,
  status: row.status,
  sectorKey: row.sector_key || undefined,
  blueprintId: row.blueprint_id || undefined,
  blueprintApplicationRunId: row.blueprint_application_run_id || undefined,
  sellerSeatLimit: row.seller_seat_limit,
  managerSeatLimit: row.manager_seat_limit,
  adminSeatLimit: row.admin_seat_limit,
  maxPipelineCount: row.max_pipeline_count,
  maxCustomFieldCount: row.max_custom_field_count,
  maxAutomationCount: row.max_automation_count,
  allowClientPipelineCustomization: row.allow_client_pipeline_customization,
  allowClientFieldCustomization: row.allow_client_field_customization,
  allowClientCategoryCustomization: row.allow_client_category_customization,
  defaultAssignmentMode: row.default_assignment_mode,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

const mapMember = (row: any): CrmInstanceMember => ({
  id: row.id,
  crmInstanceId: row.crm_instance_id,
  userId: row.user_id,
  role: row.role,
  status: row.status,
  displayName: row.display_name || undefined,
  email: row.email || undefined,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

const mapTeam = (row: any): CrmTeam => ({
  id: row.id,
  crmInstanceId: row.crm_instance_id,
  name: row.name,
  description: row.description || undefined,
  assignmentMode: row.assignment_mode,
  isActive: row.is_active,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

const mapTeamMember = (row: any): CrmTeamMember => ({
  id: row.id,
  teamId: row.team_id,
  memberId: row.member_id,
  role: row.role,
  createdAt: row.created_at,
})

export const crmGovernanceService = {
  async getInstanceByContract(contractId: string) {
    const { data, error } = await supabase
      .from('crm_instances')
      .select('*')
      .eq('contract_id', contractId)
      .maybeSingle()

    if (error) throw error
    return data ? mapInstance(data) : null
  },

  async getActiveInstanceForOrganization(organizationId: string) {
    const { data, error } = await supabase
      .from('crm_instances')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) throw error
    return data ? mapInstance(data) : null
  },

  async createInstance(input: CreateCrmInstanceInput) {
    const { data, error } = await supabase
      .from('crm_instances')
      .upsert(buildCrmInstanceInsertPayload(input), { onConflict: 'contract_id' })
      .select()
      .single()

    if (error) throw error
    return mapInstance(data)
  },

  async getGovernanceContext(crmInstanceId: string): Promise<CrmGovernanceContext> {
    const userResult = await supabase.auth.getUser()
    const currentUserId = userResult.data.user?.id

    const [{ data: instance, error: instanceError }, { data: members, error: membersError }, { data: teams, error: teamsError }] = await Promise.all([
      supabase.from('crm_instances').select('*').eq('id', crmInstanceId).single(),
      supabase.from('crm_instance_members').select('*').eq('crm_instance_id', crmInstanceId),
      supabase.from('crm_teams').select('*').eq('crm_instance_id', crmInstanceId).eq('is_active', true),
    ])

    if (instanceError) throw instanceError
    if (membersError) throw membersError
    if (teamsError) throw teamsError

    const teamIds = (teams || []).map((team: any) => team.id)
    const { data: teamMembers, error: teamMembersError } = teamIds.length
      ? await supabase.from('crm_team_members').select('*').in('team_id', teamIds)
      : { data: [], error: null }

    if (teamMembersError) throw teamMembersError

    const mappedMembers = (members || []).map(mapMember)

    return {
      instance: mapInstance(instance),
      currentMember: mappedMembers.find(member => member.userId === currentUserId),
      members: mappedMembers,
      teams: (teams || []).map(mapTeam),
      teamMemberships: (teamMembers || []).map(mapTeamMember),
    }
  },

  async inviteMember(input: InviteCrmMemberInput) {
    const { data, error } = await supabase
      .from('crm_instance_members')
      .insert(buildCrmMemberInvitePayload(input))
      .select()
      .single()

    if (error) throw error
    return mapMember(data)
  },

  async publishConfiguration(input: PublishCrmConfigurationInput) {
    const { data, error } = await supabase
      .from('crm_configuration_publications')
      .insert(buildCrmPublicationPayload(input))
      .select()
      .single()

    if (error) throw error
    return data
  },
}
