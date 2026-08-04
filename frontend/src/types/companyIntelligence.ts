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
