export interface CompanyProfile {
  id?: string
  organizationId: string
  clientId?: string
  legalName: string
  tradeName: string
  description: string
  websiteUrl?: string
  industry: string
  positioning: string
  differentiators: string[]
  emails: string[]
  phones: string[]
  address: Record<string, unknown>
  businessHours: Record<string, unknown>
  serviceRegions: string[]
  socialLinks: Record<string, unknown>
  internalNotes?: string
  createdAt?: string
  updatedAt?: string
}

export type CompanyProfileInput = Omit<CompanyProfile, 'id' | 'organizationId' | 'clientId' | 'createdAt' | 'updatedAt'>

export interface BrandVisualIdentity {
  logoUrl?: string
  colors: string[]
  typography: string[]
  designStyle: string
  imageryStyle: string
  graphicElements: string[]
}

export interface CompanyBrandProfile {
  id: string
  organizationId: string
  clientId: string
  contractId: string
  toneOfVoice: string
  persona: string
  brandVoiceSummary: string
  vocabularyDo: string[]
  vocabularyDont: string[]
  forbiddenTopics: string[]
  priorityTopics: string[]
  visualIdentity: BrandVisualIdentity
  visualGuidelines?: string
  complianceNotes?: string
  status: 'draft' | 'active' | 'archived'
  createdAt: string
  updatedAt: string
}

export type CompanyBrandProfileInput = Omit<CompanyBrandProfile, 'id' | 'organizationId' | 'clientId' | 'contractId' | 'createdAt' | 'updatedAt'> & {
  contractId?: string
}

export interface CompanyContextPreview {
  organizationId: string
  companyProfile: CompanyProfile | null
  brandProfile: CompanyBrandProfile | null
  products: Array<{ id: string; name: string; description: string; valueProposition?: string }>
  knowledge: Array<{ id: string; sourceId?: string; title: string; body: string; status: string }>
}

export type CompanyKnowledgeDocumentType = 'brand' | 'product' | 'service' | 'faq' | 'case' | 'campaign' | 'policy' | 'other'
export type CompanyKnowledgeStatus = 'draft' | 'indexing' | 'indexed' | 'published' | 'archived'
export type CompanyKnowledgeVisibility = 'internal' | 'external' | 'both'

export interface CompanyKnowledgeDocument {
  id: string
  organizationId: string
  clientId: string
  contractId: string
  sourceId: string
  entryId?: string
  title: string
  documentType: CompanyKnowledgeDocumentType
  status: CompanyKnowledgeStatus
  sourceType: 'manual' | 'url' | 'file' | 'faq' | 'integration'
  sourceStatus: string
  visibility: CompanyKnowledgeVisibility
  allowedAgentProfileKeys: string[]
  blockedAgentProfileKeys: string[]
  storagePath?: string
  sourceUrl?: string
  mimeType?: string
  byteSize?: number
  checksumSha256?: string
  summary?: string
  bodyPreview?: string
  processingError?: string
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface CompanyKnowledgeBaseInput {
  contractId?: string
  title: string
  documentType: CompanyKnowledgeDocumentType
  visibility: CompanyKnowledgeVisibility
  allowedAgentProfileKeys: string[]
  blockedAgentProfileKeys: string[]
}

export interface KnowledgeIntelligenceRun {
  id: string
  runKind: 'document_curation' | 'website_onboarding'
  status: 'queued' | 'running' | 'ready_for_review' | 'degraded' | 'failed' | 'applied' | 'cancelled'
  stage: string
  progress: number
  provider?: string
  model?: string
  metrics: Record<string, unknown>
  outputPayload: Record<string, unknown>
  errorMessage?: string
  documentId?: string
}

export interface CompanyIntelligenceSuggestion {
  id: string
  suggestionKind: 'profile' | 'brand' | 'product'
  fieldPath: string
  currentValue?: unknown
  suggestedValue: unknown
  evidenceExcerpt: string
  sourceUrl: string
  confidence: number
  selected: boolean
  status: 'suggested' | 'applied' | 'rejected'
}

export interface WebsiteOnboardingResult {
  run: KnowledgeIntelligenceRun
  suggestions: CompanyIntelligenceSuggestion[]
  jobId?: string
}

export interface CuratedKnowledgeChunk {
  id: string
  chunkKind: 'curated_fact' | 'curated_summary'
  title?: string
  body: string
  sourceLocator?: string
  evidenceExcerpt?: string
  qualityScore?: number
  curationStatus: 'pending' | 'approved' | 'rejected'
  embeddingModel?: string
  embeddingDimensions?: number
  metadata: Record<string, unknown>
}

export interface KnowledgeProcessingResult {
  run: KnowledgeIntelligenceRun | null
  chunks: CuratedKnowledgeChunk[]
}
