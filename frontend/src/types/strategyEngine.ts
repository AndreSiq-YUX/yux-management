export type StrategyProfileKey =
  | 'growth_strategist'
  | 'crm_controller'
  | 'ai_sdr_comercial_1'
  | 'ai_closer'
  | 'support_assistant'
  | 'customer_growth_comercial_2'
  | 'revenue_recovery'
  | 'offer_conversion'
  | 'marketing_strategist'
  | 'referral_growth'
  | 'metrics_cash_mroi'
  | 'proposal_delivery'

export type StrategyVisibility = 'internal_only' | 'client_safe'
export type CommercialStageKey =
  | 'anonymous'
  | 'follower'
  | 'lead_cold'
  | 'lead_warm'
  | 'raised_hand'
  | 'qualified_opportunity'
  | 'almost_customer'
  | 'non_customer'
  | 'first_purchase_customer'
  | 'recurring_customer'
  | 'ex_customer'
  | 'referral'
  | 'bad_fit'

export type ObjectionCategoryKey =
  | 'price'
  | 'timing'
  | 'trust'
  | 'authority'
  | 'urgency'
  | 'product_fit'
  | 'competitor'
  | 'implementation_effort'
  | 'unclear_value'
  | 'no_response'

export interface StrategyAgentProfile {
  id: string
  profileKey: StrategyProfileKey | string
  name: string
  description?: string
  purpose?: string
  allowedModules: string[]
  allowedTools: string[]
  forbiddenActions: string[]
  requiresHumanApprovalFor: string[]
  maxContextChars: number
  maxCards: number
  maxChunks: number
  status: string
}

export interface StrategyAgentProfileUpdateInput {
  id: string
  status: string
  maxContextChars: number
  maxCards: number
  maxChunks: number
  allowedModules: string[]
  allowedTools: string[]
  forbiddenActions: string[]
  requiresHumanApprovalFor: string[]
}

export interface StrategyModelRoute {
  id: string
  agentType: string
  routingTier: string
  provider: string
  modelName: string
  fallbackModelName?: string
  maxInputTokens: number
  maxOutputTokens: number
  temperature: number
  maxCostPerRun: number
  status: string
}

export interface StrategyLlmProvider {
  id: string
  provider_key?: string
  providerKey?: string
  provider_type?: string
  status: string
  is_default?: boolean
  isDefault?: boolean
}

export interface StrategyModelRouteInput {
  id?: string
  agentType: string
  routingTier: string
  provider: string
  modelName: string
  fallbackModelName?: string
  maxInputTokens?: number
  maxOutputTokens?: number
  temperature?: number
  maxCostPerRun?: number
  status?: string
}

export interface StrategyConversationAssistantInput {
  id?: string
  organizationId: string
  clientId?: string
  contractId?: string
  name: string
  tone: string
  status: string
  assistantRole: string
  strategyProfileId?: string
  routingPriority: number
  routingMetadata?: Record<string, unknown>
  summaryEnabled?: boolean
  classificationEnabled?: boolean
}

export interface StrategyAssistantRoutingRuleInput {
  id?: string
  assistantId: string
  channel?: string
  requiredRole?: string
  stageKeys?: string[]
  intentKeys?: string[]
  keywordPatterns?: string[]
  defaultRule?: boolean
  scoreWeight?: number
  lockRoleMinutes?: number
  status?: string
  config?: Record<string, unknown>
}

export interface StrategyAssistantRoutingRule {
  id: string
  assistant_id: string
  channel?: string
  required_role?: string
  stage_keys?: string[]
  intent_keys?: string[]
  keyword_patterns?: string[]
  default_rule?: boolean
  score_weight?: number
  lock_role_minutes?: number
  status?: string
  config?: Record<string, unknown>
}

export interface StrategyConversationAssistant {
  id: string
  organizationId: string
  clientId?: string
  contractId?: string
  name: string
  tone: string
  status: string
  assistantRole?: string
  strategyProfileId?: string
  routingPriority: number
  routingMetadata: Record<string, unknown>
  summaryEnabled: boolean
  classificationEnabled: boolean
  rules: StrategyAssistantRoutingRule[]
}

export interface StrategyOrganization {
  id: string
  name: string
  slug?: string
  kind?: string
  clientId?: string
  isInternalGrowthWorkspace?: boolean
  workspacePurpose?: string
  strategyPackScope?: string
}

