import type { CompanyBrandProfile, CompanyBrandProfileInput } from '@/types/companyIntelligence'

export function editableBrand(profile: CompanyBrandProfile | null, contractId?: string): CompanyBrandProfileInput {
  if (!profile) return { contractId, toneOfVoice: '', persona: '', brandVoiceSummary: '', vocabularyDo: [], vocabularyDont: [], forbiddenTopics: [], priorityTopics: [], visualIdentity: emptyVisualIdentity(), visualGuidelines: '', complianceNotes: '', status: 'draft' }
  return {
    contractId: profile.contractId,
    toneOfVoice: profile.toneOfVoice,
    persona: profile.persona,
    brandVoiceSummary: profile.brandVoiceSummary,
    vocabularyDo: profile.vocabularyDo,
    vocabularyDont: profile.vocabularyDont,
    forbiddenTopics: profile.forbiddenTopics,
    priorityTopics: profile.priorityTopics,
    visualIdentity: profile.visualIdentity || emptyVisualIdentity(),
    visualGuidelines: profile.visualGuidelines,
    complianceNotes: profile.complianceNotes,
    status: profile.status,
  }
}

function emptyVisualIdentity() {
  return { logoUrl: '', colors: [], typography: [], designStyle: '', imageryStyle: '', graphicElements: [] }
}
