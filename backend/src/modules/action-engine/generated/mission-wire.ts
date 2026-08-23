/* Generated from contracts/mission-supervisor/v1/mission-wire.schema.json. Do not edit manually. */

export type Contenthash = string
export type Key = string
export type Protectedstepkeys = string[]
export type Semanticversion = string
export type AllowedSourceIds = string[]
export type AskedQuestionKeys = string[]
export type Definitionhash = string | null
export type Effect = 'none' | 'draft' | 'internal' | 'external' | 'destructive'
export type Key1 = string
export type Version = number
export type Capabilities = CapabilityWire[]
export type ClarificationRound = number
export type ClientId = string | null
export type ContextSnapshotId = string | null
export type ContractId = string | null
export type Observations = {
  [k: string]: unknown
}[]
export type OrganizationId = string
export type PackCatalog = ActionPackWire[]
export type PlanningBudget = {
  [k: string]: unknown
} | null
export type PreviousRevision = {
  [k: string]: unknown
} | null
export type ProposedPlan = {
  [k: string]: unknown
} | null
export type MissionPlanResponseWire = ClarificationResponseWire | PlanProposalResponseWire
export type Kind = 'clarification'
export type Plan = null
/**
 * @minItems 1
 * @maxItems 3
 */
export type Questions =
  | [ClarificationQuestionWire]
  | [ClarificationQuestionWire, ClarificationQuestionWire]
  | [ClarificationQuestionWire, ClarificationQuestionWire, ClarificationQuestionWire]
export type Answertype = 'text' | 'number' | 'currency' | 'date' | 'single_choice' | 'multiple_choice' | 'boolean'
export type Defaultsourceid = string | null
export type Defaultvalue = unknown | null
export type Key2 = string
export type Label = string
export type Priority = number
export type Whyneeded = string
export type Contenthash1 = string
export type Key3 = string
export type Version1 = string
export type Selectedpacks = SelectedPackWire[]
export type Sourceids = string[]
export type Trace = {
  [k: string]: unknown
} | null
export type Usage = {
  [k: string]: unknown
} | null
export type Kind1 = 'plan'
export type Key4 = string
export type Templatehash = string
export type Version2 = string
export type Assumptions = string[]
export type Extensionpoint = string
export type Rationale = string
export type Deviations = PlanDeviationWire[]
export type Aiandprovidercost = string
export type Currency = 'BRL'
export type Humancost = string
export type Humanhours = string
export type Mediacost = string
export type Totalexecutioncost = string
export type Missionid = string
export type Rationale1 = string
export type Risks = string[]
export type Schemaversion = 1
/**
 * @minItems 1
 */
export type Steps = [PlanStepWire, ...PlanStepWire[]]
export type Approvalrequired = boolean
export type Capabilitykey = string
export type Capabilityversion = number
export type Dependson = string[]
export type Effect1 = 'none' | 'draft' | 'internal' | 'external' | 'destructive'
export type Maxattempts = number
export type Fromstep = string
export type Path = string
export type Stepkey = string
export type Timeoutseconds = number
/**
 * @maxItems 0
 */
export type Questions1 = []
/**
 * @minItems 1
 */
export type Selectedpacks1 = [SelectedPackWire, ...SelectedPackWire[]]
export type Sourceids1 = string[]
export type Trace1 = {
  [k: string]: unknown
} | null
export type Usage1 = {
  [k: string]: unknown
} | null

export interface YUXMissionSupervisorWireContractV1 {
  request: MissionPlanRequestWire
  response: MissionPlanResponseWire
}
export interface MissionPlanRequestWire {
  action_pack: ActionPackWire
  allowed_source_ids?: AllowedSourceIds
  asked_question_keys?: AskedQuestionKeys
  baseline?: Baseline
  capabilities: Capabilities
  clarification_round?: ClarificationRound
  client_id?: ClientId
  context_snapshot_id?: ContextSnapshotId
  contract_id?: ContractId
  limits?: Limits
  mission: Mission
  observations?: Observations
  organization_id: OrganizationId
  pack_catalog?: PackCatalog
  planning_budget?: PlanningBudget
  previous_revision?: PreviousRevision
  proposed_plan?: ProposedPlan
  readiness: Readiness
  strategy_context?: StrategyContext
}
export interface ActionPackWire {
  contentHash: Contenthash
  key: Key
  protectedStepKeys?: Protectedstepkeys
  semanticVersion: Semanticversion
  topologyTemplate?: Topologytemplate
}
export interface Topologytemplate {
  [k: string]: unknown
}
export interface Baseline {
  [k: string]: unknown
}
export interface CapabilityWire {
  definitionHash?: Definitionhash
  effect: Effect
  key: Key1
  version: Version
}
export interface Limits {
  [k: string]: unknown
}
export interface Mission {
  [k: string]: unknown
}
export interface Readiness {
  [k: string]: unknown
}
export interface StrategyContext {
  [k: string]: unknown
}
export interface ClarificationResponseWire {
  interpretation: Interpretation
  kind: Kind
  plan?: Plan
  questions: Questions
  selectedPacks?: Selectedpacks
  sourceIds?: Sourceids
  trace?: Trace
  usage?: Usage
}
export interface Interpretation {
  [k: string]: unknown
}
export interface ClarificationQuestionWire {
  answerType: Answertype
  defaultSourceId?: Defaultsourceid
  defaultValue?: Defaultvalue
  key: Key2
  label: Label
  priority: Priority
  whyNeeded: Whyneeded
}
export interface SelectedPackWire {
  contentHash: Contenthash1
  key: Key3
  version: Version1
}
export interface PlanProposalResponseWire {
  interpretation: Interpretation1
  kind: Kind1
  plan: PlanWire
  questions?: Questions1
  selectedPacks: Selectedpacks1
  sourceIds?: Sourceids1
  trace?: Trace1
  usage?: Usage1
}
export interface Interpretation1 {
  [k: string]: unknown
}
export interface PlanWire {
  actionPack: ActionPackReferenceWire
  assumptions?: Assumptions
  deviations?: Deviations
  estimatedEconomics: EstimatedEconomicsWire
  missionId: Missionid
  rationale: Rationale1
  resolvedParameters?: Resolvedparameters
  risks?: Risks
  schemaVersion: Schemaversion
  steps: Steps
}
export interface ActionPackReferenceWire {
  key: Key4
  templateHash: Templatehash
  version: Version2
}
export interface PlanDeviationWire {
  extensionPoint: Extensionpoint
  rationale: Rationale
}
export interface EstimatedEconomicsWire {
  aiAndProviderCost: Aiandprovidercost
  currency: Currency
  humanCost: Humancost
  humanHours: Humanhours
  mediaCost: Mediacost
  totalExecutionCost: Totalexecutioncost
}
export interface Resolvedparameters {
  [k: string]: unknown
}
export interface PlanStepWire {
  approvalRequired: Approvalrequired
  capabilityKey: Capabilitykey
  capabilityVersion: Capabilityversion
  dependsOn?: Dependson
  effect: Effect1
  input?: Input
  maxAttempts: Maxattempts
  outputBindings?: Outputbindings
  stepKey: Stepkey
  timeoutSeconds: Timeoutseconds
}
export interface Input {
  [k: string]: unknown
}
export interface Outputbindings {
  [k: string]: OutputBindingWire
}
export interface OutputBindingWire {
  fromStep: Fromstep
  path: Path
}
