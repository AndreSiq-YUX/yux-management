/* Generated from contracts/radar/v1/radar-research.schema.json. Do not edit manually. */

export type RadarResearchContractV1 =
  | ResearchEvidenceV1
  | EffectReceiptV1
  | CommercialResearchStatusV1
  | BusinessMentionV1
  | DecisionContextV1
  | DecisionResultV1
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
export type DecisionResultV1 = {
  [k: string]: unknown
} & {
  schemaVersion: 1
  task: 'radar_initial_triage' | 'radar_next_action' | 'radar_quality_gate'
  status: 'decided' | 'unavailable' | 'context_incomplete'
  choice: string | null
  reasonCode:
    | 'fit_supported'
    | 'outside_activity'
    | 'identity_unresolved'
    | 'more_evidence_needed'
    | 'action_selected'
    | 'quality_review'
  /**
   * @maxItems 6
   */
  evidenceIds:
    | []
    | [string]
    | [string, string]
    | [string, string, string]
    | [string, string, string, string]
    | [string, string, string, string, string]
    | [string, string, string, string, string, string]
  probabilities?: {
    [k: string]: number
  }
  confidence?: number | null
  requestedModel?: string
  resolvedModel?: string
  provider?: 'openrouter'
  upstreamProvider?: string
  externalRequestId?: string
  adapterVersion?: 'openrouter-decisions-alpha-v1'
  contextVersion?: 'radar-decision-context-v1'
  questionVersion?: 'radar-decisions-questions-v1'
  criteriaRubricVersion?: 'radar-decisions-rubric-v1'
  contextBytes?: number
  omittedEvidenceIds?: string[]
  /**
   * @maxItems 10
   */
  attempts:
    | []
    | [
        {
          requestedModel: string
          resolvedModel: string | null
          status: 'valid' | 'received' | 'rejected'
          latencyMs: number
          failureCode?: string
          usage: {
            inputTokens: number | null
            outputTokens: number | null
            costUsd: (number | string) | null
          }
        },
      ]
    | [
        {
          requestedModel: string
          resolvedModel: string | null
          status: 'valid' | 'received' | 'rejected'
          latencyMs: number
          failureCode?: string
          usage: {
            inputTokens: number | null
            outputTokens: number | null
            costUsd: (number | string) | null
          }
        },
        {
          requestedModel: string
          resolvedModel: string | null
          status: 'valid' | 'received' | 'rejected'
          latencyMs: number
          failureCode?: string
          usage: {
            inputTokens: number | null
            outputTokens: number | null
            costUsd: (number | string) | null
          }
        },
      ]
    | [
        {
          requestedModel: string
          resolvedModel: string | null
          status: 'valid' | 'received' | 'rejected'
          latencyMs: number
          failureCode?: string
          usage: {
            inputTokens: number | null
            outputTokens: number | null
            costUsd: (number | string) | null
          }
        },
        {
          requestedModel: string
          resolvedModel: string | null
          status: 'valid' | 'received' | 'rejected'
          latencyMs: number
          failureCode?: string
          usage: {
            inputTokens: number | null
            outputTokens: number | null
            costUsd: (number | string) | null
          }
        },
        {
          requestedModel: string
          resolvedModel: string | null
          status: 'valid' | 'received' | 'rejected'
          latencyMs: number
          failureCode?: string
          usage: {
            inputTokens: number | null
            outputTokens: number | null
            costUsd: (number | string) | null
          }
        },
      ]
    | [
        {
          requestedModel: string
          resolvedModel: string | null
          status: 'valid' | 'received' | 'rejected'
          latencyMs: number
          failureCode?: string
          usage: {
            inputTokens: number | null
            outputTokens: number | null
            costUsd: (number | string) | null
          }
        },
        {
          requestedModel: string
          resolvedModel: string | null
          status: 'valid' | 'received' | 'rejected'
          latencyMs: number
          failureCode?: string
          usage: {
            inputTokens: number | null
            outputTokens: number | null
            costUsd: (number | string) | null
          }
        },
        {
          requestedModel: string
          resolvedModel: string | null
          status: 'valid' | 'received' | 'rejected'
          latencyMs: number
          failureCode?: string
          usage: {
            inputTokens: number | null
            outputTokens: number | null
            costUsd: (number | string) | null
          }
        },
        {
          requestedModel: string
          resolvedModel: string | null
          status: 'valid' | 'received' | 'rejected'
          latencyMs: number
          failureCode?: string
          usage: {
            inputTokens: number | null
            outputTokens: number | null
            costUsd: (number | string) | null
          }
        },
      ]
    | [
        {
          requestedModel: string
          resolvedModel: string | null
          status: 'valid' | 'received' | 'rejected'
          latencyMs: number
          failureCode?: string
          usage: {
            inputTokens: number | null
            outputTokens: number | null
            costUsd: (number | string) | null
          }
        },
        {
          requestedModel: string
          resolvedModel: string | null
          status: 'valid' | 'received' | 'rejected'
          latencyMs: number
          failureCode?: string
          usage: {
            inputTokens: number | null
            outputTokens: number | null
            costUsd: (number | string) | null
          }
        },
        {
          requestedModel: string
          resolvedModel: string | null
          status: 'valid' | 'received' | 'rejected'
          latencyMs: number
          failureCode?: string
          usage: {
            inputTokens: number | null
            outputTokens: number | null
            costUsd: (number | string) | null
          }
        },
        {
          requestedModel: string
          resolvedModel: string | null
          status: 'valid' | 'received' | 'rejected'
          latencyMs: number
          failureCode?: string
          usage: {
            inputTokens: number | null
            outputTokens: number | null
            costUsd: (number | string) | null
          }
        },
        {
          requestedModel: string
          resolvedModel: string | null
          status: 'valid' | 'received' | 'rejected'
          latencyMs: number
          failureCode?: string
          usage: {
            inputTokens: number | null
            outputTokens: number | null
            costUsd: (number | string) | null
          }
        },
      ]
    | [
        {
          requestedModel: string
          resolvedModel: string | null
          status: 'valid' | 'received' | 'rejected'
          latencyMs: number
          failureCode?: string
          usage: {
            inputTokens: number | null
            outputTokens: number | null
            costUsd: (number | string) | null
          }
        },
        {
          requestedModel: string
          resolvedModel: string | null
          status: 'valid' | 'received' | 'rejected'
          latencyMs: number
          failureCode?: string
          usage: {
            inputTokens: number | null
            outputTokens: number | null
            costUsd: (number | string) | null
          }
        },
        {
          requestedModel: string
          resolvedModel: string | null
          status: 'valid' | 'received' | 'rejected'
          latencyMs: number
          failureCode?: string
          usage: {
            inputTokens: number | null
            outputTokens: number | null
            costUsd: (number | string) | null
          }
        },
        {
          requestedModel: string
          resolvedModel: string | null
          status: 'valid' | 'received' | 'rejected'
          latencyMs: number
          failureCode?: string
          usage: {
            inputTokens: number | null
            outputTokens: number | null
            costUsd: (number | string) | null
          }
        },
        {
          requestedModel: string
          resolvedModel: string | null
          status: 'valid' | 'received' | 'rejected'
          latencyMs: number
          failureCode?: string
          usage: {
            inputTokens: number | null
            outputTokens: number | null
            costUsd: (number | string) | null
          }
        },
        {
          requestedModel: string
          resolvedModel: string | null
          status: 'valid' | 'received' | 'rejected'
          latencyMs: number
          failureCode?: string
          usage: {
            inputTokens: number | null
            outputTokens: number | null
            costUsd: (number | string) | null
          }
        },
      ]
    | [
        {
          requestedModel: string
          resolvedModel: string | null
          status: 'valid' | 'received' | 'rejected'
          latencyMs: number
          failureCode?: string
          usage: {
            inputTokens: number | null
            outputTokens: number | null
            costUsd: (number | string) | null
          }
        },
        {
          requestedModel: string
          resolvedModel: string | null
          status: 'valid' | 'received' | 'rejected'
          latencyMs: number
          failureCode?: string
          usage: {
            inputTokens: number | null
            outputTokens: number | null
            costUsd: (number | string) | null
          }
        },
        {
          requestedModel: string
          resolvedModel: string | null
          status: 'valid' | 'received' | 'rejected'
          latencyMs: number
          failureCode?: string
          usage: {
            inputTokens: number | null
            outputTokens: number | null
            costUsd: (number | string) | null
          }
        },
        {
          requestedModel: string
          resolvedModel: string | null
          status: 'valid' | 'received' | 'rejected'
          latencyMs: number
          failureCode?: string
          usage: {
            inputTokens: number | null
            outputTokens: number | null
            costUsd: (number | string) | null
          }
        },
        {
          requestedModel: string
          resolvedModel: string | null
          status: 'valid' | 'received' | 'rejected'
          latencyMs: number
          failureCode?: string
          usage: {
            inputTokens: number | null
            outputTokens: number | null
            costUsd: (number | string) | null
          }
        },
        {
          requestedModel: string
          resolvedModel: string | null
          status: 'valid' | 'received' | 'rejected'
          latencyMs: number
          failureCode?: string
          usage: {
            inputTokens: number | null
            outputTokens: number | null
            costUsd: (number | string) | null
          }
        },
        {
          requestedModel: string
          resolvedModel: string | null
          status: 'valid' | 'received' | 'rejected'
          latencyMs: number
          failureCode?: string
          usage: {
            inputTokens: number | null
            outputTokens: number | null
            costUsd: (number | string) | null
          }
        },
      ]
    | [
        {
          requestedModel: string
          resolvedModel: string | null
          status: 'valid' | 'received' | 'rejected'
          latencyMs: number
          failureCode?: string
          usage: {
            inputTokens: number | null
            outputTokens: number | null
            costUsd: (number | string) | null
          }
        },
        {
          requestedModel: string
          resolvedModel: string | null
          status: 'valid' | 'received' | 'rejected'
          latencyMs: number
          failureCode?: string
          usage: {
            inputTokens: number | null
            outputTokens: number | null
            costUsd: (number | string) | null
          }
        },
        {
          requestedModel: string
          resolvedModel: string | null
          status: 'valid' | 'received' | 'rejected'
          latencyMs: number
          failureCode?: string
          usage: {
            inputTokens: number | null
            outputTokens: number | null
            costUsd: (number | string) | null
          }
        },
        {
          requestedModel: string
          resolvedModel: string | null
          status: 'valid' | 'received' | 'rejected'
          latencyMs: number
          failureCode?: string
          usage: {
            inputTokens: number | null
            outputTokens: number | null
            costUsd: (number | string) | null
          }
        },
        {
          requestedModel: string
          resolvedModel: string | null
          status: 'valid' | 'received' | 'rejected'
          latencyMs: number
          failureCode?: string
          usage: {
            inputTokens: number | null
            outputTokens: number | null
            costUsd: (number | string) | null
          }
        },
        {
          requestedModel: string
          resolvedModel: string | null
          status: 'valid' | 'received' | 'rejected'
          latencyMs: number
          failureCode?: string
          usage: {
            inputTokens: number | null
            outputTokens: number | null
            costUsd: (number | string) | null
          }
        },
        {
          requestedModel: string
          resolvedModel: string | null
          status: 'valid' | 'received' | 'rejected'
          latencyMs: number
          failureCode?: string
          usage: {
            inputTokens: number | null
            outputTokens: number | null
            costUsd: (number | string) | null
          }
        },
        {
          requestedModel: string
          resolvedModel: string | null
          status: 'valid' | 'received' | 'rejected'
          latencyMs: number
          failureCode?: string
          usage: {
            inputTokens: number | null
            outputTokens: number | null
            costUsd: (number | string) | null
          }
        },
      ]
    | [
        {
          requestedModel: string
          resolvedModel: string | null
          status: 'valid' | 'received' | 'rejected'
          latencyMs: number
          failureCode?: string
          usage: {
            inputTokens: number | null
            outputTokens: number | null
            costUsd: (number | string) | null
          }
        },
        {
          requestedModel: string
          resolvedModel: string | null
          status: 'valid' | 'received' | 'rejected'
          latencyMs: number
          failureCode?: string
          usage: {
            inputTokens: number | null
            outputTokens: number | null
            costUsd: (number | string) | null
          }
        },
        {
          requestedModel: string
          resolvedModel: string | null
          status: 'valid' | 'received' | 'rejected'
          latencyMs: number
          failureCode?: string
          usage: {
            inputTokens: number | null
            outputTokens: number | null
            costUsd: (number | string) | null
          }
        },
        {
          requestedModel: string
          resolvedModel: string | null
          status: 'valid' | 'received' | 'rejected'
          latencyMs: number
          failureCode?: string
          usage: {
            inputTokens: number | null
            outputTokens: number | null
            costUsd: (number | string) | null
          }
        },
        {
          requestedModel: string
          resolvedModel: string | null
          status: 'valid' | 'received' | 'rejected'
          latencyMs: number
          failureCode?: string
          usage: {
            inputTokens: number | null
            outputTokens: number | null
            costUsd: (number | string) | null
          }
        },
        {
          requestedModel: string
          resolvedModel: string | null
          status: 'valid' | 'received' | 'rejected'
          latencyMs: number
          failureCode?: string
          usage: {
            inputTokens: number | null
            outputTokens: number | null
            costUsd: (number | string) | null
          }
        },
        {
          requestedModel: string
          resolvedModel: string | null
          status: 'valid' | 'received' | 'rejected'
          latencyMs: number
          failureCode?: string
          usage: {
            inputTokens: number | null
            outputTokens: number | null
            costUsd: (number | string) | null
          }
        },
        {
          requestedModel: string
          resolvedModel: string | null
          status: 'valid' | 'received' | 'rejected'
          latencyMs: number
          failureCode?: string
          usage: {
            inputTokens: number | null
            outputTokens: number | null
            costUsd: (number | string) | null
          }
        },
        {
          requestedModel: string
          resolvedModel: string | null
          status: 'valid' | 'received' | 'rejected'
          latencyMs: number
          failureCode?: string
          usage: {
            inputTokens: number | null
            outputTokens: number | null
            costUsd: (number | string) | null
          }
        },
      ]
    | [
        {
          requestedModel: string
          resolvedModel: string | null
          status: 'valid' | 'received' | 'rejected'
          latencyMs: number
          failureCode?: string
          usage: {
            inputTokens: number | null
            outputTokens: number | null
            costUsd: (number | string) | null
          }
        },
        {
          requestedModel: string
          resolvedModel: string | null
          status: 'valid' | 'received' | 'rejected'
          latencyMs: number
          failureCode?: string
          usage: {
            inputTokens: number | null
            outputTokens: number | null
            costUsd: (number | string) | null
          }
        },
        {
          requestedModel: string
          resolvedModel: string | null
          status: 'valid' | 'received' | 'rejected'
          latencyMs: number
          failureCode?: string
          usage: {
            inputTokens: number | null
            outputTokens: number | null
            costUsd: (number | string) | null
          }
        },
        {
          requestedModel: string
          resolvedModel: string | null
          status: 'valid' | 'received' | 'rejected'
          latencyMs: number
          failureCode?: string
          usage: {
            inputTokens: number | null
            outputTokens: number | null
            costUsd: (number | string) | null
          }
        },
        {
          requestedModel: string
          resolvedModel: string | null
          status: 'valid' | 'received' | 'rejected'
          latencyMs: number
          failureCode?: string
          usage: {
            inputTokens: number | null
            outputTokens: number | null
            costUsd: (number | string) | null
          }
        },
        {
          requestedModel: string
          resolvedModel: string | null
          status: 'valid' | 'received' | 'rejected'
          latencyMs: number
          failureCode?: string
          usage: {
            inputTokens: number | null
            outputTokens: number | null
            costUsd: (number | string) | null
          }
        },
        {
          requestedModel: string
          resolvedModel: string | null
          status: 'valid' | 'received' | 'rejected'
          latencyMs: number
          failureCode?: string
          usage: {
            inputTokens: number | null
            outputTokens: number | null
            costUsd: (number | string) | null
          }
        },
        {
          requestedModel: string
          resolvedModel: string | null
          status: 'valid' | 'received' | 'rejected'
          latencyMs: number
          failureCode?: string
          usage: {
            inputTokens: number | null
            outputTokens: number | null
            costUsd: (number | string) | null
          }
        },
        {
          requestedModel: string
          resolvedModel: string | null
          status: 'valid' | 'received' | 'rejected'
          latencyMs: number
          failureCode?: string
          usage: {
            inputTokens: number | null
            outputTokens: number | null
            costUsd: (number | string) | null
          }
        },
        {
          requestedModel: string
          resolvedModel: string | null
          status: 'valid' | 'received' | 'rejected'
          latencyMs: number
          failureCode?: string
          usage: {
            inputTokens: number | null
            outputTokens: number | null
            costUsd: (number | string) | null
          }
        },
      ]
  usage: {
    inputTokens: number | null
    outputTokens: number | null
    costUsd: number | null
  }
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
export interface BusinessMentionV1 {
  schemaVersion: 1
  name: string
  location?: {
    city?: string
    state?: string
    address?: string
  }
  claimedTaxId?: string
  claimedWebsite?: string
  /**
   * @maxItems 12
   */
  contacts:
    | []
    | [
        {
          kind: 'email' | 'phone' | 'whatsapp' | 'social'
          value: string
        },
      ]
    | [
        {
          kind: 'email' | 'phone' | 'whatsapp' | 'social'
          value: string
        },
        {
          kind: 'email' | 'phone' | 'whatsapp' | 'social'
          value: string
        },
      ]
    | [
        {
          kind: 'email' | 'phone' | 'whatsapp' | 'social'
          value: string
        },
        {
          kind: 'email' | 'phone' | 'whatsapp' | 'social'
          value: string
        },
        {
          kind: 'email' | 'phone' | 'whatsapp' | 'social'
          value: string
        },
      ]
    | [
        {
          kind: 'email' | 'phone' | 'whatsapp' | 'social'
          value: string
        },
        {
          kind: 'email' | 'phone' | 'whatsapp' | 'social'
          value: string
        },
        {
          kind: 'email' | 'phone' | 'whatsapp' | 'social'
          value: string
        },
        {
          kind: 'email' | 'phone' | 'whatsapp' | 'social'
          value: string
        },
      ]
    | [
        {
          kind: 'email' | 'phone' | 'whatsapp' | 'social'
          value: string
        },
        {
          kind: 'email' | 'phone' | 'whatsapp' | 'social'
          value: string
        },
        {
          kind: 'email' | 'phone' | 'whatsapp' | 'social'
          value: string
        },
        {
          kind: 'email' | 'phone' | 'whatsapp' | 'social'
          value: string
        },
        {
          kind: 'email' | 'phone' | 'whatsapp' | 'social'
          value: string
        },
      ]
    | [
        {
          kind: 'email' | 'phone' | 'whatsapp' | 'social'
          value: string
        },
        {
          kind: 'email' | 'phone' | 'whatsapp' | 'social'
          value: string
        },
        {
          kind: 'email' | 'phone' | 'whatsapp' | 'social'
          value: string
        },
        {
          kind: 'email' | 'phone' | 'whatsapp' | 'social'
          value: string
        },
        {
          kind: 'email' | 'phone' | 'whatsapp' | 'social'
          value: string
        },
        {
          kind: 'email' | 'phone' | 'whatsapp' | 'social'
          value: string
        },
      ]
    | [
        {
          kind: 'email' | 'phone' | 'whatsapp' | 'social'
          value: string
        },
        {
          kind: 'email' | 'phone' | 'whatsapp' | 'social'
          value: string
        },
        {
          kind: 'email' | 'phone' | 'whatsapp' | 'social'
          value: string
        },
        {
          kind: 'email' | 'phone' | 'whatsapp' | 'social'
          value: string
        },
        {
          kind: 'email' | 'phone' | 'whatsapp' | 'social'
          value: string
        },
        {
          kind: 'email' | 'phone' | 'whatsapp' | 'social'
          value: string
        },
        {
          kind: 'email' | 'phone' | 'whatsapp' | 'social'
          value: string
        },
      ]
    | [
        {
          kind: 'email' | 'phone' | 'whatsapp' | 'social'
          value: string
        },
        {
          kind: 'email' | 'phone' | 'whatsapp' | 'social'
          value: string
        },
        {
          kind: 'email' | 'phone' | 'whatsapp' | 'social'
          value: string
        },
        {
          kind: 'email' | 'phone' | 'whatsapp' | 'social'
          value: string
        },
        {
          kind: 'email' | 'phone' | 'whatsapp' | 'social'
          value: string
        },
        {
          kind: 'email' | 'phone' | 'whatsapp' | 'social'
          value: string
        },
        {
          kind: 'email' | 'phone' | 'whatsapp' | 'social'
          value: string
        },
        {
          kind: 'email' | 'phone' | 'whatsapp' | 'social'
          value: string
        },
      ]
    | [
        {
          kind: 'email' | 'phone' | 'whatsapp' | 'social'
          value: string
        },
        {
          kind: 'email' | 'phone' | 'whatsapp' | 'social'
          value: string
        },
        {
          kind: 'email' | 'phone' | 'whatsapp' | 'social'
          value: string
        },
        {
          kind: 'email' | 'phone' | 'whatsapp' | 'social'
          value: string
        },
        {
          kind: 'email' | 'phone' | 'whatsapp' | 'social'
          value: string
        },
        {
          kind: 'email' | 'phone' | 'whatsapp' | 'social'
          value: string
        },
        {
          kind: 'email' | 'phone' | 'whatsapp' | 'social'
          value: string
        },
        {
          kind: 'email' | 'phone' | 'whatsapp' | 'social'
          value: string
        },
        {
          kind: 'email' | 'phone' | 'whatsapp' | 'social'
          value: string
        },
      ]
    | [
        {
          kind: 'email' | 'phone' | 'whatsapp' | 'social'
          value: string
        },
        {
          kind: 'email' | 'phone' | 'whatsapp' | 'social'
          value: string
        },
        {
          kind: 'email' | 'phone' | 'whatsapp' | 'social'
          value: string
        },
        {
          kind: 'email' | 'phone' | 'whatsapp' | 'social'
          value: string
        },
        {
          kind: 'email' | 'phone' | 'whatsapp' | 'social'
          value: string
        },
        {
          kind: 'email' | 'phone' | 'whatsapp' | 'social'
          value: string
        },
        {
          kind: 'email' | 'phone' | 'whatsapp' | 'social'
          value: string
        },
        {
          kind: 'email' | 'phone' | 'whatsapp' | 'social'
          value: string
        },
        {
          kind: 'email' | 'phone' | 'whatsapp' | 'social'
          value: string
        },
        {
          kind: 'email' | 'phone' | 'whatsapp' | 'social'
          value: string
        },
      ]
    | [
        {
          kind: 'email' | 'phone' | 'whatsapp' | 'social'
          value: string
        },
        {
          kind: 'email' | 'phone' | 'whatsapp' | 'social'
          value: string
        },
        {
          kind: 'email' | 'phone' | 'whatsapp' | 'social'
          value: string
        },
        {
          kind: 'email' | 'phone' | 'whatsapp' | 'social'
          value: string
        },
        {
          kind: 'email' | 'phone' | 'whatsapp' | 'social'
          value: string
        },
        {
          kind: 'email' | 'phone' | 'whatsapp' | 'social'
          value: string
        },
        {
          kind: 'email' | 'phone' | 'whatsapp' | 'social'
          value: string
        },
        {
          kind: 'email' | 'phone' | 'whatsapp' | 'social'
          value: string
        },
        {
          kind: 'email' | 'phone' | 'whatsapp' | 'social'
          value: string
        },
        {
          kind: 'email' | 'phone' | 'whatsapp' | 'social'
          value: string
        },
        {
          kind: 'email' | 'phone' | 'whatsapp' | 'social'
          value: string
        },
      ]
    | [
        {
          kind: 'email' | 'phone' | 'whatsapp' | 'social'
          value: string
        },
        {
          kind: 'email' | 'phone' | 'whatsapp' | 'social'
          value: string
        },
        {
          kind: 'email' | 'phone' | 'whatsapp' | 'social'
          value: string
        },
        {
          kind: 'email' | 'phone' | 'whatsapp' | 'social'
          value: string
        },
        {
          kind: 'email' | 'phone' | 'whatsapp' | 'social'
          value: string
        },
        {
          kind: 'email' | 'phone' | 'whatsapp' | 'social'
          value: string
        },
        {
          kind: 'email' | 'phone' | 'whatsapp' | 'social'
          value: string
        },
        {
          kind: 'email' | 'phone' | 'whatsapp' | 'social'
          value: string
        },
        {
          kind: 'email' | 'phone' | 'whatsapp' | 'social'
          value: string
        },
        {
          kind: 'email' | 'phone' | 'whatsapp' | 'social'
          value: string
        },
        {
          kind: 'email' | 'phone' | 'whatsapp' | 'social'
          value: string
        },
        {
          kind: 'email' | 'phone' | 'whatsapp' | 'social'
          value: string
        },
      ]
  sourceUrl: string
  observedAt?: string
  subjectScope: 'company' | 'group' | 'establishment'
  needsVerification: true
  /**
   * @minItems 1
   * @maxItems 24
   */
  evidenceSpans: [
    {
      field: 'name' | 'city' | 'state' | 'address' | 'claimedTaxId' | 'claimedWebsite' | 'contact'
      evidenceId: string
      excerpt: string
    },
    ...{
      field: 'name' | 'city' | 'state' | 'address' | 'claimedTaxId' | 'claimedWebsite' | 'contact'
      evidenceId: string
      excerpt: string
    }[],
  ]
}
export interface DecisionContextV1 {
  schemaVersion: 1
  organizationId: string
  campaignId: string
  candidateId: string
  configurationRevision: number
  task: 'radar_initial_triage' | 'radar_next_action' | 'radar_quality_gate'
  identity: {
    name: string
    legalName?: string
    cnpj?: string
    city?: string
    state?: string
    address?: string
  }
  criteria: {
    segment?: string
    offer?: string
    /**
     * @maxItems 50
     */
    products?: string[]
    /**
     * @maxItems 50
     */
    includeTerms?: string[]
    /**
     * @maxItems 50
     */
    includeAllTerms?: string[]
    /**
     * @maxItems 50
     */
    excludeTerms?: string[]
    /**
     * @maxItems 20
     */
    requiredContacts?:
      | []
      | [string]
      | [string, string]
      | [string, string, string]
      | [string, string, string, string]
      | [string, string, string, string, string]
      | [string, string, string, string, string, string]
      | [string, string, string, string, string, string, string]
      | [string, string, string, string, string, string, string, string]
      | [string, string, string, string, string, string, string, string, string]
      | [string, string, string, string, string, string, string, string, string, string]
      | [string, string, string, string, string, string, string, string, string, string, string]
      | [string, string, string, string, string, string, string, string, string, string, string, string]
      | [string, string, string, string, string, string, string, string, string, string, string, string, string]
      | [string, string, string, string, string, string, string, string, string, string, string, string, string, string]
      | [
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
        ]
      | [
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
        ]
      | [
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
        ]
      | [
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
        ]
      | [
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
        ]
      | [
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
        ]
    minimumUsefulContacts?: string
    contactPurpose?: string
    /**
     * @maxItems 50
     */
    desiredCnaes?: string[]
    cnaeRule?: 'required' | 'advisory'
  }
  /**
   * @maxItems 30
   */
  evidence: {
    id: string
    sourceUrl: string
    text: string
    role: 'identity' | 'activity' | 'domain' | 'contact'
    primary: boolean
    contradictory: boolean
    scope: 'establishment' | 'group' | 'unresolved'
  }[]
  /**
   * @maxItems 8
   */
  options:
    | []
    | [
        {
          id: string
          description: string
        },
      ]
    | [
        {
          id: string
          description: string
        },
        {
          id: string
          description: string
        },
      ]
    | [
        {
          id: string
          description: string
        },
        {
          id: string
          description: string
        },
        {
          id: string
          description: string
        },
      ]
    | [
        {
          id: string
          description: string
        },
        {
          id: string
          description: string
        },
        {
          id: string
          description: string
        },
        {
          id: string
          description: string
        },
      ]
    | [
        {
          id: string
          description: string
        },
        {
          id: string
          description: string
        },
        {
          id: string
          description: string
        },
        {
          id: string
          description: string
        },
        {
          id: string
          description: string
        },
      ]
    | [
        {
          id: string
          description: string
        },
        {
          id: string
          description: string
        },
        {
          id: string
          description: string
        },
        {
          id: string
          description: string
        },
        {
          id: string
          description: string
        },
        {
          id: string
          description: string
        },
      ]
    | [
        {
          id: string
          description: string
        },
        {
          id: string
          description: string
        },
        {
          id: string
          description: string
        },
        {
          id: string
          description: string
        },
        {
          id: string
          description: string
        },
        {
          id: string
          description: string
        },
        {
          id: string
          description: string
        },
      ]
    | [
        {
          id: string
          description: string
        },
        {
          id: string
          description: string
        },
        {
          id: string
          description: string
        },
        {
          id: string
          description: string
        },
        {
          id: string
          description: string
        },
        {
          id: string
          description: string
        },
        {
          id: string
          description: string
        },
        {
          id: string
          description: string
        },
      ]
  humanReviewed: boolean
}
