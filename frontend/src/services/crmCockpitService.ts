import { crmOpsDataClient } from '@/lib/crmOpsDataClient'
import { buildCsvImportPreview } from '@/lib/crm/cockpitRules'
import { crmService } from '@/services/crmService'
import type {
  CrmCockpitFilterState,
  CrmCockpitLead,
  CrmNextAction,
  CrmNextActionKind,
  LeadImportPreview,
  LeadImportPreviewRow,
} from '@/types/crmCockpit'
import type { CrmInteraction, CrmPipeline, CrmTask } from '@/types/crm'

export interface CockpitSnapshot {
  pipelines: CrmPipeline[]
  leads: CrmCockpitLead[]
  tasks: CrmTask[]
  interactions: CrmInteraction[]
  nextActions: CrmNextAction[]
}

export interface SaveViewInput {
  crmInstanceId: string
  userId?: string
  teamId?: string
  name: string
  filters: CrmCockpitFilterState
  isShared?: boolean
}

export interface LeadImportInput {
  crmInstanceId: string
  fileName?: string
  preview: LeadImportPreview
}

export interface LeadTagInput {
  crmInstanceId: string
  name: string
  color?: string
}

export interface AssignLeadTagInput {
  crmInstanceId: string
  leadId: string
  tagId: string
}

export interface StageHistoryInput {
  crmInstanceId: string
  leadId: string
  fromStageId?: string
  toStageId?: string
  reason?: string
  metadata?: Record<string, unknown>
}

export interface NextActionInput {
  crmInstanceId: string
  leadId: string
  kind: CrmNextActionKind
  title: string
  dueAt?: string
  assignedToMemberId?: string
}

export const buildSavedViewPayload = (input: SaveViewInput) => ({
  crm_instance_id: input.crmInstanceId,
  user_id: input.userId || null,
  team_id: input.teamId || null,
  name: input.name.trim(),
  filters: input.filters,
  is_shared: Boolean(input.isShared),
})

export const buildLeadImportPayload = (input: LeadImportInput) => ({
  crm_instance_id: input.crmInstanceId,
  status: 'preview',
  file_name: input.fileName || null,
  total_rows: input.preview.rows.length,
  valid_rows: input.preview.validRows,
  invalid_rows: input.preview.invalidRows,
})

export const buildLeadImportRowPayload = (crmInstanceId: string, importId: string, row: LeadImportPreviewRow) => ({
  crm_instance_id: crmInstanceId,
  import_id: importId,
  row_number: row.rowNumber,
  raw_payload: row.raw,
  normalized_payload: row.lead,
  errors: row.errors,
})

export const buildLeadTagPayload = (input: LeadTagInput) => ({
  crm_instance_id: input.crmInstanceId,
  name: input.name.trim(),
  color: input.color || '#64748b',
  is_active: true,
})

export const buildLeadTagAssignmentPayload = (input: AssignLeadTagInput) => ({
  crm_instance_id: input.crmInstanceId,
  lead_id: input.leadId,
  tag_id: input.tagId,
})

export const buildStageHistoryPayload = (input: StageHistoryInput) => ({
  crm_instance_id: input.crmInstanceId,
  lead_id: input.leadId,
  from_stage_id: input.fromStageId || null,
  to_stage_id: input.toStageId || null,
  reason: input.reason || null,
  metadata: input.metadata || {},
})

export const buildNextActionPayload = (input: NextActionInput) => ({
  crm_instance_id: input.crmInstanceId,
  lead_id: input.leadId,
  kind: input.kind,
  title: input.title.trim(),
  due_at: input.dueAt || null,
  assigned_to_member_id: input.assignedToMemberId || null,
})

const mapNextAction = (row: any): CrmNextAction => ({
  id: row.id,
  crmInstanceId: row.crm_instance_id,
  leadId: row.lead_id,
  kind: row.kind,
  title: row.title,
  dueAt: row.due_at || undefined,
  completedAt: row.completed_at || undefined,
})

export const crmCockpitService = {
  async getCockpitSnapshot(crmInstanceId: string, organizationId: string, pipelineId?: string): Promise<CockpitSnapshot> {
    const [pipelines, leads, nextActionsResult] = await Promise.all([
      crmService.getPipelines(organizationId),
      crmService.getLeadsForInstance(crmInstanceId, pipelineId),
      crmOpsDataClient
        .from('lead_next_actions')
        .select('*')
        .eq('crm_instance_id', crmInstanceId)
        .is('completed_at', null),
    ])

    if (nextActionsResult.error) throw nextActionsResult.error

    return {
      pipelines,
      leads: leads as CrmCockpitLead[],
      tasks: [],
      interactions: [],
      nextActions: (nextActionsResult.data || []).map(mapNextAction),
    }
  },

  async getSavedViews(crmInstanceId: string) {
    const { data, error } = await crmOpsDataClient
      .from('lead_saved_views')
      .select('*')
      .eq('crm_instance_id', crmInstanceId)
      .order('name')

    if (error) throw error
    return data || []
  },

  async saveView(input: SaveViewInput) {
    const { data, error } = await crmOpsDataClient
      .from('lead_saved_views')
      .insert(buildSavedViewPayload(input))
      .select()
      .single()

    if (error) throw error
    return data
  },

  previewLeadImport(csv: string): LeadImportPreview {
    return buildCsvImportPreview(csv)
  },

  async executeLeadImport(input: LeadImportInput) {
    const { data: importRun, error: importError } = await crmOpsDataClient
      .from('lead_imports')
      .insert(buildLeadImportPayload(input))
      .select()
      .single()

    if (importError) throw importError

    if (input.preview.rows.length) {
      const { error: rowsError } = await crmOpsDataClient
        .from('lead_import_rows')
        .insert(input.preview.rows.map(row => buildLeadImportRowPayload(input.crmInstanceId, importRun.id, row)))

      if (rowsError) throw rowsError
    }

    return importRun
  },

  async recordStageHistory(input: StageHistoryInput) {
    const { data, error } = await crmOpsDataClient
      .from('lead_stage_history')
      .insert(buildStageHistoryPayload(input))
      .select()
      .single()

    if (error) throw error
    return data
  },

  async createLeadTag(input: LeadTagInput) {
    const { data, error } = await crmOpsDataClient
      .from('lead_tags')
      .insert(buildLeadTagPayload(input))
      .select()
      .single()

    if (error) throw error
    return data
  },

  async assignLeadTag(input: AssignLeadTagInput) {
    const { data, error } = await crmOpsDataClient
      .from('lead_tag_assignments')
      .insert(buildLeadTagAssignmentPayload(input))
      .select()
      .single()

    if (error) throw error
    return data
  },

  async createNextAction(input: NextActionInput) {
    const { data, error } = await crmOpsDataClient
      .from('lead_next_actions')
      .insert(buildNextActionPayload(input))
      .select()
      .single()

    if (error) throw error
    return mapNextAction(data)
  },

  async completeNextAction(actionId: string) {
    const { data, error } = await crmOpsDataClient
      .from('lead_next_actions')
      .update({ completed_at: new Date().toISOString() })
      .eq('id', actionId)
      .select()
      .single()

    if (error) throw error
    return mapNextAction(data)
  },
}
