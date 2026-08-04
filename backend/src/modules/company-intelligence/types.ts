export type CompanyProfileInput = {
  legalName: string
  tradeName: string
  description: string
  websiteUrl?: string | null
  industry: string
  positioning: string
  differentiators: string[]
  emails: string[]
  phones: string[]
  address: Record<string, unknown>
  businessHours: Record<string, unknown>
  serviceRegions: string[]
  socialLinks: Record<string, unknown>
  internalNotes?: string | null
}

export type BrandProfileInput = {
  contractId?: string
  toneOfVoice: string
  persona: string
  brandVoiceSummary: string
  vocabularyDo: string[]
  vocabularyDont: string[]
  forbiddenTopics: string[]
  priorityTopics: string[]
  visualGuidelines?: string | null
  complianceNotes?: string | null
  status: 'draft' | 'active' | 'archived'
}

export type CompanyContextPreview = {
  organizationId: string
  companyProfile: Record<string, unknown> | null
  brandProfile: Record<string, unknown> | null
  products: Array<{ id: string; name: string; description: string; valueProposition?: string }>
  knowledge: Array<{ id: string; sourceId?: string; title: string; body: string; status: string }>
}
