import { apiRequest, apiRequestText } from '@/lib/apiClient'
import type { RadarResearchAvailability, RadarResearchResult, RadarTlsExceptionGrant,RadarResearchFeedback,RadarResearchMetrics,RadarCaptureOperation,RadarCapturePreflight,RadarCaptureLimits } from '@/types/radarResearch'
import type { RadarAnalysisRequest, RadarCandidateRecord, RadarCampaign, RadarDataSource, RadarDuplicateCandidate, RadarEnrichmentRun, RadarImportIssue, RadarMetrics, RadarOpportunity, RadarPlacePreview } from '@/types/radar'
import type { RadarSearchConfiguration } from '@/lib/radar/radarSearchConfiguration'
import type {RadarCommercialCampaign,RadarCommercialCandidate,RadarCommercialCapture,RadarCommercialResearch,RadarCommercialMetrics,CommercialHistory,CommercialOpportunity,CommercialFeedback} from '@/types/radarCommercial'
import type {RadarOperationalPolicy,RadarOperationalLimits,RadarContinuationAuthorization} from '@/types/radarResearch'

export type RadarCampaignInput = Pick<RadarCampaign, 'organizationId' | 'name' | 'campaignType' | 'targetSegment' | 'targetKeywords' | 'targetCnaes' | 'offerType' | 'dailyLimit'> & {
  targetCity?: string; targetState?: string; targetStates?: string[]; productFocus?: string[]; budgetLimit?: number
  searchConfiguration?: RadarSearchConfiguration
}

