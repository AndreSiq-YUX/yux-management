import { apiRequest } from '@/lib/apiClient'

export type ProspectingChannel = 'email' | 'whatsapp' | 'phone' | 'task'

export type ProspectingPolicy = {
  id: string
  organizationId: string
  enabled: boolean
  killSwitch: boolean
  dailyLimit: number
  maxAttemptsPerLead: number
  legalReviewedAt?: string
}

export type ProspectingPlan = {
  id: string
  organizationId: string
  radarOpportunityId: string
  leadId?: string
  sequenceId?: string
  primaryChannel: ProspectingChannel
  status: 'draft' | 'approved' | 'active' | 'paused' | 'blocked' | 'opted_out' | 'completed' | 'failed'
  blockedReasons: string[]
}

const mapPolicy = (row: Record<string, unknown> | null): ProspectingPolicy | null => row ? ({
  id: String(row.id),
  organizationId: String(row.organization_id),
  enabled: row.enabled === true,
  killSwitch: row.kill_switch === true,
  dailyLimit: Number(row.daily_limit || 0),
  maxAttemptsPerLead: Number(row.max_attempts_per_lead || 0),
  legalReviewedAt: typeof row.legal_reviewed_at === 'string' ? row.legal_reviewed_at : undefined,
}) : null

const mapPlan = (row: Record<string, unknown>): ProspectingPlan => ({
  id: String(row.id),
  organizationId: String(row.organization_id),
  radarOpportunityId: String(row.radar_opportunity_id),
  leadId: typeof row.lead_id === 'string' ? row.lead_id : undefined,
  sequenceId: typeof row.sequence_id === 'string' ? row.sequence_id : undefined,
  primaryChannel: row.primary_channel as ProspectingChannel,
  status: row.status as ProspectingPlan['status'],
  blockedReasons: Array.isArray(row.blocked_reasons) ? row.blocked_reasons.map(String) : [],
})

export const prospectingService = {
  async getPolicy(organizationId: string) {
    return mapPolicy(await apiRequest<Record<string, unknown> | null>(`/prospecting/policy?organizationId=${encodeURIComponent(organizationId)}`))
  },

  async activatePolicy(organizationId: string) {
    const row = await apiRequest<Record<string, unknown>>('/prospecting/policy', {
      method: 'PUT',
      body: {
        organizationId,
        enabled: true,
        killSwitch: false,
        dailyLimit: 20,
        maxAttemptsPerLead: 5,
        quietHours: { timezone: 'America/Sao_Paulo', start: '20:00', end: '08:00' },
        legalReviewed: true,
      },
    })
    return mapPolicy(row)
  },

  async recordPermission(input: { organizationId: string; leadId?: string; channel: 'email' | 'whatsapp' | 'phone'; address: string }) {
    return apiRequest('/prospecting/permissions', {
      method: 'POST',
      body: { ...input, status: 'granted', source: 'operator_confirmed_evidence', evidence: { confirmedInRadar: true } },
    })
  },

  async listPlans(organizationId: string, radarOpportunityId?: string) {
    const query = new URLSearchParams({ organizationId })
    if (radarOpportunityId) query.set('radarOpportunityId', radarOpportunityId)
    return (await apiRequest<Record<string, unknown>[]>(`/prospecting/plans?${query}`)).map(mapPlan)
  },

  async createPlan(input: { organizationId: string; radarOpportunityId: string; sequenceId: string; primaryChannel: ProspectingChannel }) {
    return mapPlan(await apiRequest<Record<string, unknown>>('/prospecting/plans', { method: 'POST', body: input }))
  },

  async approvePlan(planId: string) {
    return mapPlan(await apiRequest<Record<string, unknown>>(`/prospecting/plans/${planId}/approve`, { method: 'POST' }))
  },

  async startPlan(planId: string) {
    const result = await apiRequest<{ plan: Record<string, unknown> }>(`/prospecting/plans/${planId}/start`, { method: 'POST' })
    return mapPlan(result.plan)
  },
}
