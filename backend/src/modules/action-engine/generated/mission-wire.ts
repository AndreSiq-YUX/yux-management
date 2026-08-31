/* Generated from contracts/mission-supervisor/v1/mission-wire.schema.json. Do not edit manually. */

/**
 * @maxItems 20
 */
export type Allowedactionpacks =
  | []
  | [SelectedPackWire]
  | [SelectedPackWire, SelectedPackWire]
  | [SelectedPackWire, SelectedPackWire, SelectedPackWire]
  | [SelectedPackWire, SelectedPackWire, SelectedPackWire, SelectedPackWire]
  | [SelectedPackWire, SelectedPackWire, SelectedPackWire, SelectedPackWire, SelectedPackWire]
  | [SelectedPackWire, SelectedPackWire, SelectedPackWire, SelectedPackWire, SelectedPackWire, SelectedPackWire]
  | [
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
    ]
  | [
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
    ]
  | [
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
    ]
  | [
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
    ]
  | [
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
    ]
  | [
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
    ]
  | [
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
    ]
  | [
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
    ]
  | [
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
    ]
  | [
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
    ]
  | [
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
    ]
  | [
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
    ]
  | [
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
    ]
  | [
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
      SelectedPackWire,
    ]
export type Contenthash = string
export type Key = string
export type Version = string
/**
 * @maxItems 500
 */
export type Allowedcapabilitykeys = string[]
export type Audience = 'internal_operator' | 'client_user'
export type ClientId = string | null
export type ContractId = string | null
export type ConversationId = string
export type OrganizationId = string
export type Rollingsummary = string
export type Schemaversion = 1
/**
 * @maxItems 20
 */
export type Transcript =
  | []
  | [MissionConversationTranscriptMessageWire]
  | [MissionConversationTranscriptMessageWire, MissionConversationTranscriptMessageWire]
  | [
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
    ]
  | [
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
    ]
  | [
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
    ]
  | [
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
    ]
  | [
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
    ]
  | [
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
    ]
  | [
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
    ]
  | [
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
    ]
  | [
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
    ]
  | [
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
    ]
  | [
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
    ]
  | [
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
    ]
  | [
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
    ]
  | [
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
    ]
  | [
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
    ]
  | [
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
    ]
  | [
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
    ]
  | [
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
      MissionConversationTranscriptMessageWire,
    ]
export type Content = string
export type Role = 'user' | 'agent'
export type UserMessage = string
/**
 * @maxItems 100
 */
export type Acceptancecriteria = {
  [k: string]: unknown
}[]
export type Deadlineat = string | null
export type Maxexternalcontacts = number | null
export type Maxhumanhours = string | null
export type Maxtotalcostbrl = string | null
export type Mode = ('shadow' | 'prepare' | 'assisted' | 'autonomous') | null
export type Objective = string
/**
 * @maxItems 20
 */
export type Packkeys =
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
export type Requestedoutcome = string
/**
 * @maxItems 100
 */
export type Scopehints = string[]
export type Title = string | null
export type Contexthash = string
export type Kind = 'message' | 'questions' | 'brief_confirmation' | 'blocked'
/**
 * @maxItems 3
 */
export type Questions =
  | []
  | [MissionConversationQuestionWire]
  | [MissionConversationQuestionWire, MissionConversationQuestionWire]
  | [MissionConversationQuestionWire, MissionConversationQuestionWire, MissionConversationQuestionWire]
export type Answertype = 'text' | 'number' | 'currency' | 'date' | 'single_choice' | 'multiple_choice' | 'boolean'
/**
 * @maxItems 20
 */
export type Choices =
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
export type Defaultsourceref = string | null
export type Defaultvalue = unknown | null
export type Key1 = string
export type Label = string
export type Priority = number
export type Whyneeded = string
export type Key2 = string
export type Sourceref = string | null
/**
 * @maxItems 100
 */
export type Assumptions = MissionConversationAssumptionWire[]
export type Key3 = string
export type Sourceref1 = string
/**
 * @maxItems 100
 */
export type Knownfacts = MissionConversationKnownFactWire[]
export type Category =
  'company' | 'brand' | 'offer' | 'audience' | 'budget' | 'deadline' | 'integration' | 'permission' | 'consent'
export type Correctionkey = string | null
export type Key4 = string
export type Reason = string
/**
 * @maxItems 50
 */
export type Requiredfor = string[]
/**
 * @maxItems 100
 */
export type Missing = MissionConversationMissingContextWire[]
export type Status = 'needs_information' | 'needs_configuration' | 'ready_for_brief_confirmation' | 'ready_for_plan'
export type Reply = string
export type Retrievaltraceid = string
export type Schemaversion1 = 1
export type Contenthash1 = string
export type Displaymode = 'named' | 'generic' | 'hidden'
export type Id = string
export type Kind1 = 'strategy_card' | 'strategy_chunk' | 'knowledge_source' | 'knowledge_chunk' | 'mission_memory'
export type Ref = string
export type Title1 = string
export type Version1 = string
export type Visibility = 'internal_only' | 'client_safe' | 'internal' | 'external' | 'both'
/**
 * @maxItems 100
 */
