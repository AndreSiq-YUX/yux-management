import { apiRequest } from '@/lib/apiClient'
import type {
  CompanyBrandProfile,
  CompanyBrandProfileInput,
  CompanyContextPreview,
  CompanyKnowledgeBaseInput,
  CompanyKnowledgeDocument,
  KnowledgeProcessingResult,
  CompanyProfile,
  CompanyProfileInput,
  WebsiteOnboardingResult,
} from '@/types/companyIntelligence'

export const companyIntelligenceService = {
  getProfile(organizationId: string) {
    return apiRequest<CompanyProfile>(`/company-intelligence/organizations/${organizationId}/profile`)
  },

  updateProfile(organizationId: string, input: CompanyProfileInput) {
    return apiRequest<CompanyProfile>(`/company-intelligence/organizations/${organizationId}/profile`, {
      method: 'PUT',
      body: input,
    })
  },

  getBrand(organizationId: string) {
    return apiRequest<CompanyBrandProfile | null>(`/company-intelligence/organizations/${organizationId}/brand`)
  },

  updateBrand(organizationId: string, input: CompanyBrandProfileInput) {
    return apiRequest<CompanyBrandProfile>(`/company-intelligence/organizations/${organizationId}/brand`, {
      method: 'PUT',
      body: input,
    })
  },

  getContextPreview(organizationId: string, query = '', includeDrafts = false) {
    const params = new URLSearchParams({ q: query })
    if (includeDrafts) params.set('includeDrafts', 'true')
    return apiRequest<CompanyContextPreview>(`/company-intelligence/organizations/${organizationId}/context-preview?${params}`)
  },

  listKnowledge(organizationId: string) {
    return apiRequest<CompanyKnowledgeDocument[]>(`/company-intelligence/organizations/${organizationId}/knowledge`)
  },

  async getKnowledgeUploadLimit(organizationId: string) {
    const response = await apiRequest<{ limitMb: number }>(`/company-intelligence/organizations/${organizationId}/knowledge/upload-limit`)
    return response.limitMb
  },

  createKnowledgeText(organizationId: string, input: CompanyKnowledgeBaseInput & { body: string }) {
    return apiRequest<CompanyKnowledgeDocument>(`/company-intelligence/organizations/${organizationId}/knowledge/text`, {
      method: 'POST', body: input,
    })
  },

  createKnowledgeUrl(organizationId: string, input: CompanyKnowledgeBaseInput & { sourceUrl: string }) {
    return apiRequest<CompanyKnowledgeDocument>(`/company-intelligence/organizations/${organizationId}/knowledge/url`, {
      method: 'POST', body: input,
    })
  },

  async uploadKnowledgeFile(organizationId: string, input: CompanyKnowledgeBaseInput, file: File) {
    return apiRequest<CompanyKnowledgeDocument>(`/company-intelligence/organizations/${organizationId}/knowledge/files`, {
      method: 'POST',
      body: {
        ...input,
        fileName: file.name,
        mimeType: resolveKnowledgeMimeType(file),
        byteSize: file.size,
        contentBase64: await fileToBase64(file),
      },
    })
  },

  updateKnowledge(documentId: string, input: Partial<Pick<CompanyKnowledgeDocument, 'title' | 'documentType' | 'visibility' | 'allowedAgentProfileKeys' | 'blockedAgentProfileKeys'>>) {
    return apiRequest<CompanyKnowledgeDocument>(`/company-intelligence/knowledge/${documentId}`, { method: 'PATCH', body: input })
  },

  publishKnowledge(documentId: string) {
    return apiRequest<CompanyKnowledgeDocument>(`/company-intelligence/knowledge/${documentId}/publish`, { method: 'POST' })
  },

  archiveKnowledge(documentId: string) {
    return apiRequest<CompanyKnowledgeDocument>(`/company-intelligence/knowledge/${documentId}/archive`, { method: 'POST' })
  },

  getKnowledgeProcessing(documentId: string) {
    return apiRequest<KnowledgeProcessingResult>(`/company-intelligence/knowledge/${documentId}/processing`)
  },

  reviewKnowledgeChunk(documentId: string, chunkId: string, status: 'approved' | 'rejected') {
    return apiRequest(`/company-intelligence/knowledge/${documentId}/chunks/${chunkId}/review`, { method: 'PATCH', body: { status } })
  },

  publishDegradedKnowledge(documentId: string) {
    return apiRequest<CompanyKnowledgeDocument>(`/company-intelligence/knowledge/${documentId}/publish`, { method: 'POST', body: { allowDegradedRaw: true } })
  },

  startWebsiteOnboarding(organizationId: string, websiteUrl: string, contractId?: string, maxPages = 30) {
    return apiRequest<WebsiteOnboardingResult>(`/company-intelligence/organizations/${organizationId}/website-onboarding`, {
      method: 'POST', body: { websiteUrl, contractId, maxPages },
    })
  },

  getWebsiteOnboarding(organizationId: string, runId: string) {
    return apiRequest<WebsiteOnboardingResult>(`/company-intelligence/organizations/${organizationId}/website-onboarding/${runId}`)
  },

  applyWebsiteSuggestions(
    organizationId: string,
    runId: string,
    suggestionIds: string[],
    suggestionEdits: Array<{ id: string; suggestedValue: unknown }> = [],
  ) {
    return apiRequest<WebsiteOnboardingResult>(`/company-intelligence/organizations/${organizationId}/website-onboarding/${runId}/apply`, {
      method: 'POST', body: { suggestionIds, suggestionEdits },
    })
  },
}

function resolveKnowledgeMimeType(file: File) {
  if (file.type) return file.type
  const extension = file.name.toLowerCase().split('.').pop()
  if (extension === 'md' || extension === 'markdown') return 'text/markdown'
  if (extension === 'txt') return 'text/plain'
  if (extension === 'pdf') return 'application/pdf'
  if (extension === 'docx') return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  return 'application/octet-stream'
}

async function fileToBase64(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer())
  let binary = ''
  const chunkSize = 0x8000
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize))
  }
  return btoa(binary)
}
