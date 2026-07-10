import { landingPageDataClient } from '@/lib/landingPageDataClient'
import { apiRequest } from '@/lib/apiClient'
import { sanitizeLandingPageForPortal } from '@/lib/landing-pages/landingPageRules'
import type {
  CreateLandingPageInput,
  LandingPage,
  LandingPageApprovalStatus,
  LandingPageStatus,
} from '@/types/landingPage'

export const buildLandingPageInsertPayload = (input: CreateLandingPageInput) => ({
  organization_id: input.organizationId,
  client_id: input.clientId,
  contract_id: input.contractId,
  project_id: input.projectId || null,
  campaign_id: input.campaignId || null,
  pipeline_id: input.pipelineId || null,
  initial_stage_id: input.initialStageId || null,
  name: input.name.trim(),
  slug: input.slug.trim(),
  preview_url: input.previewUrl || null,
  published_url: input.publishedUrl || null,
  thumbnail_url: input.thumbnailUrl || null,
  primary_cta_type: input.primaryCtaType,
  primary_cta_value: input.primaryCtaValue.trim(),
  internal_notes: input.internalNotes?.trim() || null,
})

export const buildLandingPageApprovalPayload = (input: {
  landingPageId: string
  versionId?: string
  status: LandingPageApprovalStatus
  comment?: string
}) => ({
  landing_page_id: input.landingPageId,
  version_id: input.versionId || null,
  status: input.status,
  comment: input.comment?.trim() || null,
  decided_at: input.status === 'pending' ? null : new Date().toISOString(),
})

function mapLandingPage(row: any): LandingPage {
  const forms = Array.isArray(row.landing_page_forms)
    ? row.landing_page_forms.map((form: any) => ({
      id: form.id,
      landingPageId: form.landing_page_id,
      name: form.name,
      submitLabel: form.submit_label,
      successMessage: form.success_message,
      createdAt: form.created_at,
      updatedAt: form.updated_at,
    }))
    : []
  const fieldMappings = Array.isArray(row.landing_page_forms)
    ? row.landing_page_forms.flatMap((form: any) => (
      Array.isArray(form.landing_page_field_mappings)
        ? form.landing_page_field_mappings.map((mapping: any) => ({
          id: mapping.id,
          formId: mapping.form_id,
          fieldName: mapping.field_name,
          crmFieldKey: mapping.crm_field_key,
          required: mapping.required,
          createdAt: mapping.created_at,
          updatedAt: mapping.updated_at,
        }))
        : []
    ))
    : []

  return {
    id: row.id,
    organizationId: row.organization_id,
    clientId: row.client_id,
    contractId: row.contract_id,
    projectId: row.project_id || undefined,
    campaignId: row.campaign_id || undefined,
    pipelineId: row.pipeline_id || undefined,
    initialStageId: row.initial_stage_id || undefined,
    name: row.name,
    slug: row.slug,
    status: row.status,
    previewUrl: row.preview_url || undefined,
    publishedUrl: row.published_url || undefined,
    thumbnailUrl: row.thumbnail_url || undefined,
    primaryCtaType: row.primary_cta_type,
    primaryCtaValue: row.primary_cta_value,
    visits: row.visits || 0,
    leads: row.leads || 0,
    pendingApprovals: row.pending_approvals || 0,
    internalNotes: row.internal_notes || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    versions: Array.isArray(row.landing_page_versions)
      ? row.landing_page_versions.map((version: any) => ({
        id: version.id,
        landingPageId: version.landing_page_id,
        versionNumber: version.version_number,
        title: version.title,
        status: version.status,
        previewUrl: version.preview_url || undefined,
        internalOnly: version.internal_only,
        createdAt: version.created_at,
        updatedAt: version.updated_at,
      }))
      : [],
    forms,
    fieldMappings,
    changeRequests: Array.isArray(row.landing_page_change_requests)
      ? row.landing_page_change_requests.map((request: any) => ({
        id: request.id,
        landingPageId: request.landing_page_id,
        requestedBy: request.requested_by || undefined,
        status: request.status,
        message: request.message,
        createdAt: request.created_at,
        updatedAt: request.updated_at,
      }))
      : [],
    approvals: Array.isArray(row.landing_page_approvals)
      ? row.landing_page_approvals.map((approval: any) => ({
        id: approval.id,
        landingPageId: approval.landing_page_id,
        versionId: approval.version_id || undefined,
        status: approval.status,
        comment: approval.comment || undefined,
        decidedAt: approval.decided_at || undefined,
        createdAt: approval.created_at,
        updatedAt: approval.updated_at,
      }))
      : [],
  }
}

const LANDING_PAGE_SELECT = '*'