export type Sources = MissionSourceRefWire[]
/**
 * @maxItems 8
 */
export type Suggestedactions =
  | []
  | [MissionSuggestedActionWire]
  | [MissionSuggestedActionWire, MissionSuggestedActionWire]
  | [MissionSuggestedActionWire, MissionSuggestedActionWire, MissionSuggestedActionWire]
  | [MissionSuggestedActionWire, MissionSuggestedActionWire, MissionSuggestedActionWire, MissionSuggestedActionWire]
  | [
      MissionSuggestedActionWire,
      MissionSuggestedActionWire,
      MissionSuggestedActionWire,
      MissionSuggestedActionWire,
      MissionSuggestedActionWire,
    ]
  | [
      MissionSuggestedActionWire,
      MissionSuggestedActionWire,
      MissionSuggestedActionWire,
      MissionSuggestedActionWire,
      MissionSuggestedActionWire,
      MissionSuggestedActionWire,
    ]
  | [
      MissionSuggestedActionWire,
      MissionSuggestedActionWire,
      MissionSuggestedActionWire,
      MissionSuggestedActionWire,
      MissionSuggestedActionWire,
      MissionSuggestedActionWire,
      MissionSuggestedActionWire,
    ]
  | [
      MissionSuggestedActionWire,
      MissionSuggestedActionWire,
      MissionSuggestedActionWire,
      MissionSuggestedActionWire,
      MissionSuggestedActionWire,
      MissionSuggestedActionWire,
      MissionSuggestedActionWire,
      MissionSuggestedActionWire,
    ]
export type Capabilitykey = string | null
export type Correctionkey1 = string | null
export type Key5 = string
export type Kind2 = 'quick_reply' | 'open_correction' | 'confirm_brief' | 'cancel'
export type Label1 = string
export type Packkey = string | null
export type Inputtokens = number
export type Outputtokens = number
export type Totaltokens = number
export type Contenthash2 = string
export type Key6 = string
export type Protectedstepkeys = string[]
export type Semanticversion = string
export type AllowedSourceIds = string[]
export type AskedQuestionKeys = string[]
export type Definitionhash = string | null
export type Effect = 'none' | 'draft' | 'internal' | 'external' | 'destructive'
export type Key7 = string
export type Version2 = number
export type Capabilities = CapabilityWire[]
export type ClarificationRound = number
export type ClientId1 = string | null
export type ContextSnapshotId = string | null
export type ContractId1 = string | null
export type Observations = {
  [k: string]: unknown
}[]
export type OrganizationId1 = string
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
export type Kind3 = 'clarification'
export type Plan = null
/**
 * @minItems 1
 * @maxItems 3
 */
export type Questions1 =
  | [ClarificationQuestionWire]
  | [ClarificationQuestionWire, ClarificationQuestionWire]
  | [ClarificationQuestionWire, ClarificationQuestionWire, ClarificationQuestionWire]
export type Answertype1 = 'text' | 'number' | 'currency' | 'date' | 'single_choice' | 'multiple_choice' | 'boolean'
export type Defaultsourceid = string | null
export type Defaultvalue1 = unknown | null
export type Key8 = string
export type Label2 = string
export type Priority1 = number
export type Whyneeded1 = string
export type Selectedpacks = SelectedPackWire[]
export type Sourceids = string[]
export type Trace = {
  [k: string]: unknown
} | null
export type Usage = {
  [k: string]: unknown
} | null
export type Kind4 = 'plan'
export type Key9 = string
export type Templatehash = string
export type Version3 = string
export type Assumptions1 = string[]
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
export type Schemaversion2 = 1
/**
 * @minItems 1
 */
