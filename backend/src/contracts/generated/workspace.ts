/* Generated from contracts/workspace/v1/workspace.schema.json. Do not edit manually. */

export type WorkspaceContractsV1 = WorkspaceContextV1 | CorrectionTargetV1
export type Uuid = string

export interface WorkspaceContextV1 {
  schemaVersion: 1
  organizationId: Uuid
  kind: 'internal_growth' | 'client'
  contractId: Uuid | null
  role: 'yux_admin' | 'yux_operator' | 'client_admin' | 'client_member'
  moduleKeys: string[]
  canConfigure: boolean
  missionCreation: {
    mode: 'conversation' | 'form' | 'unavailable'
    reasonCode: string | null
  }
}
export interface CorrectionTargetV1 {
  key:
    | 'company_profile'
    | 'knowledge'
    | 'channel_connection'
    | 'mission_brief'
    | 'contract_modules'
    | 'provider_connection'
  organizationId: Uuid
  entityId: Uuid | null
  fieldKeys: string[]
  returnTo: {
    kind: 'mission' | 'conversation'
    id: Uuid
  }
}