export interface StrategyKnowledgeStats {
  documents: number
  chunks: number
  assets: number
  cards: number
  retrievals: number
}

export interface AgentExecutionRun {
  id: string
  organizationId?: string
  clientId?: string
  conversationId?: string
  runSource: string
  profileKey: string
  agentRole?: string
  workflowKey?: string
  autonomyMode: string
  status: string
  riskLevel: string
  confidence: number
  modelProvider?: string
  modelName?: string
  inputTokens: number
  outputTokens: number
  estimatedCost: number
  decisionSummary: string
  createdAt: string
  startedAt?: string
  completedAt?: string
}

export interface AgentExecutionStep {
  id: string
  runId: string
  stepKey: string
  stepType: string
  status: string
  attemptNumber: number
  modelName?: string
  promptHash?: string
  contextHash?: string
  latencyMs: number
  estimatedCost: number
  warnings: string[]
  createdAt: string
}

export interface AgentAutonomyPolicy {
  id: string
  organizationId?: string
  clientId?: string
  assistantId?: string
  profileKey?: string
  channel?: string
  intentKey?: string
  stageKey?: string
  actionKey?: string
  autonomyMode: string
  riskLevel: string
  confidenceThreshold: number
  status: string
  config: Record<string, unknown>
  createdAt: string
}

export interface StrategyWorkflowSpec {
  id: string
  workflowKey: string
  name: string
  description: string
  profileKey: string
  workflowType: string
  maxSubagents: number
  maxRetriesPerNode: number
  maxCostPerRun: number
  status: string
  version: number
}

export interface AgentLearningSignal {
  id: string
  runId?: string
  organizationId?: string
  profileKey: string
  signalType: string
  targetType: string
  targetId?: string
  signalScore: number
  confidence: number
  createdAt: string
}

export interface AgentImprovementRecommendation {
  id: string
  organizationId?: string
  profileKey: string
  recommendationType: string
  title: string
  rationale: string
  targetType?: string
  targetId?: string
  status: string
  riskLevel: string
  createdAt: string
}

export interface AgentShadowExperiment {
  id: string
  recommendationId?: string
  organizationId?: string
  experimentKey: string
  baselineVersion: string
  candidateVersion: string
  status: string
  sampleSize: number
  successMetric: string
  baselineScore?: number
  candidateScore?: number
  resultSummary: string
  createdAt: string
}

export interface StrategySourceDocument {
  id: string
  source_title?: string
  sourceTitle?: string
  document_type?: string
  human_review_status?: string
}

export interface StrategyRetrievalQuery {
  id: string
  profile_key?: string
  query?: string
}

export interface StrategyAgentBinding {
  id: string
  binding_type?: string
  marketing_agent_type?: string
  workflow_key?: string
  ai_assistant_id?: string
  profile_id?: string
}