async function attachLandingPageRelations(rows: any[]) {
  const pageIds = [...new Set(rows.map(row => row.id).filter(Boolean))]
  if (pageIds.length === 0) return rows

  const [versions, forms, changeRequests, approvals] = await Promise.all([
    requireRows(landingPageDataClient.from('landing_page_versions').select('*').in('landing_page_id', pageIds).order('created_at', { ascending: false })),
    requireRows(landingPageDataClient.from('landing_page_forms').select('*').in('landing_page_id', pageIds)),
    requireRows(landingPageDataClient.from('landing_page_change_requests').select('*').in('landing_page_id', pageIds).order('created_at', { ascending: false })),
    requireRows(landingPageDataClient.from('landing_page_approvals').select('*').in('landing_page_id', pageIds).order('created_at', { ascending: false })),
  ])

  const formIds = [...new Set((forms || []).map(form => form.id).filter(Boolean))]
  const fieldMappings = formIds.length
    ? await requireRows(landingPageDataClient.from('landing_page_field_mappings').select('*').in('form_id', formIds))
    : []

  const groupBy = (items: any[], key: string) => {
    const grouped = new Map<string, any[]>()
    for (const item of items || []) {
      const group = grouped.get(item[key]) || []
      group.push(item)
      grouped.set(item[key], group)
    }
    return grouped
  }

  const mappingsByForm = groupBy(fieldMappings, 'form_id')
  const formsByPage = groupBy((forms || []).map(form => ({
    ...form,
    landing_page_field_mappings: mappingsByForm.get(form.id) || [],
  })), 'landing_page_id')
  const versionsByPage = groupBy(versions, 'landing_page_id')
  const requestsByPage = groupBy(changeRequests, 'landing_page_id')
  const approvalsByPage = groupBy(approvals, 'landing_page_id')

  return rows.map(row => ({
    ...row,
    landing_page_versions: versionsByPage.get(row.id) || [],
    landing_page_forms: formsByPage.get(row.id) || [],
    landing_page_change_requests: requestsByPage.get(row.id) || [],
    landing_page_approvals: approvalsByPage.get(row.id) || [],
  }))
}

async function requireRows<T>(request: PromiseLike<{ data: T[] | null; error: any }>) {
  const { data, error } = await request
  if (error) throw error
  return data || []
}

export const landingPageService = {
  async getLandingPages(filters?: { organizationId?: string; clientId?: string; contractId?: string }) {
    let query = landingPageDataClient.from('landing_pages').select(LANDING_PAGE_SELECT).order('updated_at', { ascending: false })
    if (filters?.organizationId) query = query.eq('organization_id', filters.organizationId)
    if (filters?.clientId) query = query.eq('client_id', filters.clientId)
    if (filters?.contractId) query = query.eq('contract_id', filters.contractId)
    const { data, error } = await query
    if (error) throw error
    return (await attachLandingPageRelations(data || [])).map(mapLandingPage)
  },

  async getPortalLandingPages(contractId: string) {
    const data = await apiRequest<any[]>(`/landing-pages/portal/landing-pages?contractId=${encodeURIComponent(contractId)}`)
    const pages = (data || []).map(mapLandingPage)
    return pages.map(sanitizeLandingPageForPortal)
  },

  async createLandingPage(input: CreateLandingPageInput) {
    const { data, error } = await landingPageDataClient
      .from('landing_pages')
      .insert(buildLandingPageInsertPayload(input))
      .select(LANDING_PAGE_SELECT)
      .single()
    if (error) throw error
    const [page] = await attachLandingPageRelations(data ? [data] : [])
    return mapLandingPage(page)
  },

  async updateLandingPageStatus(id: string, status: LandingPageStatus) {
    const { data, error } = await landingPageDataClient
      .from('landing_pages')
      .update({ status })
      .eq('id', id)
      .select(LANDING_PAGE_SELECT)
      .single()
    if (error) throw error
    const [page] = await attachLandingPageRelations(data ? [data] : [])
    return mapLandingPage(page)
  },

  async addLandingPageVersion(input: { landingPageId: string; title: string; previewUrl?: string; internalOnly?: boolean }) {
    const { data, error } = await landingPageDataClient.from('landing_page_versions').insert({
      landing_page_id: input.landingPageId,
      version_number: Date.now(),
      title: input.title.trim(),
      preview_url: input.previewUrl || null,
      internal_only: Boolean(input.internalOnly),
    }).select().single()
    if (error) throw error
    return data
  },

  async requestLandingPageChange(input: { landingPageId: string; message: string }) {
    const { data, error } = await landingPageDataClient.from('landing_page_change_requests').insert({
      landing_page_id: input.landingPageId,
      message: input.message.trim(),
    }).select().single()
    if (error) throw error
    return data
  },

  async approveLandingPage(input: { landingPageId: string; versionId?: string; status: LandingPageApprovalStatus; comment?: string }) {
    const { data, error } = await landingPageDataClient
      .from('landing_page_approvals')
      .insert(buildLandingPageApprovalPayload(input))
      .select()
      .single()
    if (error) throw error
    return data
  },

  async recordLandingPageEvent(input: { landingPageId: string; eventType: 'view' | 'lead' | 'cta_click' | 'form_submit' | 'approval'; leadId?: string; metadata?: Record<string, unknown> }) {
    const { data, error } = await landingPageDataClient.from('landing_page_events').insert({
      landing_page_id: input.landingPageId,
      event_type: input.eventType,
      lead_id: input.leadId || null,
      metadata: input.metadata || {},
    }).select().single()
    if (error) throw error
    return data
  },
}