type RadarImportResponse = {
  imported: RadarOpportunity[]
  analyzed?: RadarOpportunity[]
  analysisRequests?: RadarAnalysisRequest[]
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
  getOperationalPolicy(){return apiRequest<RadarOperationalPolicy>('/radar/admin/operational-limits')},
  updateOperationalPolicy(input:{expectedVersion:number;limits:RadarOperationalLimits}){return apiRequest<RadarOperationalPolicy>('/radar/admin/operational-limits',{method:'PUT',body:input})},
  getCommercialCampaigns(organizationId:string){return apiRequest<RadarCommercialCampaign[]>(`/radar/campaigns${buildQuery({organizationId})}`)},
  getCommercialCandidates(campaignId:string){return apiRequest<RadarCommercialCandidate[]>(`/radar/campaigns/${campaignId}/candidates`)},
  getCommercialCapture(campaignId:string,organizationId:string){return apiRequest<{operation:RadarCommercialCapture|null}>(`/radar/campaigns/${campaignId}/capture-operations/latest${buildQuery({organizationId})}`)},
  getCommercialResearch(candidateId:string,organizationId:string){return apiRequest<RadarCommercialResearch>(`/radar/candidates/${candidateId}/research${buildQuery({organizationId})}`)},
  getCommercialHistory(campaignId:string,organizationId:string){return apiRequest<CommercialHistory[]>(`/radar/campaigns/${campaignId}/research-history${buildQuery({organizationId})}`)},
  getCommercialResearchMetrics(campaignId:string,organizationId:string,from:string,to:string){return apiRequest<RadarCommercialMetrics>(`/radar/campaigns/${campaignId}/research-metrics${buildQuery({organizationId,from,to})}`)},
  getCommercialOpportunities(campaignId:string){return apiRequest<CommercialOpportunity[]>(`/radar/campaigns/${campaignId}/opportunities`)},
  getCommercialFeedback(candidateId:string,organizationId:string){return apiRequest<CommercialFeedback[]>(`/radar/candidates/${candidateId}/feedback${buildQuery({organizationId})}`)},
  commercialOpportunityAction(id:string,action:'analyze'|'approve'|'reject'|'optOut'|'convert'){
    const suffix={analyze:'run-analysis',approve:'review',reject:'review',optOut:'opt-out',convert:'convert-to-lead'}[action]
    return apiRequest<unknown>(`/radar/opportunities/${id}/${suffix}`,{method:action==='approve'||action==='reject'?'PATCH':'POST',body:action==='approve'||action==='reject'?{status:action==='approve'?'approved':'rejected'}:undefined})
  },
  commercialCandidateAction(id:string,action:'import'|'discard',input:{analyzeAfterImport:boolean}){
    return apiRequest<unknown>(`/radar/candidates/${id}/${action}`,{method:'POST',body:action==='import'?input:undefined})
  },
  startCaptureOperation(campaignId:string,input:{organizationId:string;configurationRevision:number;requestId:string;requestedCount:number;continuationAuthorizations?:RadarContinuationAuthorization[]}){return apiRequest<{operationId:string;status:RadarCaptureOperation['status'];reused:boolean}>(`/radar/campaigns/${campaignId}/capture-operations`,{method:'POST',body:input})},
  getCaptureOperation(operationId:string,organizationId:string){return apiRequest<RadarCaptureOperation>(`/radar/capture-operations/${operationId}${buildQuery({organizationId})}`)},
  getLatestCaptureOperation(campaignId:string,organizationId:string){return apiRequest<{operation:RadarCaptureOperation|null}>(`/radar/campaigns/${campaignId}/capture-operations/latest${buildQuery({organizationId})}`)},
  capturePreflight(campaignId:string,input:{organizationId:string;configurationRevision:number;requestedCount:number;operationId?:string}){return apiRequest<RadarCapturePreflight>(`/radar/campaigns/${campaignId}/capture-preflight`,{method:'POST',body:input})},
  resumeCaptureOperation(operationId:string,input:{organizationId:string;configurationRevision:number;requestId:string;allowSemanticRefresh?:boolean;restartExpiredContinuation?:boolean;continuationReceiptId?:string;continuationAuthorizations?:RadarContinuationAuthorization[];limitsAuthorization?:{expectedStateId:string;limits:RadarCaptureLimits}}){return apiRequest<RadarCaptureOperation>(`/radar/capture-operations/${operationId}/resume`,{method:'POST',body:input})},
  getResearchMetrics(campaignId:string,organizationId:string,from:string,to:string){return apiRequest<RadarResearchMetrics>(`/radar/campaigns/${campaignId}/research-metrics${buildQuery({organizationId,from,to})}`)},
  getResearchFeedback(candidateId:string,organizationId:string){return apiRequest<RadarResearchFeedback[]>(`/radar/candidates/${candidateId}/feedback${buildQuery({organizationId})}`)},
  saveResearchFeedback(candidateId:string,input:{organizationId:string;requestId:string;configurationRevision:number;kind:RadarResearchFeedback['kind'];contact?:{kind:string;value:string};note?:string}){return apiRequest<RadarResearchFeedback>(`/radar/candidates/${candidateId}/feedback`,{method:'POST',body:input})},
  getResearchHistory(campaignId:string,organizationId:string){return apiRequest<Array<{id:string;candidateId:string;companyName:string;configurationRevision:number;operation:string;status:string;updatedAt:string}>>(`/radar/campaigns/${campaignId}/research-history${buildQuery({organizationId})}`)},
  reopenResearchReview(candidateId:string,organizationId:string,configurationRevision:number){return apiRequest(`/radar/candidates/${candidateId}/reopen-review`,{method:'POST',body:{organizationId,configurationRevision}})},
  getCrmDestinations(organizationId:string){return apiRequest<Array<{crmInstanceId:string;pipelineId:string;stageId:string;pipelineName:string;stageName:string}>>(`/radar/crm-destinations${buildQuery({organizationId})}`)},
  deliverToCrm(campaignId:string,input:{organizationId:string;configurationRevision:number;candidateIds:string[];destination:{crmInstanceId:string;pipelineId:string;stageId:string};requestId:string}){
    return apiRequest<{items:Array<{candidateId:string;status:'created'|'already_linked'|'blocked';leadId?:string;pipelineId?:string;reason?:string}>}>(`/radar/campaigns/${campaignId}/deliver-to-crm`,{method:'POST',body:input})
  },
  getResearchAvailability(campaignId:string,organizationId:string) {
    return apiRequest<RadarResearchAvailability>(`/radar/campaigns/${campaignId}/research-availability${buildQuery({organizationId})}`)
  },
  getCandidateResearch(candidateId:string,organizationId:string) {
    return apiRequest<RadarResearchResult>(`/radar/candidates/${candidateId}/research${buildQuery({organizationId})}`)
  },
  authorizeTlsException(candidateId:string,input:{organizationId:string;runId:string;configurationRevision:number;diagnosticId:string;confirmed:true}) {
    return apiRequest<RadarTlsExceptionGrant>(`/radar/candidates/${candidateId}/research/tls-exceptions`,{method:'POST',body:input})
  },
  revokeTlsException(candidateId:string,organizationId:string,grantId:string) {
    return apiRequest<{revoked:true}>(`/radar/candidates/${candidateId}/research/tls-exceptions/${grantId}/revoke`,{method:'POST',body:{organizationId}})
  },
  startCandidateResearch(candidateId:string,input:{organizationId:string;configurationRevision:number;requestId:string;allowSemanticRefresh?:boolean;operation?:'complete'|'resume'|'refresh'|'reanalyze'}) {
    return apiRequest<{runId:string;status:string;reused:boolean}>(`/radar/candidates/${candidateId}/research`,{method:'POST',body:input})
  },
  async getAdminDataSources() {
    return apiRequest<Array<RadarDataSource & { organizationName?: string }>>('/radar/admin/data-sources')
  },

  async getDataSources(organizationId: string) {
    return apiRequest<RadarDataSource[]>(`/radar/data-sources${buildQuery({ organizationId })}`)
  },

  async updateDataSource(sourceId: string, patch: { enabled?: boolean; rateLimitPerDay?: number; defaultCostPerUnit?: number; termsNotes?: string }) {
    return apiRequest<RadarDataSource>(`/radar/data-sources/${sourceId}`, { method: 'PATCH', body: patch })
  },

  async getCampaigns(organizationId: string) {
    return apiRequest<RadarCampaign[]>(`/radar/campaigns${buildQuery({ organizationId })}`)
  },

  async createCampaign(input: RadarCampaignInput) {
    return apiRequest<RadarCampaign>('/radar/campaigns', { method: 'POST', body: input })
  },

  async updateCampaign(campaignId: string, input: RadarCampaignInput) {
    return apiRequest<{ campaign: RadarCampaign; criteriaChanged: boolean }>(`/radar/campaigns/${campaignId}`, { method: 'PATCH', body: input })
  },

  async duplicateCampaign(campaignId: string, organizationId: string) {
    return apiRequest<RadarCampaign>(`/radar/campaigns/${campaignId}/duplicate`, { method: 'POST', body: { organizationId } })
  },

  async addCompany(campaignId: string, input: {
    organizationId: string
    tradeName?: string
    legalName?: string
    cnpj?: string
    cnaeMain?: string
    city?: string
    state?: string
    address?: string
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

  async getOsmReadiness(campaignId: string, organizationId: string) {
    return apiRequest<{
      ready: boolean
      reason: string | null
      segmentKey: string | null
      snapshot: { municipalityCode: string; extractedAt: string; placeCount: number; attribution: string } | null
    }>(`/radar/campaigns/${campaignId}/osm-readiness${buildQuery({ organizationId })}`)
  },

  async getOsmReport(campaignId: string, organizationId: string) {
    return apiRequest<{ candidates: number; withSite: number; verifiedSites: number; withPhone: number;
      withEmail: number; duplicates: number; imported: number; estimatedApiCostUsd: number;
      infrastructureCostIncluded: boolean }>(`/radar/campaigns/${campaignId}/osm-report${buildQuery({ organizationId })}`)
  },

  async searchOsm(campaignId: string, input: { organizationId: string; limit?: number }) {
    return apiRequest<{
      candidates: RadarCandidateRecord[]
      issues: RadarImportIssue[]
      runId: string
      snapshot: { municipalityCode: string; extractedAt: string; placeCount: number; attribution: string } | null
    }>(`/radar/campaigns/${campaignId}/search-osm`, { method: 'POST', body: input })
  },

  async searchCnpja(campaignId: string, input: {
    organizationId: string
    query?: string
    city?: string
    state?: string
    cnaes?: string[]
    openingFrom?: string
    openingTo?: string
    limit?: number
  }) {
    return apiRequest<{ candidates: RadarCandidateRecord[]; issues: RadarImportIssue[]; runId: string }>(`/radar/campaigns/${campaignId}/search-cnpja`, { method: 'POST', body: input })
  },

  async searchRegionalCnpja(campaignId: string, input: { organizationId: string; state: string; city?: string; limit?: number }) {
    return apiRequest<{ candidates: RadarCandidateRecord[]; issues: RadarImportIssue[]; runId: string;
      nextToken?: string; completed?: boolean }>(`/radar/campaigns/${campaignId}/search-cnpja-regional`, { method: 'POST', body: input })
  },

  async previewPlaces(campaignId: string, input: { organizationId: string; sourceType: 'serper_places' | 'brave_place_search';
    query: string; city: string; state: string; limit: number }) {
    return apiRequest<{ places: RadarPlacePreview[]; sourceType: string; attribution: string; storagePolicy: 'transient_only' }>(
      `/radar/campaigns/${campaignId}/preview-places`, { method: 'POST', body: input })
  },

  async getOpportunities(campaignId: string) {
    return apiRequest<RadarOpportunity[]>(`/radar/campaigns/${campaignId}/opportunities`)
  },

  async getCandidates(campaignId: string) {
    return apiRequest<RadarCandidateRecord[]>(`/radar/campaigns/${campaignId}/candidates`)
  },

  async checkOsmSite(candidateId: string) {
    return apiRequest<RadarCandidateRecord>(`/radar/candidates/${candidateId}/check-osm-site`, { method: 'POST' })
  },

  getBraveCandidateAvailability(candidateId:string,organizationId:string) {
    return apiRequest<{allowed:boolean;reasons:Array<{code:string;message:string;resolution:string}>}>(`/radar/candidates/${candidateId}/brave-availability${buildQuery({organizationId})}`)
  },
  async enrichCandidateWithBrave(candidateId: string, organizationId: string,expectedRevision?:number) {
    return apiRequest<{ matched: boolean; candidate?: RadarCandidateRecord; placesCount: number; reason?: string }>(
      `/radar/candidates/${candidateId}/enrich-brave`, { method: 'POST', body: { organizationId,...(expectedRevision!==undefined?{expectedRevision}:{}) } })
  },

  async confirmBraveSuggestion(candidateId: string, organizationId: string, sourceUrl: string) {
    return apiRequest<{ candidate: RadarCandidateRecord }>(`/radar/candidates/${candidateId}/confirm-brave-suggestion`,
      { method: 'POST', body: { organizationId, sourceUrl } })
  },

  async inspectBusinessSite(candidateId: string, organizationId: string) {
    return apiRequest<{ site: { status: string; finalUrl?: string; emails: string[]; phones: string[] };
      review: { targetStatus: string; productFit: string; reasons: string[] } }>(
      `/radar/candidates/${candidateId}/inspect-business-site`, { method: 'POST', body: { organizationId } })
  },

  async getB2bProspects(campaignId: string, organizationId: string) {
    return apiRequest<Array<RadarCandidateRecord & { targetStatus: string | null; productFit: string | null;
      reasons: string[]; approvedAt: string | null; verificationMethod: 'automated' | 'manual' | null;
      reviewNote: string | null; evidence: Array<{ kind: string; value: string; sourceUrl: string; observedAt: string }> }>>(
      `/radar/campaigns/${campaignId}/b2b-prospects${buildQuery({ organizationId })}`)
  },

  async getB2bProgress(campaignId: string, organizationId: string) {
    return apiRequest<{ scopes: Array<{ key: string; label: string; state: string; city?: string; pages: number; candidates: number; completed: boolean }>;
      configurationRevision: number;
      candidates: number; checked: number; confirmed: number; approved: number }>(
      `/radar/campaigns/${campaignId}/b2b-progress${buildQuery({ organizationId })}`)
  },

  async runB2bBatch(campaignId: string, organizationId: string, kind: 'discovery' | 'verification') {
    const suffix = kind === 'discovery' ? 'run-b2b-discovery' : 'run-b2b-verification'
    return apiRequest<{ jobId: string | number; status: string }>(`/radar/campaigns/${campaignId}/${suffix}`,
      { method: 'POST', body: { organizationId } })
  },

  async approveB2bProspect(candidateId: string, organizationId: string,
    manual?: { manualEvidenceUrl: string; manualReviewNote: string }) {
    return apiRequest<{ candidateId: string; approved: boolean }>(`/radar/candidates/${candidateId}/approve-b2b`,
      { method: 'POST', body: { organizationId, ...manual } })
  },

  async exportB2bProspects(campaignId: string, organizationId: string) {
    return apiRequestText(`/radar/campaigns/${campaignId}/b2b-export.csv${buildQuery({ organizationId })}`)
  },

  async getDuplicates(campaignId: string) {
    return apiRequest<RadarDuplicateCandidate[]>(`/radar/campaigns/${campaignId}/duplicates`)
  },

  async updateDuplicate(duplicateId: string, status: 'confirmed' | 'dismissed' | 'merged') {
    return apiRequest<RadarDuplicateCandidate>(`/radar/duplicates/${duplicateId}`, { method: 'PATCH', body: { status } })
  },

  async importCandidate(candidateId: string, input: { analyzeAfterImport?: boolean } = {}) {
    return apiRequest<{ candidate: RadarCandidateRecord; opportunity: RadarOpportunity; analyzed?: RadarOpportunity[]; analysisRequests?: RadarAnalysisRequest[] }>(`/radar/candidates/${candidateId}/import`, { method: 'POST', body: input })
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
    return apiRequest<RadarAnalysisRequest>(`/radar/opportunities/${opportunityId}/run-analysis`, { method: 'POST' })
  },

  async batchEnrich(opportunityIds: string[]) {
    return apiRequest<{ enriched: RadarOpportunity[] }>('/radar/opportunities/batch/enrich', { method: 'POST', body: { opportunityIds } })
  },

  async batchAnalyze(opportunityIds: string[]) {
    return apiRequest<{ analyzed: RadarOpportunity[]; requests: RadarAnalysisRequest[] }>('/radar/opportunities/batch/analyze', { method: 'POST', body: { opportunityIds } })
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
