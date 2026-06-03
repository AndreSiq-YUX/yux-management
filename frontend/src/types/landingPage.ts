export type LandingPageStatus = 'draft' | 'pending_approval' | 'active' | 'paused' | 'archived'
export type LandingPageVersionStatus = 'draft' | 'review' | 'published' | 'archived'
export type LandingPageCtaType = 'form' | 'whatsapp' | 'phone' | 'external_url'
export type LandingPageApprovalStatus = 'pending' | 'approved' | 'rejected'

export interface LandingPageVersion {
  id: string
  landingPageId: string
  versionNumber: number
  title: string
  status: LandingPageVersionStatus
  previewUrl?: string
  internalOnly: boolean
  createdAt: string
  updatedAt: string
}

export interface LandingPageForm {
  id: string
  landingPageId: string
  name: string
  submitLabel: string
  successMessage: string
  createdAt: string
  updatedAt: string
}

export interface LandingPageFieldMapping {
  id: string
  formId: string
  fieldName: string
  crmFieldKey: string
  required: boolean
  createdAt: string
  updatedAt: string
}

export interface LandingPageChangeRequest {
  id: string
  landingPageId: string
  requestedBy?: string
  status: 'open' | 'resolved' | 'cancelled'
  message: string
  createdAt: string
  updatedAt: string
}

export interface LandingPageApproval {
  id: string
  landingPageId: string
  versionId?: string
  status: LandingPageApprovalStatus
  comment?: string
  decidedAt?: string
  createdAt: string
  updatedAt: string
}

export interface LandingPage {
  id: string
  organizationId: string
  clientId: string
  contractId: string
  projectId?: string
  campaignId?: string
  pipelineId?: string
  initialStageId?: string
  name: string
  slug: string
  status: LandingPageStatus
  previewUrl?: string
  publishedUrl?: string
  thumbnailUrl?: string
  primaryCtaType: LandingPageCtaType
  primaryCtaValue: string
  visits: number
  leads: number
  pendingApprovals: number
  internalNotes?: string
  createdAt: string
  updatedAt: string
  versions: LandingPageVersion[]
  forms?: LandingPageForm[]
  fieldMappings?: LandingPageFieldMapping[]
  changeRequests?: LandingPageChangeRequest[]
  approvals?: LandingPageApproval[]
}

export type PortalLandingPage = Omit<LandingPage, 'internalNotes'> & {
  internalNotes?: never
}

export interface LandingPageMetricsInput {
  visits: number
  leads: number
}

export interface LandingPageMetrics {
  visits: number
  leads: number
  conversionRate: number
}

export interface CreateLandingPageInput {
  organizationId: string
  clientId: string
  contractId: string
  projectId?: string
  campaignId?: string
  pipelineId?: string
  initialStageId?: string
  name: string
  slug: string
  previewUrl?: string
  publishedUrl?: string
  thumbnailUrl?: string
  primaryCtaType: LandingPageCtaType
  primaryCtaValue: string
  internalNotes?: string
}
