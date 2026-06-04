import type { CrmLead, CrmPipelineStage } from './crm'

export type CrmLeadTemperature = 'hot' | 'warm' | 'cold' | 'unqualified'
export type CrmLeadUrgency = 'high' | 'medium' | 'low'
export type CrmNextActionKind =
  | 'respond_now'
  | 'send_proposal'
  | 'schedule_meeting'
  | 'send_sector_case'
  | 'request_budget'
  | 'reactivate'
  | 'reassign'
  | 'mark_lost'

export interface CrmCockpitLead extends CrmLead {
  whatsappPhone?: string
  city?: string
  state?: string
  segment?: string
  interest?: string
  temperature?: CrmLeadTemperature
  urgency?: CrmLeadUrgency
  consentLgpd?: boolean
  whatsappOptIn?: boolean
  emailOptIn?: boolean
  competitor?: string
  objections?: string[]
  currentStageEnteredAt?: string
  tagIds?: string[]
}

export interface CrmCockpitFilterState {
  search?: string
  ownerMemberId?: string
  teamId?: string
  source?: string
  campaignId?: string
  stageId?: string
  minValue?: number
  maxValue?: number
  temperature?: CrmLeadTemperature
  stalledOnly?: boolean
  tagIds?: string[]
}

export interface CrmSavedView {
  id: string
  crmInstanceId: string
  userId?: string
  teamId?: string
  name: string
  filters: CrmCockpitFilterState
  isShared: boolean
  createdAt: string
  updatedAt: string
}

export interface LeadImportPreviewRow {
  rowNumber: number
  raw: Record<string, string>
  lead: Partial<CrmCockpitLead>
  errors: string[]
}

export interface LeadImportPreview {
  rows: LeadImportPreviewRow[]
  validRows: number
  invalidRows: number
}

export interface CrmLossReasonConfig {
  id: string
  crmInstanceId: string
  stageId?: string
  label: string
  requiredForLost: boolean
  isActive: boolean
}

export interface CrmNextAction {
  id: string
  crmInstanceId: string
  leadId: string
  kind: CrmNextActionKind
  title: string
  dueAt?: string
  completedAt?: string
}

export interface CrmActivityCalendarEntry {
  id: string
  crmInstanceId: string
  leadId?: string
  title: string
  startsAt: string
  endsAt?: string
  kind: 'task' | 'meeting' | 'follow_up' | 'sla'
}

export interface StageAgeInput extends Pick<CrmCockpitLead, 'currentStageEnteredAt' | 'updatedAt' | 'createdAt'> {}

export type LossReasonStage = Pick<CrmPipelineStage, 'id' | 'isLost'>