export type Steps = [PlanStepWire, ...PlanStepWire[]]
export type Approvalrequired = boolean
export type Capabilitykey1 = string
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
export type Questions2 = []
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
  conversationRequest: MissionConversationTurnRequestWire
  conversationResponse: MissionConversationTurnResponseWire
  request: MissionPlanRequestWire
  response: MissionPlanResponseWire
}
export interface MissionConversationTurnRequestWire {
  allowedActionPacks?: Allowedactionpacks
  allowedCapabilityKeys?: Allowedcapabilitykeys
  audience: Audience
  client_id?: ClientId
  contract_id?: ContractId
  conversation_id: ConversationId
  currentBrief?: Currentbrief
  operationalContext?: Operationalcontext
  organization_id: OrganizationId
  rollingSummary?: Rollingsummary
  schemaVersion: Schemaversion
  transcript?: Transcript
  user_message: UserMessage
}
export interface SelectedPackWire {
  contentHash: Contenthash
  key: Key
  version: Version
}
export interface Currentbrief {
  [k: string]: unknown
}
export interface Operationalcontext {
  [k: string]: unknown
}
export interface MissionConversationTranscriptMessageWire {
  content: Content
  role: Role
}
export interface MissionConversationTurnResponseWire {
  brief: MissionBriefWire
  contextHash: Contexthash
  kind: Kind
  questions?: Questions
  readiness: MissionContextReadinessWire
  reply: Reply
  retrievalTraceId: Retrievaltraceid
  schemaVersion: Schemaversion1
  sources?: Sources
  suggestedActions?: Suggestedactions
  understood?: Understood
  usage: ModelUsageWire
}
export interface MissionBriefWire {
  acceptanceCriteria?: Acceptancecriteria
  constraints?: Constraints
  deadlineAt?: Deadlineat
  maxExternalContacts?: Maxexternalcontacts
  maxHumanHours?: Maxhumanhours
  maxTotalCostBrl?: Maxtotalcostbrl
  mode?: Mode
  objective?: Objective
  packKeys?: Packkeys
  requestedOutcome?: Requestedoutcome
  scopeHints?: Scopehints
  title?: Title
}
export interface Constraints {
  [k: string]: unknown
}
export interface MissionConversationQuestionWire {
  answerType: Answertype
  choices?: Choices
  defaultSourceRef?: Defaultsourceref
  defaultValue?: Defaultvalue
  key: Key1
  label: Label
  priority: Priority
  whyNeeded: Whyneeded
}
export interface MissionContextReadinessWire {
  assumptions?: Assumptions
  knownFacts?: Knownfacts
  missing?: Missing
  status: Status
}
export interface MissionConversationAssumptionWire {
  key: Key2
  sourceRef?: Sourceref
  value: Value
}
export interface Value {
  [k: string]: unknown
}
export interface MissionConversationKnownFactWire {
  key: Key3
  sourceRef: Sourceref1
  value: Value1
}
export interface Value1 {
  [k: string]: unknown
}
export interface MissionConversationMissingContextWire {
  category: Category
  correctionKey?: Correctionkey
  key: Key4
  reason: Reason
  requiredFor?: Requiredfor
}
export interface MissionSourceRefWire {
  contentHash: Contenthash1
  displayMode: Displaymode
  id: Id
  kind: Kind1
  ref: Ref
  title: Title1
  version: Version1
  visibility: Visibility
}
export interface MissionSuggestedActionWire {
  capabilityKey?: Capabilitykey
  correctionKey?: Correctionkey1
  key: Key5
  kind: Kind2
  label: Label1
  packKey?: Packkey
  payload?: Payload
}
export interface Payload {
  [k: string]: unknown
}
export interface Understood {
  [k: string]: unknown
}
export interface ModelUsageWire {
  inputTokens: Inputtokens
  outputTokens: Outputtokens
  totalTokens: Totaltokens
}
export interface MissionPlanRequestWire {
  action_pack: ActionPackWire
  allowed_source_ids?: AllowedSourceIds
  asked_question_keys?: AskedQuestionKeys
  baseline?: Baseline
  capabilities: Capabilities
  clarification_round?: ClarificationRound
  client_id?: ClientId1
  context_snapshot_id?: ContextSnapshotId
  contract_id?: ContractId1
  limits?: Limits
  mission: Mission
  observations?: Observations
  organization_id: OrganizationId1
  pack_catalog?: PackCatalog
  planning_budget?: PlanningBudget
  previous_revision?: PreviousRevision
  proposed_plan?: ProposedPlan
  readiness: Readiness
  strategy_context?: StrategyContext
}
export interface ActionPackWire {
  contentHash: Contenthash2
  key: Key6
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
  key: Key7
  version: Version2
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
  kind: Kind3
  plan?: Plan
  questions: Questions1
  selectedPacks?: Selectedpacks
  sourceIds?: Sourceids
  trace?: Trace
  usage?: Usage
}
export interface Interpretation {
  [k: string]: unknown
}
export interface ClarificationQuestionWire {
  answerType: Answertype1
  defaultSourceId?: Defaultsourceid
  defaultValue?: Defaultvalue1
  key: Key8
  label: Label2
  priority: Priority1
  whyNeeded: Whyneeded1
}
export interface PlanProposalResponseWire {
  interpretation: Interpretation1
  kind: Kind4
  plan: PlanWire
  questions?: Questions2
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
  assumptions?: Assumptions1
  deviations?: Deviations
  estimatedEconomics: EstimatedEconomicsWire
  missionId: Missionid
  rationale: Rationale1
  resolvedParameters?: Resolvedparameters
  risks?: Risks
  schemaVersion: Schemaversion2
  steps: Steps
}
export interface ActionPackReferenceWire {
  key: Key9
  templateHash: Templatehash
  version: Version3
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
  capabilityKey: Capabilitykey1
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
