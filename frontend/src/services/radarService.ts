import { apiRequest } from '@/lib/apiClient'
import type { RadarCandidateRecord, RadarCampaign, RadarDataSource, RadarDuplicateCandidate, RadarEnrichmentRun, RadarImportIssue, RadarMetrics, RadarOpportunity } from '@/types/radar'

type RadarImportResponse = {
  imported: RadarOpportunity[]
  analyzed?: RadarOpportunity[]
  issues: RadarImportIssue[]
  runId: string
}

const buildQuery = (params: Record<string, string | undefined>) => {
  const search = new URLSearchParams()

  Object.entries(params).forEach(([key, value]) => {
    if (value) search.set(key, value)
  })

  const query = search.toString()
  return query ? `?${query}` : ''
}

export const radarService = {
  async getDataSources(organizationId: string) {
    return apiRequest<RadarDataSource[]>(`/radar/data-sources${buildQuery({ organizationId })}`)
  },

  async updateDataSource(sourceId: string, patch: { enabled?: boolean; rateLimitPerDay?: number; defaultCostPerUnit?: number; termsNotes?: string }) {
    return apiRequest<RadarDataSource>(`/radar/data-sources/${sourceId}`, { method: 'PATCH', body: patch })
  },

  async getCampaigns(organizationId: string) {
    return apiRequest<RadarCampaign[]>(`/radar/campaigns${buildQuery({ organizationId })}`)
  },

  async createCampaign(input: Pick<RadarCampaign, 'organizationId' | 'name' | 'targetSegment' | 'targetCity' | 'targetState' | 'targetKeywords' | 'targetCnaes' | 'offerType' | 'dailyLimit'> & { budgetLimit?: number }) {
    return apiRequest<RadarCampaign>('/radar/campaigns', { method: 'POST', body: input })
  },

  async addCompany(campaignId: string, input: {
    organizationId: string
    tradeName?: string
    legalName?: string
    cnpj?: string
    cnaeMain?: string
    city?: string
    state?: string
    websiteUrl?: string
    emailRaw?: string
    phoneRaw?: string
    sourceType?: string
    sourceUrl?: string
    notes?: string
  }) {
    return apiRequest<{ company: unknown; opportunity: RadarOpportunity }>(`/radar/campaigns/${campaignId}/companies`, { method: 'POST', body: input })
  },

  async importCsv(campaignId: string, input: { organizationId: string; csv: string; analyzeAfterImport?: boolean }) {
    return apiRequest<RadarImportResponse>(`/radar/campaigns/${campaignId}/import-csv`, { method: 'POST', body: input })
  },

  async importUrls(campaignId: string, input: { organizationId: string; urls: string[]; analyzeAfterImport?: boolean }) {
    return apiRequest<RadarImportResponse>(`/radar/campaigns/${campaignId}/import-urls`, { method: 'POST', body: input })
  },

  async searchWeb(campaignId: string, input: { organizationId: string; query: string; city?: string; state?: string; sourceType: 'jina_search' | 'web_search'; limit?: number }) {
    return apiRequest<{ candidates: RadarCandidateRecord[]; issues: RadarImportIssue[]; runId: string }>(`/radar/campaigns/${campaignId}/search-web`, { method: 'POST', body: input })
  },

  async getOpportunities(campaignId: string) {
    return apiRequest<RadarOpportunity[]>(`/radar/campaigns/${campaignId}/opportunities`)
  },

  async getCandidates(campaignId: string) {
    return apiRequest<RadarCandidateRecord[]>(`/radar/campaigns/${campaignId}/candidates`)
  },

  async getDuplicates(campaignId: string) {
    return apiRequest<RadarDuplicateCandidate[]>(`/radar/campaigns/${campaignId}/duplicates`)
  },

  async updateDuplicate(duplicateId: string, status: 'confirmed' | 'dismissed' | 'merged') {
    return apiRequest<RadarDuplicateCandidate>(`/radar/duplicates/${duplicateId}`, { method: 'PATCH', body: { status } })
  },

  async importCandidate(candidateId: string, input: { analyzeAfterImport?: boolean } = {}) {
    return apiRequest<{ candidate: RadarCandidateRecord; opportunity: RadarOpportunity; analyzed?: RadarOpportunity[] }>(`/radar/candidates/${candidateId}/import`, { method: 'POST', body: input })
  },

  async discardCandidate(candidateId: string) {
    return apiRequest<RadarCandidateRecord>(`/radar/candidates/${candidateId}/discard`, { method: 'POST' })
  },

  async reviewOpportunity(opportunityId: string, status: 'approved' | 'rejected') {
    return apiRequest<RadarOpportunity>(`/radar/opportunities/${opportunityId}/review`, { method: 'PATCH', body: { status } })
  },

  async optOutOpportunity(opportunityId: string) {
    return apiRequest<RadarOpportunity>(`/radar/opportunities/${opportunityId}/opt-out`, { method: 'POST' })
  },

  async runAnalysis(opportunityId: string) {
    return apiRequest<RadarOpportunity>(`/radar/opportunities/${opportunityId}/run-analysis`, { method: 'POST' })
  },

  async batchEnrich(opportunityIds: string[]) {
    return apiRequest<{ enriched: RadarOpportunity[] }>('/radar/opportunities/batch/enrich', { method: 'POST', body: { opportunityIds } })
  },

  async batchAnalyze(opportunityIds: string[]) {
    return apiRequest<{ analyzed: RadarOpportunity[] }>('/radar/opportunities/batch/analyze', { method: 'POST', body: { opportunityIds } })
  },

  async convertToLead(opportunityId: string) {
    return apiRequest<{ leadId: string; opportunity: RadarOpportunity }>(`/radar/opportunities/${opportunityId}/convert-to-lead`, { method: 'POST' })
  },

  async getMetrics(campaignId: string) {
    return apiRequest<RadarMetrics>(`/radar/campaigns/${campaignId}/metrics`)
  },

  async getRuns(campaignId: string) {
    return apiRequest<RadarEnrichmentRun[]>(`/radar/campaigns/${campaignId}/runs`)
  },
}
