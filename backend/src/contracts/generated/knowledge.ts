/* Generated from contracts/knowledge/v1/knowledge.schema.json. Do not edit manually. */

export type KnowledgeContractV1 = KnowledgeQueryV1 | RetrievalResultV1 | PublishKnowledgeV1 | KnowledgeIngestionStateV1
export type Uuid = string
export type Sha256 = string

export interface KnowledgeQueryV1 {
  schemaVersion: 1
  organizationId: Uuid
  contractId: Uuid | null
  profileKey: string
  audience: 'internal_operator' | 'client_user' | 'external_contact'
  moduleKey: string
  workflowKey: string | null
  channel: string | null
  queryText: string
  matchLimit: number
}
export interface RetrievalResultV1 {
  schemaVersion: 1
  status: 'ok' | 'empty' | 'degraded' | 'unavailable'
  reasonCode: string | null
  retrievalMode: 'hybrid' | 'lexical' | 'none'
  queryId: Uuid
  sources: KnowledgeSourceRefV1[]
  contextHash: Sha256
  elapsedMs: number
}
export interface KnowledgeSourceRefV1 {
  namespace: 'strategy' | 'company'
  id: Uuid
  publicationId: Uuid
  itemId: Uuid
  documentId: Uuid | null
  sourceLocator: string | null
  contentHash: Sha256
  knowledgePolicyVersion: 1
  useMode: 'internal_reasoning' | 'quotable'
}
export interface PublishKnowledgeV1 {
  schemaVersion: 1
  organizationId: Uuid
  expectedVersion: number
  /**
   * @minItems 1
   */
  itemIds: [Uuid, ...Uuid[]]
  policy: {
    /**
     * @minItems 1
     */
    audiences: [
      'internal_operator' | 'client_user' | 'external_contact',
      ...('internal_operator' | 'client_user' | 'external_contact')[],
    ]
    allowedProfiles: string[]
    blockedProfiles: string[]
  }
  snapshotHash: Sha256
}
export interface KnowledgeIngestionStateV1 {
  schemaVersion: 1
  documentId: Uuid
  status: 'uploaded' | 'queued' | 'processing' | 'ready_for_review' | 'published' | 'degraded' | 'failed'
  attempt: number
  leaseUntil: string | null
  errorCode: string | null
}
