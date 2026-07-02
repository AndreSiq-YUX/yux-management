import { apiRequest } from '@/lib/apiClient'
import type { RadarCampaign, RadarMetrics, RadarOpportunity } from '@/types/radar'

const buildQuery = (params: Record<string, string | undefined>) => {
  const search = new URLSearchParams()

  Object.entries(params).forEach(([key, value]) => {
    if (value) search.set(key, value)
  })

  const query = search.toString()
  return query ? `?${query}` : ''
}

export const radarService = {
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
    city?: string
    state?: string
    websiteUrl?: string
    emailRaw?: string
    phoneRaw?: string
  }) {
    return apiRequest<{ company: unknown; opportunity: RadarOpportunity }>(`/radar/campaigns/${campaignId}/companies`, { method: 'POST', body: input })
  },

  async getOpportunities(campaignId: string) {
    return apiRequest<RadarOpportunity[]>(`/radar/campaigns/${campaignId}/opportunities`)
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

  async convertToLead(opportunityId: string) {
    return apiRequest<{ leadId: string; opportunity: RadarOpportunity }>(`/radar/opportunities/${opportunityId}/convert-to-lead`, { method: 'POST' })
  },

  async getMetrics(campaignId: string) {
    return apiRequest<RadarMetrics>(`/radar/campaigns/${campaignId}/metrics`)
  },
}