export interface StrategyPack {
  id: string
  packKey: string
  name: string
  description: string
  scope: string
  visibility: StrategyVisibility | string
  sourceKind: string
  sourceTitle: string
  status: string
  version: number
  targetProfileKeys: string[]
  targetModules: string[]
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface StrategyPackInput {
  id?: string
  packKey: string
  name: string
  description?: string
  scope?: string
  visibility?: StrategyVisibility | string
  sourceKind?: string
  sourceTitle?: string
  status?: string
  version?: number
  targetProfileKeys?: string[]
  targetModules?: string[]
  metadata?: Record<string, unknown>
}

export interface StrategyPackItem {
  id: string
  packId: string
  itemType: string
  title: string
  summary: string
  body: string
  profileKeys: string[]
  stageTags: string[]
  retrievalTags: string[]
  sourceReference?: string
  status: string
  priority: number
  payload: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface StrategyPackItemInput {
  id?: string
  packId: string
  itemType: string
  title: string
  summary?: string
  body?: string
  profileKeys?: string[]
  stageTags?: string[]
  retrievalTags?: string[]
  sourceReference?: string
  status?: string
  priority?: number
  payload?: Record<string, unknown>
}

export interface StrategyPackBinding {
  id: string
  packId: string
  organizationId?: string
  profileKey?: string
  moduleKey?: string
  channel?: string
  workflowKey?: string
  status: string
  priority: number
  config: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface StrategyPackBindingInput {
  id?: string
  packId: string
  organizationId?: string
  profileKey?: string
  moduleKey?: string
  channel?: string
  workflowKey?: string
  status?: string
  priority?: number
  config?: Record<string, unknown>
}

export interface StrategyIngestionJob {
  id: string
  packId?: string
  documentId?: string
  sourceName: string
  sourceKind: string
  fileName?: string
  status: string
  currentStep: string
  proposedCounts: Record<string, unknown>
  errorMessage?: string
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface StrategyIngestionJobInput {
  packId?: string
  documentId?: string
  sourceName: string
  sourceKind?: string
  fileName?: string
  status?: string
  currentStep?: string
  proposedCounts?: Record<string, unknown>
  metadata?: Record<string, unknown>
}

export type StrategyAdminChatMode =
  | 'general'
  | 'initial_analysis'
  | 'diagnostic_48h'
  | 'service_plan'
  | 'proposal'
  | 'roadmap_30_60_90'
  | 'do_not_do'

export interface StrategyChatSession {
  id: string
  actorUserId?: string
  organizationId?: string
  clientId?: string
  contractId?: string
  profileKey: string
  title: string
  mode: StrategyAdminChatMode
  status: string
  contextSnapshot: Record<string, unknown>
  lastMessageAt: string
  createdAt: string
  updatedAt?: string
}

export interface StrategyChatMessage {
  id: string
  sessionId: string
  role: 'user' | 'assistant' | 'system'
  content: string
  status: string
  modelProvider?: string
  modelName?: string
  routingRuleId?: string
  inputTokens: number
  outputTokens: number
  safeContext: Record<string, unknown>
  toolResults: Array<Record<string, unknown>>
  errorMessage?: string
  createdAt: string
}

export interface StrategyAdminChatRequest {
  sessionId?: string
  message: string
  mode: StrategyAdminChatMode
  organizationId?: string
  clientId?: string
  contractId?: string
}

export interface StrategyAdminChatResponse {
  session: StrategyChatSession
  userMessage: StrategyChatMessage
  assistantMessage: StrategyChatMessage
  route?: {
    provider?: string
    modelName?: string
    routingRuleId?: string
  }
}

export interface StrategySkill {
  id: string
  skillKey: string
  name: string
  description?: string
  globalRules: string[]
  decisionRules: string[]
  visibility: StrategyVisibility
  status: string
}

export interface StrategyConceptCard {
  id: string
  concept: string
  category: string
  visibility: StrategyVisibility
  problemSolved?: string
  triggerSignals: string[]
  diagnosisQuestions: string[]
  decisionRules: string[]
  antiPatterns: string[]
  recommendedActions: string[]
  allowedAgentProfileKeys: string[]
  stageTags: string[]
  retrievalTags: string[]
  yuxModules: string[]
  humanReviewStatus: string
}

export interface StrategyRecommendationInput {
  organizationId?: string
  clientId?: string
  profileKey: StrategyProfileKey | string
  objective: string
  audience: string
  stage: CommercialStageKey | string
  action: string
  channel: string
  owner: string
  metric: string
  nextStep: string
  confidence: number
  requiresApproval: boolean
  supportingCards: string[]
}

export interface StrategyHandoffInput {
  organizationId?: string
  clientId?: string
  sourceProfileKey: StrategyProfileKey | string
  targetProfileKey: StrategyProfileKey | string
  reason: string
  requestedOutput?: string
  relatedModule?: string
  relatedRecordId?: string
  urgency?: 'low' | 'normal' | 'high' | 'critical'
  contextSummary?: string
  allowedTools?: string[]
}

export interface StrategyOutcomeInput {
  organizationId?: string
  clientId?: string
  eventType: string
  recommendationId?: string
  handoffId?: string
  leadId?: string
  conversationId?: string
  proposalId?: string
  campaignId?: string
  contentItemId?: string
  outcomeScore?: number
  metadata?: Record<string, unknown>
}

export interface CashPriorityMetric {
  stuckOpportunityValue?: number
  recoverableValue?: number
  mroi?: number | null
  cac?: number | null
}

export interface CrmControllerLeadLike {
  id: string
  commercialStage?: CommercialStageKey | string
  customerLifecycleStage?: string
  temperature?: string
  urgency?: 'high' | 'medium' | 'low' | string
  nextFollowUpAt?: string
  lastActivityAt?: string
  lastConversationAt?: string
  lastMeaningfulTouchAt?: string
  mainObjection?: string
  objections?: string[]
  status?: string
  fitStatus?: 'good_fit' | 'unclear' | 'bad_fit' | string
  value?: number
}
