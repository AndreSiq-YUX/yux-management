/* Generated from contracts/radar/v1/radar-research.schema.json. Do not edit manually. */

export type RadarResearchContractV1 = ResearchEvidenceV1 | EffectReceiptV1 | CommercialResearchStatusV1
export type EffectReceiptV1 = {
  [k: string]: unknown
} & {
  schemaVersion: 1
  organizationId: string
  effectKey: string
  attempt: number
  analysisReceiptId: string
  ownerToken: string
  leaseUntil: string
  inputHash: string
  transportOutcome: 'not_started' | 'rejected' | 'received' | 'uncertain'
  validationOutcome: 'pending' | 'valid' | 'invalid'
  billingOutcome: 'known' | 'estimated' | 'uncertain'
  responseBody: {
    [k: string]: unknown
  } | null
  provider?: string | null
  modelSnapshot?: string | null
  externalRequestId?: string | null
  usage: {
    inputTokens: number | null
    outputTokens: number | null
    costUsd: number | null
  } | null
  failureCode: string | null
}

export interface ResearchEvidenceV1 {
  schemaVersion: 1
  id: string
  sourceUrl: string
  text: string
  observedAt: string
  kind: 'institutional_candidate' | 'directory' | 'social' | 'third_party' | 'registry'
  scope: 'establishment' | 'group' | 'unresolved'
}
export interface CommercialResearchStatusV1 {
  schemaVersion: 1
  status: 'researching' | 'complete' | 'incomplete' | 'waiting' | 'unchanged'
  updatedFields: (
    | 'website'
    | 'email'
    | 'phone'
    | 'whatsapp'
    | 'social'
    | 'supplierChannel'
    | 'companyProfile'
    | 'companySize'
    | 'activity'
    | 'identity'
    | 'fit'
  )[]
  unresolvedFields: {
    field:
      | 'website'
      | 'email'
      | 'phone'
      | 'whatsapp'
      | 'social'
      | 'supplierChannel'
      | 'companyProfile'
      | 'companySize'
      | 'activity'
      | 'identity'
      | 'fit'
    reason: 'not_found' | 'reading_restricted' | 'identity_unresolved' | 'verification_pending' | 'outside_profile'
  }[]
  lastAttemptAt: string | null
  nextAction: 'continue' | 'review_source' | 'review_result' | 'wait' | 'none'
}
