import { supabase } from '@/lib/supabase'
import { sanitizeMarketingContentForPortal } from '@/lib/marketing-studio/marketingStudioRules'
import type {
  AgentBudgetPolicy,
  MarketingAgent,
  MarketingAgentGlobalPrompt,
  MarketingAgentTemplate,
  MarketingAgentToolPolicy,
  MarketingAgentRun,
  MarketingApprovalPolicy,
  MarketingBrandProfile,
  MarketingCalendarItem,
  MarketingContentGenerationRun,
  MarketingChannel,
  MarketingContentItem,
  MarketingContentQualityCheck,
  MarketingContentReview,
  MarketingContentVersion,
  MarketingIdea,
  MarketingKnowledgeChunk,
  MarketingKnowledgeDocument,
  MarketingKnowledgeMatch,
  MarketingProductService,
  MarketingRadarRun,
  MarketingResearchCacheEntry,
  MarketingReviewStatus,
  MarketingSource,
  MarketingSourceItem,
  MarketingStudioSettings,
  MarketingToolRun,
  MarketingUsageLedgerEntry,
  MarketingWorkflow,
  MarketingWorkflowEdge,
  MarketingWorkflowNode,
  MarketingWorkflowRun,
  ModelRoutingRule,
  PortalMarketingContentItem,
} from '@/types/marketingStudio'

const defaultApprovalPolicy: MarketingApprovalPolicy = {
  publishSocial: true,
  publishWordPress: true,
  paidCampaignDraft: true,
  premiumImage: true,
  regulatedContent: true,
}

export function mapMarketingSettings(row: any): MarketingStudioSettings {
  return {
    id: row.id,
    organizationId: row.organization_id,
    clientId: row.client_id,
    contractId: row.contract_id,
    operationMode: row.operation_mode,
    monthlyCreditLimit: Number(row.monthly_credit_limit || 0),
    currentCreditBalance: Number(row.current_credit_balance || 0),
    approvalPolicy: { ...defaultApprovalPolicy, ...(row.approval_policy || {}) },
    allowedChannels: (row.allowed_channels || []) as MarketingChannel[],
    toneOfVoice: row.tone_of_voice || undefined,
    persona: row.persona || undefined,
    visualPreferences: row.visual_preferences || undefined,
    forbiddenTopics: row.forbidden_topics || [],
    priorityTopics: row.priority_topics || [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function mapMarketingContent(row: any): MarketingContentItem {
  return {
    id: row.id,
    organizationId: row.organization_id,
    clientId: row.client_id,
    contractId: row.contract_id,
    title: row.title,
    contentType: row.content_type,
    channel: row.channel,
    status: row.status,
    brief: row.brief || undefined,
    body: row.body || undefined,
    cta: row.cta || undefined,
    campaignId: row.campaign_id || undefined,
    landingPageId: row.landing_page_id || undefined,
    sourceIdeaId: row.source_idea_id || undefined,
    createdByAgentId: row.created_by_agent_id || undefined,
    approvedBy: row.approved_by || undefined,
    scheduledAt: row.scheduled_at || undefined,
    publishedAt: row.published_at || undefined,
    publishedUrl: row.published_url || undefined,
    internalNotes: row.internal_notes || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function mapMarketingContentVersion(row: any): MarketingContentVersion {
  return {
    id: row.id,
    contentItemId: row.content_item_id,
    versionNumber: Number(row.version_number || 0),
    title: row.title,
    body: row.body || undefined,
    changeSummary: row.change_summary || undefined,
    createdBy: row.created_by || undefined,
    createdByAgentId: row.created_by_agent_id || undefined,
    createdAt: row.created_at,
  }
}

export function mapMarketingContentReview(row: any): MarketingContentReview {
  return {
    id: row.id,
    contentItemId: row.content_item_id,
    reviewerId: row.reviewer_id || undefined,
    status: row.status,
    qualityScore: row.quality_score == null ? undefined : Number(row.quality_score),
    comments: row.comments || undefined,
    checklist: row.checklist || {},
    decidedAt: row.decided_at || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function mapMarketingCalendarItem(row: any): MarketingCalendarItem {
  return {
    id: row.id,
    organizationId: row.organization_id,
    clientId: row.client_id,
    contractId: row.contract_id,
    contentItemId: row.content_item_id || undefined,
    title: row.title,
    channel: row.channel,
    status: row.status,
    startsAt: row.starts_at,
    endsAt: row.ends_at || undefined,
    responsibleUserId: row.responsible_user_id || undefined,
    metadata: row.metadata || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function mapMarketingBrandProfile(row: any): MarketingBrandProfile {
  return {
    id: row.id,
    organizationId: row.organization_id,
    clientId: row.client_id,
    contractId: row.contract_id,
    toneOfVoice: row.tone_of_voice || '',
    persona: row.persona || '',
    brandVoiceSummary: row.brand_voice_summary || '',
    vocabularyDo: row.vocabulary_do || [],
    vocabularyDont: row.vocabulary_dont || [],
    forbiddenTopics: row.forbidden_topics || [],
    priorityTopics: row.priority_topics || [],
    visualGuidelines: row.visual_guidelines || undefined,
    complianceNotes: row.compliance_notes || undefined,
    status: row.status || 'draft',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function mapMarketingProductService(row: any): MarketingProductService {
  return {
    id: row.id,
    organizationId: row.organization_id,
    clientId: row.client_id,
    contractId: row.contract_id,
    name: row.name,
    category: row.category || undefined,
    description: row.description || '',
    valueProposition: row.value_proposition || undefined,
    targetAudience: row.target_audience || undefined,
    proofPoints: row.proof_points || [],
    objections: row.objections || [],
    cta: row.cta || undefined,
    status: row.status || 'active',
    metadata: row.metadata || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function mapMarketingKnowledgeDocument(row: any): MarketingKnowledgeDocument {
  return {
    id: row.id,
    organizationId: row.organization_id,
    clientId: row.client_id,
    contractId: row.contract_id,
    sourceId: row.source_id || undefined,
    title: row.title,
    documentType: row.document_type,
    status: row.status,
    storagePath: row.storage_path || undefined,
    sourceUrl: row.source_url || undefined,
    summary: row.summary || undefined,
    metadata: row.metadata || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function mapMarketingKnowledgeChunk(row: any): MarketingKnowledgeChunk {
  return {
    id: row.id,
    organizationId: row.organization_id,
    clientId: row.client_id,
    contractId: row.contract_id,
    documentId: row.document_id || undefined,
    entryId: row.entry_id || undefined,
    chunkIndex: Number(row.chunk_index || 0),
    title: row.title || undefined,
    body: row.body,
    tokenCount: Number(row.token_count || 0),
    embeddingModel: row.embedding_model || undefined,
    metadata: row.metadata || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function mapMarketingKnowledgeMatch(row: any): MarketingKnowledgeMatch {
  return {
    chunkId: row.chunk_id,
    documentId: row.document_id || undefined,
    title: row.title || undefined,
    body: row.body,
    rank: Number(row.rank || 0),
  }
}

export function mapMarketingSource(row: any): MarketingSource {
  return {
    id: row.id,
    organizationId: row.organization_id,
    clientId: row.client_id,
    contractId: row.contract_id,
    sourceType: row.source_type,
    name: row.name,
    sourceUrl: row.source_url || undefined,
    status: row.status || 'active',
    lastReadAt: row.last_read_at || undefined,
    metadata: row.metadata || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function mapMarketingIdea(row: any): MarketingIdea {
  return {
    id: row.id,
    organizationId: row.organization_id,
    clientId: row.client_id,
    contractId: row.contract_id,
    title: row.title,
    summary: row.summary || '',
    status: row.status || 'captured',
    sourceType: row.source_type || 'manual',
    sourceUrl: row.source_url || undefined,
    sourceReferenceId: row.source_reference_id || undefined,
    sourceItemId: row.source_item_id || undefined,
    radarRunId: row.radar_run_id || undefined,
    priority: row.priority || 'medium',
    opportunityScore: Number(row.opportunity_score || 0),
    suggestedChannel: row.suggested_channel || undefined,
    rejectionReason: row.rejection_reason || undefined,
    curationNotes: row.curation_notes || undefined,
    nextAction: row.next_action || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function mapMarketingSourceItem(row: any): MarketingSourceItem {
  return {
    id: row.id,
    organizationId: row.organization_id,
    clientId: row.client_id,
    contractId: row.contract_id,
    sourceId: row.source_id || undefined,
    radarRunId: row.radar_run_id || undefined,
    itemType: row.item_type,
    title: row.title,
    sourceUrl: row.source_url || undefined,
    normalizedUrl: row.normalized_url || undefined,
    author: row.author || undefined,
    publishedAt: row.published_at || undefined,
    summary: row.summary || '',
    rawExcerpt: row.raw_excerpt || undefined,
    language: row.language || 'pt',
    contentHash: row.content_hash,
    dedupeKey: row.dedupe_key,
    relevanceScore: Number(row.relevance_score || 0),
    noveltyScore: Number(row.novelty_score || 0),
    commercialScore: Number(row.commercial_score || 0),
    status: row.status || 'captured',
    metadata: row.metadata || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function mapMarketingResearchCacheEntry(row: any): MarketingResearchCacheEntry {
  return {
    id: row.id,
    organizationId: row.organization_id,
    clientId: row.client_id,
    contractId: row.contract_id,
    provider: row.provider,
    requestType: row.request_type,
    requestKey: row.request_key,
    requestPayload: row.request_payload || {},
    responseSummary: row.response_summary || '',
    responsePayload: row.response_payload || {},
    rawCostEstimate: Number(row.raw_cost_estimate || 0),
    creditsCharged: Number(row.credits_charged || 0),
    expiresAt: row.expires_at || undefined,
    createdAt: row.created_at,
  }
}

export function mapMarketingRadarRun(row: any): MarketingRadarRun {
  return {
    id: row.id,
    organizationId: row.organization_id,
    clientId: row.client_id,
    contractId: row.contract_id,
    workflowRunId: row.workflow_run_id || undefined,
    agentId: row.agent_id || undefined,
    status: row.status || 'queued',
    periodStart: row.period_start || undefined,
    periodEnd: row.period_end || undefined,
    query: row.query || undefined,
    sourceCount: Number(row.source_count || 0),
    itemCount: Number(row.item_count || 0),
    ideaCount: Number(row.idea_count || 0),
    rejectedCount: Number(row.rejected_count || 0),
    summary: row.summary || '',
    errorMessage: row.error_message || undefined,
    metadata: row.metadata || {},
    startedAt: row.started_at || undefined,
    completedAt: row.completed_at || undefined,
    createdBy: row.created_by || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function mapMarketingContentGenerationRun(row: any): MarketingContentGenerationRun {
  return {
    id: row.id,
    organizationId: row.organization_id,
    clientId: row.client_id,
    contractId: row.contract_id,
    workflowRunId: row.workflow_run_id || undefined,
    writerAgentRunId: row.writer_agent_run_id || undefined,
    reviewerAgentRunId: row.reviewer_agent_run_id || undefined,
    sourceIdeaId: row.source_idea_id || undefined,
    contentItemId: row.content_item_id || undefined,
    contentVersionId: row.content_version_id || undefined,
    status: row.status || 'queued',
    contentType: row.content_type,
    channel: row.channel,
    briefSnapshot: row.brief_snapshot || '',
    contextSummary: row.context_summary || '',
    promptSnapshot: row.prompt_snapshot || undefined,
    outputTitle: row.output_title || undefined,
    outputBody: row.output_body || undefined,
    outputCta: row.output_cta || undefined,
    variationCount: Number(row.variation_count || 0),
    qualityScore: row.quality_score == null ? undefined : Number(row.quality_score),
    requiresGrounding: Boolean(row.requires_grounding),
    groundingStatus: row.grounding_status || 'not_required',
    checklist: row.checklist || {},
    errorMessage: row.error_message || undefined,
    createdBy: row.created_by || undefined,
    startedAt: row.started_at || undefined,
    completedAt: row.completed_at || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function mapMarketingContentQualityCheck(row: any): MarketingContentQualityCheck {
  return {
    id: row.id,
    organizationId: row.organization_id,
    clientId: row.client_id,
    contractId: row.contract_id,
    contentItemId: row.content_item_id,
    generationRunId: row.generation_run_id || undefined,
    reviewerAgentRunId: row.reviewer_agent_run_id || undefined,
    groundingToolRunId: row.grounding_tool_run_id || undefined,
    status: row.status || 'pending',
    qualityScore: Number(row.quality_score || 0),
    checklist: row.checklist || {},
    riskFlags: row.risk_flags || [],
    groundingRequired: Boolean(row.grounding_required),
    groundingSummary: row.grounding_summary || undefined,
    comments: row.comments || undefined,
    createdBy: row.created_by || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function mapMarketingAgentTemplate(row: any): MarketingAgentTemplate {
  return {
    id: row.id,
    agentType: row.agent_type,
    name: row.name,
    description: row.description || '',
    defaultTools: row.default_tools || [],
    requiresHumanApproval: Boolean(row.requires_human_approval),
    defaultModel: row.default_model || undefined,
    fallbackModel: row.fallback_model || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function mapMarketingAgent(row: any): MarketingAgent {
  return {
    id: row.id,
    organizationId: row.organization_id,
    clientId: row.client_id || undefined,
    contractId: row.contract_id || undefined,
    name: row.name,
    agentType: row.agent_type,
    description: row.description || '',
    status: row.status || 'active',
    defaultModel: row.default_model || undefined,
    fallbackModel: row.fallback_model || undefined,
    allowedTools: row.allowed_tools || [],
    requiresHumanApproval: Boolean(row.requires_human_approval),
    maxCostPerRun: row.max_cost_per_run == null ? undefined : Number(row.max_cost_per_run),
    maxRunsPerDay: row.max_runs_per_day == null ? undefined : Number(row.max_runs_per_day),
    basePrompt: row.base_prompt || undefined,
    promptConfig: row.prompt_config || {},
    contextPolicy: row.context_policy || {},
    qualityGates: row.quality_gates || {},
    modelParameters: row.model_parameters || {},
    promptVersion: Number(row.prompt_version || 1),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function mapMarketingAgentGlobalPrompt(row: any): MarketingAgentGlobalPrompt {
  return {
    id: row.id,
    templateId: row.template_id,
    agentType: row.agent_type,
    systemPrompt: row.system_prompt,
    promptVersion: Number(row.prompt_version || 1),
    defaultContextPolicy: row.default_context_policy || {},
    defaultModelPolicy: row.default_model_policy || {},
    defaultQualityGates: row.default_quality_gates || {},
    status: row.status || 'active',
    updatedBy: row.updated_by || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function mapMarketingWorkflow(row: any): MarketingWorkflow {
  return {
    id: row.id,
    organizationId: row.organization_id,
    clientId: row.client_id,
    contractId: row.contract_id,
    workflowKey: row.workflow_key,
    name: row.name,
    description: row.description || '',
    status: row.status || 'draft',
    triggerType: row.trigger_type || 'manual',
    config: row.config || {},
    createdBy: row.created_by || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function mapMarketingWorkflowNode(row: any): MarketingWorkflowNode {
  return {
    id: row.id,
    workflowId: row.workflow_id,
    nodeKey: row.node_key,
    nodeType: row.node_type,
    agentId: row.agent_id || undefined,
    toolKey: row.tool_key || undefined,
    name: row.name,
    positionX: Number(row.position_x || 0),
    positionY: Number(row.position_y || 0),
    config: row.config || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function mapMarketingWorkflowEdge(row: any): MarketingWorkflowEdge {
  return {
    id: row.id,
    workflowId: row.workflow_id,
    sourceNodeId: row.source_node_id,
    targetNodeId: row.target_node_id,
    conditionKey: row.condition_key || '',
    config: row.config || {},
    createdAt: row.created_at,
  }
}

export function mapMarketingWorkflowRun(row: any): MarketingWorkflowRun {
  return {
    id: row.id,
    organizationId: row.organization_id,
    clientId: row.client_id,
    contractId: row.contract_id,
    workflowId: row.workflow_id || undefined,
    status: row.status || 'queued',
    runType: row.run_type || 'manual',
    inputPayload: row.input_payload || {},
    contextSnapshot: row.context_snapshot || {},
    resultPayload: row.result_payload || {},
    creditDebit: Number(row.credit_debit || 0),
    rawCostEstimate: Number(row.raw_cost_estimate || 0),
    errorMessage: row.error_message || undefined,
    requestedBy: row.requested_by || undefined,
    startedAt: row.started_at || undefined,
    completedAt: row.completed_at || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function mapMarketingAgentRun(row: any): MarketingAgentRun {
  return {
    id: row.id,
    workflowRunId: row.workflow_run_id,
    workflowNodeId: row.workflow_node_id || undefined,
    agentId: row.agent_id || undefined,
    templateId: row.template_id || undefined,
    globalPromptId: row.global_prompt_id || undefined,
    agentType: row.agent_type,
    status: row.status || 'queued',
    agentPromptSnapshot: row.agent_prompt_snapshot || undefined,
    promptConfigSnapshot: row.prompt_config_snapshot || {},
    contextSummary: row.context_summary || undefined,
    compiledPromptHash: row.compiled_prompt_hash || undefined,
    modelProvider: row.model_provider || undefined,
    modelName: row.model_name || undefined,
    fallbackModelName: row.fallback_model_name || undefined,
    inputPayload: row.input_payload || {},
    outputPayload: row.output_payload || {},
    qualityScore: row.quality_score == null ? undefined : Number(row.quality_score),
    inputTokens: Number(row.input_tokens || 0),
    outputTokens: Number(row.output_tokens || 0),
    rawCostEstimate: Number(row.raw_cost_estimate || 0),
    creditsCharged: Number(row.credits_charged || 0),
    errorMessage: row.error_message || undefined,
    startedAt: row.started_at || undefined,
    completedAt: row.completed_at || undefined,
    createdAt: row.created_at,
  }
}

export function mapMarketingToolRun(row: any): MarketingToolRun {
  return {
    id: row.id,
    workflowRunId: row.workflow_run_id,
    agentRunId: row.agent_run_id || undefined,
    toolKey: row.tool_key,
    status: row.status || 'queued',
    inputPayload: row.input_payload || {},
    outputPayload: row.output_payload || {},
    rawCostEstimate: Number(row.raw_cost_estimate || 0),
    creditsCharged: Number(row.credits_charged || 0),
    errorMessage: row.error_message || undefined,
    startedAt: row.started_at || undefined,
    completedAt: row.completed_at || undefined,
    createdAt: row.created_at,
  }
}

export function mapAgentBudgetPolicy(row: any): AgentBudgetPolicy {
  return {
    id: row.id,
    organizationId: row.organization_id,
    clientId: row.client_id,
    contractId: row.contract_id,
    agentId: row.agent_id || undefined,
    agentType: row.agent_type || undefined,
    maxCostPerRun: Number(row.max_cost_per_run || 0),
    maxCreditsPerRun: Number(row.max_credits_per_run || 0),
    maxRunsPerDay: Number(row.max_runs_per_day || 0),
    monthlyCreditLimit: Number(row.monthly_credit_limit || 0),
    requireApprovalOverCredits: Number(row.require_approval_over_credits || 0),
    status: row.status || 'active',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function mapModelRoutingRule(row: any): ModelRoutingRule {
  return {
    id: row.id,
    organizationId: row.organization_id || undefined,
    clientId: row.client_id || undefined,
    contractId: row.contract_id || undefined,
    agentId: row.agent_id || undefined,
    agentType: row.agent_type || undefined,
    routingTier: row.routing_tier || 'default',
    provider: row.provider,
    modelName: row.model_name,
    fallbackModelName: row.fallback_model_name || undefined,
    maxInputTokens: Number(row.max_input_tokens || 0),
    maxOutputTokens: Number(row.max_output_tokens || 0),
    temperature: Number(row.temperature || 0),
    maxCostPerRun: Number(row.max_cost_per_run || 0),
    status: row.status || 'active',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function mapMarketingAgentToolPolicy(row: any): MarketingAgentToolPolicy {
  return {
    id: row.id,
    organizationId: row.organization_id,
    clientId: row.client_id,
    contractId: row.contract_id,
    agentId: row.agent_id || undefined,
    agentType: row.agent_type || undefined,
    toolKey: row.tool_key,
    enabled: Boolean(row.enabled),
    requiresHumanApproval: Boolean(row.requires_human_approval),
    maxCallsPerRun: Number(row.max_calls_per_run || 0),
    config: row.config || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function buildIdeaInsertPayload(input: {
  organizationId: string
  clientId: string
  contractId: string
  title: string
  summary: string
  sourceType: MarketingIdea['sourceType']
  priority?: MarketingIdea['priority']
  opportunityScore?: number
  sourceUrl?: string
  sourceReferenceId?: string
  sourceItemId?: string
  radarRunId?: string
  suggestedChannel?: MarketingIdea['suggestedChannel']
  curationNotes?: string
  nextAction?: string
}) {
  return {
    organization_id: input.organizationId,
    client_id: input.clientId,
    contract_id: input.contractId,
    title: input.title.trim(),
    summary: input.summary.trim(),
    source_type: input.sourceType,
    priority: input.priority || 'medium',
    opportunity_score: input.opportunityScore || 0,
    source_url: input.sourceUrl || null,
    source_reference_id: input.sourceReferenceId || null,
    source_item_id: input.sourceItemId || null,
    radar_run_id: input.radarRunId || null,
    suggested_channel: input.suggestedChannel || null,
    curation_notes: input.curationNotes?.trim() || null,
    next_action: input.nextAction?.trim() || null,
  }
}

export function buildContentInsertPayload(input: {
  organizationId: string
  clientId: string
  contractId: string
  title: string
  contentType: MarketingContentItem['contentType']
  channel: MarketingContentItem['channel']
  brief?: string
  body?: string
  cta?: string
  campaignId?: string
  landingPageId?: string
  sourceIdeaId?: string
}) {
  return {
    organization_id: input.organizationId,
    client_id: input.clientId,
    contract_id: input.contractId,
    title: input.title.trim(),
    content_type: input.contentType,
    channel: input.channel,
    brief: input.brief?.trim() || null,
    body: input.body?.trim() || null,
    cta: input.cta?.trim() || null,
    campaign_id: input.campaignId || null,
    landing_page_id: input.landingPageId || null,
    source_idea_id: input.sourceIdeaId || null,
  }
}

export function buildContentVersionPayload(input: {
  contentItemId: string
  versionNumber: number
  title: string
  body?: string
  changeSummary?: string
  createdBy?: string
  createdByAgentId?: string
}) {
  return {
    content_item_id: input.contentItemId,
    version_number: input.versionNumber,
    title: input.title.trim(),
    body: input.body?.trim() || null,
    change_summary: input.changeSummary?.trim() || null,
    created_by: input.createdBy || null,
    created_by_agent_id: input.createdByAgentId || null,
  }
}

export function buildContentReviewPayload(input: {
  contentItemId: string
  reviewerId?: string
  status?: MarketingReviewStatus
  qualityScore?: number
  comments?: string
  checklist?: Record<string, unknown>
  decidedAt?: string
}) {
  return {
    content_item_id: input.contentItemId,
    reviewer_id: input.reviewerId || null,
    status: input.status || 'pending',
    quality_score: input.qualityScore ?? null,
    comments: input.comments?.trim() || null,
    checklist: input.checklist || {},
    decided_at: input.decidedAt || null,
  }
}

export function buildCalendarItemPayload(input: {
  organizationId: string
  clientId: string
  contractId: string
  title: string
  channel: MarketingCalendarItem['channel']
  startsAt: string
  contentItemId?: string
  endsAt?: string
  responsibleUserId?: string
  status?: MarketingCalendarItem['status']
  metadata?: Record<string, unknown>
}) {
  return {
    organization_id: input.organizationId,
    client_id: input.clientId,
    contract_id: input.contractId,
    content_item_id: input.contentItemId || null,
    title: input.title.trim(),
    channel: input.channel,
    status: input.status || 'planned',
    starts_at: input.startsAt,
    ends_at: input.endsAt || null,
    responsible_user_id: input.responsibleUserId || null,
    metadata: input.metadata || {},
  }
}

export function buildUsageLedgerPayload(input: {
  organizationId: string
  clientId: string
  contractId: string
  action: MarketingUsageLedgerEntry['action']
  creditsCharged: number
  userId?: string
  agentId?: string
  workflowRunId?: string
  provider?: string
  model?: string
  inputTokens?: number
  outputTokens?: number
  rawCostEstimate?: number
}) {
  return {
    organization_id: input.organizationId,
    client_id: input.clientId,
    contract_id: input.contractId,
    user_id: input.userId || null,
    agent_id: input.agentId || null,
    workflow_run_id: input.workflowRunId || null,
    action: input.action,
    provider: input.provider || null,
    model: input.model || null,
    input_tokens: input.inputTokens || 0,
    output_tokens: input.outputTokens || 0,
    raw_cost_estimate: input.rawCostEstimate || 0,
    credits_charged: input.creditsCharged,
    status: 'pending',
  }
}

export function buildBrandProfilePayload(input: {
  organizationId: string
  clientId: string
  contractId: string
  toneOfVoice: string
  persona: string
  brandVoiceSummary: string
  vocabularyDo?: string[]
  vocabularyDont?: string[]
  forbiddenTopics?: string[]
  priorityTopics?: string[]
  visualGuidelines?: string
  complianceNotes?: string
  status?: MarketingBrandProfile['status']
}) {
  return {
    organization_id: input.organizationId,
    client_id: input.clientId,
    contract_id: input.contractId,
    tone_of_voice: input.toneOfVoice.trim(),
    persona: input.persona.trim(),
    brand_voice_summary: input.brandVoiceSummary.trim(),
    vocabulary_do: input.vocabularyDo || [],
    vocabulary_dont: input.vocabularyDont || [],
    forbidden_topics: input.forbiddenTopics || [],
    priority_topics: input.priorityTopics || [],
    visual_guidelines: input.visualGuidelines?.trim() || null,
    compliance_notes: input.complianceNotes?.trim() || null,
    status: input.status || 'draft',
  }
}

export function buildProductServicePayload(input: {
  organizationId: string
  clientId: string
  contractId: string
  name: string
  category?: string
  description?: string
  valueProposition?: string
  targetAudience?: string
  proofPoints?: string[]
  objections?: string[]
  cta?: string
  status?: MarketingProductService['status']
  metadata?: Record<string, unknown>
}) {
  return {
    organization_id: input.organizationId,
    client_id: input.clientId,
    contract_id: input.contractId,
    name: input.name.trim(),
    category: input.category?.trim() || null,
    description: input.description?.trim() || '',
    value_proposition: input.valueProposition?.trim() || null,
    target_audience: input.targetAudience?.trim() || null,
    proof_points: input.proofPoints || [],
    objections: input.objections || [],
    cta: input.cta?.trim() || null,
    status: input.status || 'active',
    metadata: input.metadata || {},
  }
}

export function buildKnowledgeDocumentPayload(input: {
  organizationId: string
  clientId: string
  contractId: string
  title: string
  documentType: MarketingKnowledgeDocument['documentType']
  sourceId?: string
  status?: MarketingKnowledgeDocument['status']
  storagePath?: string
  sourceUrl?: string
  summary?: string
  metadata?: Record<string, unknown>
}) {
  return {
    organization_id: input.organizationId,
    client_id: input.clientId,
    contract_id: input.contractId,
    source_id: input.sourceId || null,
    title: input.title.trim(),
    document_type: input.documentType,
    status: input.status || 'draft',
    storage_path: input.storagePath || null,
    source_url: input.sourceUrl || null,
    summary: input.summary?.trim() || null,
    metadata: input.metadata || {},
  }
}

export function buildKnowledgeChunkPayload(input: {
  organizationId: string
  clientId: string
  contractId: string
  body: string
  chunkIndex?: number
  title?: string
  documentId?: string
  entryId?: string
  tokenCount?: number
  embeddingModel?: string
  metadata?: Record<string, unknown>
}) {
  return {
    organization_id: input.organizationId,
    client_id: input.clientId,
    contract_id: input.contractId,
    document_id: input.documentId || null,
    entry_id: input.entryId || null,
    chunk_index: input.chunkIndex || 0,
    title: input.title?.trim() || null,
    body: input.body.trim(),
    token_count: input.tokenCount || 0,
    embedding_model: input.embeddingModel || null,
    metadata: input.metadata || {},
  }
}

export function buildSourceItemPayload(input: {
  organizationId: string
  clientId: string
  contractId: string
  title: string
  itemType?: MarketingSourceItem['itemType']
  sourceId?: string
  radarRunId?: string
  sourceUrl?: string
  normalizedUrl?: string
  author?: string
  publishedAt?: string
  summary?: string
  rawExcerpt?: string
  language?: string
  contentHash: string
  dedupeKey: string
  relevanceScore?: number
  noveltyScore?: number
  commercialScore?: number
  status?: MarketingSourceItem['status']
  metadata?: Record<string, unknown>
}) {
  return {
    organization_id: input.organizationId,
    client_id: input.clientId,
    contract_id: input.contractId,
    source_id: input.sourceId || null,
    radar_run_id: input.radarRunId || null,
    item_type: input.itemType || 'article',
    title: input.title.trim(),
    source_url: input.sourceUrl || null,
    normalized_url: input.normalizedUrl || null,
    author: input.author?.trim() || null,
    published_at: input.publishedAt || null,
    summary: input.summary?.trim() || '',
    raw_excerpt: input.rawExcerpt?.trim() || null,
    language: input.language || 'pt',
    content_hash: input.contentHash,
    dedupe_key: input.dedupeKey,
    relevance_score: input.relevanceScore || 0,
    novelty_score: input.noveltyScore || 0,
    commercial_score: input.commercialScore || 0,
    status: input.status || 'captured',
    metadata: input.metadata || {},
  }
}

export function buildResearchCachePayload(input: {
  organizationId: string
  clientId: string
  contractId: string
  provider: MarketingResearchCacheEntry['provider']
  requestType: MarketingResearchCacheEntry['requestType']
  requestKey: string
  requestPayload?: Record<string, unknown>
  responseSummary?: string
  responsePayload?: Record<string, unknown>
  rawCostEstimate?: number
  creditsCharged?: number
  expiresAt?: string
}) {
  return {
    organization_id: input.organizationId,
    client_id: input.clientId,
    contract_id: input.contractId,
    provider: input.provider,
    request_type: input.requestType,
    request_key: input.requestKey,
    request_payload: input.requestPayload || {},
    response_summary: input.responseSummary?.trim() || '',
    response_payload: input.responsePayload || {},
    raw_cost_estimate: input.rawCostEstimate || 0,
    credits_charged: input.creditsCharged || 0,
    expires_at: input.expiresAt || null,
  }
}

export function buildRadarRunPayload(input: {
  organizationId: string
  clientId: string
  contractId: string
  workflowRunId?: string
  agentId?: string
  status?: MarketingRadarRun['status']
  periodStart?: string
  periodEnd?: string
  query?: string
  sourceCount?: number
  itemCount?: number
  ideaCount?: number
  rejectedCount?: number
  summary?: string
  metadata?: Record<string, unknown>
  startedAt?: string
  completedAt?: string
  createdBy?: string
}) {
  return {
    organization_id: input.organizationId,
    client_id: input.clientId,
    contract_id: input.contractId,
    workflow_run_id: input.workflowRunId || null,
    agent_id: input.agentId || null,
    status: input.status || 'queued',
    period_start: input.periodStart || null,
    period_end: input.periodEnd || null,
    query: input.query?.trim() || null,
    source_count: input.sourceCount || 0,
    item_count: input.itemCount || 0,
    idea_count: input.ideaCount || 0,
    rejected_count: input.rejectedCount || 0,
    summary: input.summary?.trim() || '',
    metadata: input.metadata || {},
    started_at: input.startedAt || null,
    completed_at: input.completedAt || null,
    created_by: input.createdBy || null,
  }
}

export function buildContentGenerationRunPayload(input: {
  organizationId: string
  clientId: string
  contractId: string
  contentType: MarketingContentGenerationRun['contentType']
  channel: MarketingContentGenerationRun['channel']
  status?: MarketingContentGenerationRun['status']
  workflowRunId?: string
  writerAgentRunId?: string
  reviewerAgentRunId?: string
  sourceIdeaId?: string
  contentItemId?: string
  contentVersionId?: string
  briefSnapshot?: string
  contextSummary?: string
  promptSnapshot?: string
  outputTitle?: string
  outputBody?: string
  outputCta?: string
  variationCount?: number
  qualityScore?: number
  requiresGrounding?: boolean
  groundingStatus?: MarketingContentGenerationRun['groundingStatus']
  checklist?: Record<string, unknown>
  errorMessage?: string
  createdBy?: string
  startedAt?: string
  completedAt?: string
}) {
  return {
    organization_id: input.organizationId,
    client_id: input.clientId,
    contract_id: input.contractId,
    workflow_run_id: input.workflowRunId || null,
    writer_agent_run_id: input.writerAgentRunId || null,
    reviewer_agent_run_id: input.reviewerAgentRunId || null,
    source_idea_id: input.sourceIdeaId || null,
    content_item_id: input.contentItemId || null,
    content_version_id: input.contentVersionId || null,
    status: input.status || 'queued',
    content_type: input.contentType,
    channel: input.channel,
    brief_snapshot: input.briefSnapshot?.trim() || '',
    context_summary: input.contextSummary?.trim() || '',
    prompt_snapshot: input.promptSnapshot?.trim() || null,
    output_title: input.outputTitle?.trim() || null,
    output_body: input.outputBody?.trim() || null,
    output_cta: input.outputCta?.trim() || null,
    variation_count: input.variationCount || 0,
    quality_score: input.qualityScore ?? null,
    requires_grounding: input.requiresGrounding ?? false,
    grounding_status: input.groundingStatus || (input.requiresGrounding ? 'required' : 'not_required'),
    checklist: input.checklist || {},
    error_message: input.errorMessage?.trim() || null,
    created_by: input.createdBy || null,
    started_at: input.startedAt || null,
    completed_at: input.completedAt || null,
  }
}

export function buildContentQualityCheckPayload(input: {
  organizationId: string
  clientId: string
  contractId: string
  contentItemId: string
  status?: MarketingContentQualityCheck['status']
  generationRunId?: string
  reviewerAgentRunId?: string
  groundingToolRunId?: string
  qualityScore?: number
  checklist?: Record<string, unknown>
  riskFlags?: string[]
  groundingRequired?: boolean
  groundingSummary?: string
  comments?: string
  createdBy?: string
}) {
  return {
    organization_id: input.organizationId,
    client_id: input.clientId,
    contract_id: input.contractId,
    content_item_id: input.contentItemId,
    generation_run_id: input.generationRunId || null,
    reviewer_agent_run_id: input.reviewerAgentRunId || null,
    grounding_tool_run_id: input.groundingToolRunId || null,
    status: input.status || 'pending',
    quality_score: input.qualityScore || 0,
    checklist: input.checklist || {},
    risk_flags: input.riskFlags || [],
    grounding_required: input.groundingRequired ?? false,
    grounding_summary: input.groundingSummary?.trim() || null,
    comments: input.comments?.trim() || null,
    created_by: input.createdBy || null,
  }
}

export function buildAgentPayload(input: {
  organizationId: string
  name: string
  agentType: MarketingAgent['agentType']
  description?: string
  clientId?: string
  contractId?: string
  templateId?: string
  status?: MarketingAgent['status']
  basePrompt?: string
  defaultModel?: string
  fallbackModel?: string
  allowedTools?: MarketingAgent['allowedTools']
  requiresHumanApproval?: boolean
  maxCostPerRun?: number
  maxRunsPerDay?: number
  promptConfig?: Record<string, unknown>
  contextPolicy?: Record<string, unknown>
  qualityGates?: Record<string, unknown>
  modelParameters?: Record<string, unknown>
}) {
  return {
    organization_id: input.organizationId,
    client_id: input.clientId || null,
    contract_id: input.contractId || null,
    template_id: input.templateId || null,
    name: input.name.trim(),
    agent_type: input.agentType,
    description: input.description?.trim() || '',
    status: input.status || 'active',
    base_prompt: input.basePrompt?.trim() || null,
    default_model: input.defaultModel || null,
    fallback_model: input.fallbackModel || null,
    allowed_tools: input.allowedTools || [],
    requires_human_approval: input.requiresHumanApproval ?? true,
    max_cost_per_run: input.maxCostPerRun ?? null,
    max_runs_per_day: input.maxRunsPerDay ?? null,
    prompt_config: input.promptConfig || {},
    context_policy: input.contextPolicy || {},
    quality_gates: input.qualityGates || {},
    model_parameters: input.modelParameters || {},
  }
}

export function buildWorkflowPayload(input: {
  organizationId: string
  clientId: string
  contractId: string
  workflowKey: string
  name: string
  description?: string
  status?: MarketingWorkflow['status']
  triggerType?: MarketingWorkflow['triggerType']
  config?: Record<string, unknown>
  createdBy?: string
}) {
  return {
    organization_id: input.organizationId,
    client_id: input.clientId,
    contract_id: input.contractId,
    workflow_key: input.workflowKey.trim(),
    name: input.name.trim(),
    description: input.description?.trim() || '',
    status: input.status || 'draft',
    trigger_type: input.triggerType || 'manual',
    config: input.config || {},
    created_by: input.createdBy || null,
  }
}

export function buildWorkflowRunPayload(input: {
  organizationId: string
  clientId: string
  contractId: string
  workflowId?: string
  runType?: MarketingWorkflowRun['runType']
  inputPayload?: Record<string, unknown>
  contextSnapshot?: Record<string, unknown>
  requestedBy?: string
}) {
  return {
    organization_id: input.organizationId,
    client_id: input.clientId,
    contract_id: input.contractId,
    workflow_id: input.workflowId || null,
    status: 'queued',
    run_type: input.runType || 'manual',
    input_payload: input.inputPayload || {},
    context_snapshot: input.contextSnapshot || {},
    requested_by: input.requestedBy || null,
  }
}

const CONTENT_SELECT = '*'
const VERSION_SELECT = '*'
const REVIEW_SELECT = '*'
const CALENDAR_SELECT = '*'
const BRAND_SELECT = '*'
const PRODUCT_SELECT = '*'
const DOCUMENT_SELECT = '*'
const CHUNK_SELECT = '*'
const SOURCE_SELECT = '*'
const IDEA_SELECT = '*'
const SOURCE_ITEM_SELECT = '*'
const RESEARCH_CACHE_SELECT = '*'
const RADAR_RUN_SELECT = '*'
const GENERATION_RUN_SELECT = '*'
const QUALITY_CHECK_SELECT = '*'
const AGENT_TEMPLATE_SELECT = '*'
const AGENT_SELECT = '*'
const GLOBAL_PROMPT_SELECT = '*'
const WORKFLOW_SELECT = '*'
const WORKFLOW_NODE_SELECT = '*'
const WORKFLOW_EDGE_SELECT = '*'
const WORKFLOW_RUN_SELECT = '*'
const AGENT_RUN_SELECT = '*'
const TOOL_RUN_SELECT = '*'
const BUDGET_POLICY_SELECT = '*'
const MODEL_ROUTING_SELECT = '*'
const TOOL_POLICY_SELECT = '*'

export const marketingStudioService = {
  async getSettings(contractId: string) {
    const { data, error } = await supabase
      .from('marketing_studio_settings')
      .select('*')
      .eq('contract_id', contractId)
      .maybeSingle()
    if (error) throw error
    return data ? mapMarketingSettings(data) : null
  },

  async getContents(filters?: { organizationId?: string; clientId?: string; contractId?: string }) {
    let query = supabase.from('content_items').select(CONTENT_SELECT).order('updated_at', { ascending: false })
    if (filters?.organizationId) query = query.eq('organization_id', filters.organizationId)
    if (filters?.clientId) query = query.eq('client_id', filters.clientId)
    if (filters?.contractId) query = query.eq('contract_id', filters.contractId)
    const { data, error } = await query
    if (error) throw error
    return (data || []).map(mapMarketingContent)
  },

  async getPortalContents(contractId: string): Promise<PortalMarketingContentItem[]> {
    const contents = await marketingStudioService.getContents({ contractId })
    return contents.map(sanitizeMarketingContentForPortal)
  },

  async getContentVersions(contentItemId: string) {
    const { data, error } = await supabase
      .from('content_versions')
      .select(VERSION_SELECT)
      .eq('content_item_id', contentItemId)
      .order('version_number', { ascending: false })
    if (error) throw error
    return (data || []).map(mapMarketingContentVersion)
  },

  async getReviews(filters?: { contentItemId?: string; contractId?: string }) {
    let query = supabase.from('content_reviews').select(REVIEW_SELECT).order('created_at', { ascending: false })
    if (filters?.contentItemId) query = query.eq('content_item_id', filters.contentItemId)
    if (filters?.contractId) {
      const contentIds = (await marketingStudioService.getContents({ contractId: filters.contractId })).map(content => content.id)
      if (!contentIds.length) return []
      query = query.in('content_item_id', contentIds)
    }
    const { data, error } = await query
    if (error) throw error
    return (data || []).map(mapMarketingContentReview)
  },

  async getCalendarItems(filters?: { organizationId?: string; clientId?: string; contractId?: string }) {
    let query = supabase.from('editorial_calendar_items').select(CALENDAR_SELECT).order('starts_at', { ascending: true })
    if (filters?.organizationId) query = query.eq('organization_id', filters.organizationId)
    if (filters?.clientId) query = query.eq('client_id', filters.clientId)
    if (filters?.contractId) query = query.eq('contract_id', filters.contractId)
    const { data, error } = await query
    if (error) throw error
    return (data || []).map(mapMarketingCalendarItem)
  },

  async getBrandProfile(contractId: string) {
    const { data, error } = await supabase
      .from('marketing_brand_profiles')
      .select(BRAND_SELECT)
      .eq('contract_id', contractId)
      .maybeSingle()
    if (error) throw error
    return data ? mapMarketingBrandProfile(data) : null
  },

  async getProductsServices(filters?: { organizationId?: string; clientId?: string; contractId?: string }) {
    let query = supabase.from('marketing_products_services').select(PRODUCT_SELECT).order('updated_at', { ascending: false })
    if (filters?.organizationId) query = query.eq('organization_id', filters.organizationId)
    if (filters?.clientId) query = query.eq('client_id', filters.clientId)
    if (filters?.contractId) query = query.eq('contract_id', filters.contractId)
    const { data, error } = await query
    if (error) throw error
    return (data || []).map(mapMarketingProductService)
  },

  async getKnowledgeDocuments(filters?: { organizationId?: string; clientId?: string; contractId?: string }) {
    let query = supabase.from('marketing_knowledge_documents').select(DOCUMENT_SELECT).order('updated_at', { ascending: false })
    if (filters?.organizationId) query = query.eq('organization_id', filters.organizationId)
    if (filters?.clientId) query = query.eq('client_id', filters.clientId)
    if (filters?.contractId) query = query.eq('contract_id', filters.contractId)
    const { data, error } = await query
    if (error) throw error
    return (data || []).map(mapMarketingKnowledgeDocument)
  },

  async getKnowledgeChunks(filters?: { documentId?: string; contractId?: string }) {
    let query = supabase.from('marketing_knowledge_chunks').select(CHUNK_SELECT).order('chunk_index', { ascending: true })
    if (filters?.documentId) query = query.eq('document_id', filters.documentId)
    if (filters?.contractId) query = query.eq('contract_id', filters.contractId)
    const { data, error } = await query
    if (error) throw error
    return (data || []).map(mapMarketingKnowledgeChunk)
  },

  async searchKnowledge(contractId: string, query: string, matchCount = 5) {
    const { data, error } = await supabase.rpc('match_marketing_knowledge', {
      target_contract_id: contractId,
      search_query: query,
      match_count: matchCount,
    })
    if (error) throw error
    return (data || []).map(mapMarketingKnowledgeMatch)
  },

  async getSources(filters?: { organizationId?: string; clientId?: string; contractId?: string }) {
    let query = supabase.from('marketing_sources').select(SOURCE_SELECT).order('updated_at', { ascending: false })
    if (filters?.organizationId) query = query.eq('organization_id', filters.organizationId)
    if (filters?.clientId) query = query.eq('client_id', filters.clientId)
    if (filters?.contractId) query = query.eq('contract_id', filters.contractId)
    const { data, error } = await query
    if (error) throw error
    return (data || []).map(mapMarketingSource)
  },

  async getIdeas(filters?: { contractId?: string; radarRunId?: string; sourceItemId?: string }) {
    let query = supabase.from('marketing_ideas').select(IDEA_SELECT).order('updated_at', { ascending: false })
    if (filters?.contractId) query = query.eq('contract_id', filters.contractId)
    if (filters?.radarRunId) query = query.eq('radar_run_id', filters.radarRunId)
    if (filters?.sourceItemId) query = query.eq('source_item_id', filters.sourceItemId)
    const { data, error } = await query
    if (error) throw error
    return (data || []).map(mapMarketingIdea)
  },

  async getSourceItems(filters?: { contractId?: string; sourceId?: string; radarRunId?: string; status?: MarketingSourceItem['status'] }) {
    let query = supabase.from('marketing_source_items').select(SOURCE_ITEM_SELECT).order('created_at', { ascending: false }).limit(50)
    if (filters?.contractId) query = query.eq('contract_id', filters.contractId)
    if (filters?.sourceId) query = query.eq('source_id', filters.sourceId)
    if (filters?.radarRunId) query = query.eq('radar_run_id', filters.radarRunId)
    if (filters?.status) query = query.eq('status', filters.status)
    const { data, error } = await query
    if (error) throw error
    return (data || []).map(mapMarketingSourceItem)
  },

  async getRadarRuns(filters?: { contractId?: string; status?: MarketingRadarRun['status'] }) {
    let query = supabase.from('marketing_radar_runs').select(RADAR_RUN_SELECT).order('created_at', { ascending: false }).limit(20)
    if (filters?.contractId) query = query.eq('contract_id', filters.contractId)
    if (filters?.status) query = query.eq('status', filters.status)
    const { data, error } = await query
    if (error) throw error
    return (data || []).map(mapMarketingRadarRun)
  },

  async getContentGenerationRuns(filters?: { contractId?: string; contentItemId?: string; status?: MarketingContentGenerationRun['status'] }) {
    let query = supabase.from('marketing_content_generation_runs').select(GENERATION_RUN_SELECT).order('created_at', { ascending: false }).limit(30)
    if (filters?.contractId) query = query.eq('contract_id', filters.contractId)
    if (filters?.contentItemId) query = query.eq('content_item_id', filters.contentItemId)
    if (filters?.status) query = query.eq('status', filters.status)
    const { data, error } = await query
    if (error) throw error
    return (data || []).map(mapMarketingContentGenerationRun)
  },

  async getContentQualityChecks(filters?: { contractId?: string; contentItemId?: string; status?: MarketingContentQualityCheck['status'] }) {
    let query = supabase.from('marketing_content_quality_checks').select(QUALITY_CHECK_SELECT).order('created_at', { ascending: false }).limit(30)
    if (filters?.contractId) query = query.eq('contract_id', filters.contractId)
    if (filters?.contentItemId) query = query.eq('content_item_id', filters.contentItemId)
    if (filters?.status) query = query.eq('status', filters.status)
    const { data, error } = await query
    if (error) throw error
    return (data || []).map(mapMarketingContentQualityCheck)
  },

  async getResearchCache(filters: { contractId: string; provider?: MarketingResearchCacheEntry['provider']; requestKey?: string }) {
    let query = supabase.from('marketing_research_cache').select(RESEARCH_CACHE_SELECT).eq('contract_id', filters.contractId).order('created_at', { ascending: false }).limit(20)
    if (filters.provider) query = query.eq('provider', filters.provider)
    if (filters.requestKey) query = query.eq('request_key', filters.requestKey)
    const { data, error } = await query
    if (error) throw error
    return (data || []).map(mapMarketingResearchCacheEntry)
  },

  async getAgentTemplates() {
    const { data, error } = await supabase
      .from('marketing_agent_templates')
      .select(AGENT_TEMPLATE_SELECT)
      .order('name', { ascending: true })
    if (error) throw error
    return (data || []).map(mapMarketingAgentTemplate)
  },

  async getAgents(filters?: { organizationId?: string; clientId?: string; contractId?: string }) {
    let query = supabase.from('marketing_agents').select(AGENT_SELECT).order('updated_at', { ascending: false })
    if (filters?.organizationId) query = query.eq('organization_id', filters.organizationId)
    if (filters?.clientId) query = query.eq('client_id', filters.clientId)
    if (filters?.contractId) query = query.eq('contract_id', filters.contractId)
    const { data, error } = await query
    if (error) throw error
    return (data || []).map(mapMarketingAgent)
  },

  async getGlobalPrompts() {
    const { data, error } = await supabase
      .from('marketing_agent_global_prompts')
      .select(GLOBAL_PROMPT_SELECT)
      .order('agent_type', { ascending: true })
    if (error) throw error
    return (data || []).map(mapMarketingAgentGlobalPrompt)
  },

  async getWorkflows(filters?: { organizationId?: string; clientId?: string; contractId?: string }) {
    let query = supabase.from('marketing_workflows').select(WORKFLOW_SELECT).order('updated_at', { ascending: false })
    if (filters?.organizationId) query = query.eq('organization_id', filters.organizationId)
    if (filters?.clientId) query = query.eq('client_id', filters.clientId)
    if (filters?.contractId) query = query.eq('contract_id', filters.contractId)
    const { data, error } = await query
    if (error) throw error
    return (data || []).map(mapMarketingWorkflow)
  },

  async getWorkflowNodes(workflowId: string) {
    const { data, error } = await supabase
      .from('marketing_workflow_nodes')
      .select(WORKFLOW_NODE_SELECT)
      .eq('workflow_id', workflowId)
      .order('node_key', { ascending: true })
    if (error) throw error
    return (data || []).map(mapMarketingWorkflowNode)
  },

  async getWorkflowEdges(workflowId: string) {
    const { data, error } = await supabase
      .from('marketing_workflow_edges')
      .select(WORKFLOW_EDGE_SELECT)
      .eq('workflow_id', workflowId)
    if (error) throw error
    return (data || []).map(mapMarketingWorkflowEdge)
  },

  async getWorkflowRuns(filters?: { contractId?: string; workflowId?: string; status?: MarketingWorkflowRun['status'] }) {
    let query = supabase.from('marketing_workflow_runs').select(WORKFLOW_RUN_SELECT).order('created_at', { ascending: false }).limit(20)
    if (filters?.contractId) query = query.eq('contract_id', filters.contractId)
    if (filters?.workflowId) query = query.eq('workflow_id', filters.workflowId)
    if (filters?.status) query = query.eq('status', filters.status)
    const { data, error } = await query
    if (error) throw error
    return (data || []).map(mapMarketingWorkflowRun)
  },

  async getAgentRuns(workflowRunId: string) {
    const { data, error } = await supabase
      .from('marketing_agent_runs')
      .select(AGENT_RUN_SELECT)
      .eq('workflow_run_id', workflowRunId)
      .order('created_at', { ascending: true })
    if (error) throw error
    return (data || []).map(mapMarketingAgentRun)
  },

  async getToolRuns(workflowRunId: string) {
    const { data, error } = await supabase
      .from('marketing_tool_runs')
      .select(TOOL_RUN_SELECT)
      .eq('workflow_run_id', workflowRunId)
      .order('created_at', { ascending: true })
    if (error) throw error
    return (data || []).map(mapMarketingToolRun)
  },

  async getBudgetPolicies(contractId: string) {
    const { data, error } = await supabase
      .from('agent_budget_policies')
      .select(BUDGET_POLICY_SELECT)
      .eq('contract_id', contractId)
      .order('updated_at', { ascending: false })
    if (error) throw error
    return (data || []).map(mapAgentBudgetPolicy)
  },

  async getModelRoutingRules(filters?: { contractId?: string; agentType?: string }) {
    let query = supabase.from('model_routing_rules').select(MODEL_ROUTING_SELECT).order('routing_tier', { ascending: true })
    if (filters?.contractId) query = query.eq('contract_id', filters.contractId)
    if (filters?.agentType) query = query.eq('agent_type', filters.agentType)
    const { data, error } = await query
    if (error) throw error
    return (data || []).map(mapModelRoutingRule)
  },

  async getToolPolicies(contractId: string) {
    const { data, error } = await supabase
      .from('marketing_agent_tool_policies')
      .select(TOOL_POLICY_SELECT)
      .eq('contract_id', contractId)
      .order('tool_key', { ascending: true })
    if (error) throw error
    return (data || []).map(mapMarketingAgentToolPolicy)
  },

  async createIdea(input: Parameters<typeof buildIdeaInsertPayload>[0]) {
    const { data, error } = await supabase
      .from('marketing_ideas')
      .insert(buildIdeaInsertPayload(input))
      .select()
      .single()
    if (error) throw error
    return mapMarketingIdea(data)
  },

  async createSourceItem(input: Parameters<typeof buildSourceItemPayload>[0]) {
    const { data, error } = await supabase
      .from('marketing_source_items')
      .insert(buildSourceItemPayload(input))
      .select(SOURCE_ITEM_SELECT)
      .single()
    if (error) throw error
    return mapMarketingSourceItem(data)
  },

  async upsertResearchCache(input: Parameters<typeof buildResearchCachePayload>[0]) {
    const { data, error } = await supabase
      .from('marketing_research_cache')
      .upsert(buildResearchCachePayload(input), { onConflict: 'contract_id,provider,request_type,request_key' })
      .select(RESEARCH_CACHE_SELECT)
      .single()
    if (error) throw error
    return mapMarketingResearchCacheEntry(data)
  },

  async createRadarRun(input: Parameters<typeof buildRadarRunPayload>[0]) {
    const { data, error } = await supabase
      .from('marketing_radar_runs')
      .insert(buildRadarRunPayload(input))
      .select(RADAR_RUN_SELECT)
      .single()
    if (error) throw error
    return mapMarketingRadarRun(data)
  },

  async createContentGenerationRun(input: Parameters<typeof buildContentGenerationRunPayload>[0]) {
    const { data, error } = await supabase
      .from('marketing_content_generation_runs')
      .insert(buildContentGenerationRunPayload(input))
      .select(GENERATION_RUN_SELECT)
      .single()
    if (error) throw error
    return mapMarketingContentGenerationRun(data)
  },

  async createContentQualityCheck(input: Parameters<typeof buildContentQualityCheckPayload>[0]) {
    const { data, error } = await supabase
      .from('marketing_content_quality_checks')
      .insert(buildContentQualityCheckPayload(input))
      .select(QUALITY_CHECK_SELECT)
      .single()
    if (error) throw error
    return mapMarketingContentQualityCheck(data)
  },

  async createContent(input: Parameters<typeof buildContentInsertPayload>[0]) {
    const { data, error } = await supabase
      .from('content_items')
      .insert(buildContentInsertPayload(input))
      .select(CONTENT_SELECT)
      .single()
    if (error) throw error
    return mapMarketingContent(data)
  },

  async updateContentStatus(id: string, status: MarketingContentItem['status']) {
    const { data, error } = await supabase
      .from('content_items')
      .update({ status })
      .eq('id', id)
      .select(CONTENT_SELECT)
      .single()
    if (error) throw error
    return mapMarketingContent(data)
  },

  async createContentVersion(input: Parameters<typeof buildContentVersionPayload>[0]) {
    const { data, error } = await supabase
      .from('content_versions')
      .insert(buildContentVersionPayload(input))
      .select(VERSION_SELECT)
      .single()
    if (error) throw error
    return mapMarketingContentVersion(data)
  },

  async createReview(input: Parameters<typeof buildContentReviewPayload>[0]) {
    const { data, error } = await supabase
      .from('content_reviews')
      .insert(buildContentReviewPayload(input))
      .select(REVIEW_SELECT)
      .single()
    if (error) throw error
    return mapMarketingContentReview(data)
  },

  async updateReviewDecision(id: string, input: {
    status: Exclude<MarketingReviewStatus, 'pending'>
    comments?: string
    qualityScore?: number
    checklist?: Record<string, unknown>
  }) {
    const { data, error } = await supabase
      .from('content_reviews')
      .update({
        status: input.status,
        comments: input.comments?.trim() || null,
        quality_score: input.qualityScore ?? null,
        checklist: input.checklist || {},
        decided_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select(REVIEW_SELECT)
      .single()
    if (error) throw error
    return mapMarketingContentReview(data)
  },

  async createCalendarItem(input: Parameters<typeof buildCalendarItemPayload>[0]) {
    const { data, error } = await supabase
      .from('editorial_calendar_items')
      .insert(buildCalendarItemPayload(input))
      .select(CALENDAR_SELECT)
      .single()
    if (error) throw error
    return mapMarketingCalendarItem(data)
  },

  async upsertBrandProfile(input: Parameters<typeof buildBrandProfilePayload>[0]) {
    const { data, error } = await supabase
      .from('marketing_brand_profiles')
      .upsert(buildBrandProfilePayload(input), { onConflict: 'contract_id' })
      .select(BRAND_SELECT)
      .single()
    if (error) throw error
    return mapMarketingBrandProfile(data)
  },

  async createProductService(input: Parameters<typeof buildProductServicePayload>[0]) {
    const { data, error } = await supabase
      .from('marketing_products_services')
      .insert(buildProductServicePayload(input))
      .select(PRODUCT_SELECT)
      .single()
    if (error) throw error
    return mapMarketingProductService(data)
  },

  async createKnowledgeDocument(input: Parameters<typeof buildKnowledgeDocumentPayload>[0]) {
    const { data, error } = await supabase
      .from('marketing_knowledge_documents')
      .insert(buildKnowledgeDocumentPayload(input))
      .select(DOCUMENT_SELECT)
      .single()
    if (error) throw error
    return mapMarketingKnowledgeDocument(data)
  },

  async createKnowledgeChunk(input: Parameters<typeof buildKnowledgeChunkPayload>[0]) {
    const { data, error } = await supabase
      .from('marketing_knowledge_chunks')
      .insert(buildKnowledgeChunkPayload(input))
      .select(CHUNK_SELECT)
      .single()
    if (error) throw error
    return mapMarketingKnowledgeChunk(data)
  },

  async upsertAgent(input: Parameters<typeof buildAgentPayload>[0] & { id?: string }) {
    const payload = buildAgentPayload(input)
    const { data, error } = await supabase
      .from('marketing_agents')
      .upsert(input.id ? { ...payload, id: input.id } : payload)
      .select(AGENT_SELECT)
      .single()
    if (error) throw error
    return mapMarketingAgent(data)
  },

  async createWorkflow(input: Parameters<typeof buildWorkflowPayload>[0]) {
    const { data, error } = await supabase
      .from('marketing_workflows')
      .insert(buildWorkflowPayload(input))
      .select(WORKFLOW_SELECT)
      .single()
    if (error) throw error
    return mapMarketingWorkflow(data)
  },

  async enqueueWorkflowRun(input: Parameters<typeof buildWorkflowRunPayload>[0]) {
    const { data, error } = await supabase
      .from('marketing_workflow_runs')
      .insert(buildWorkflowRunPayload(input))
      .select(WORKFLOW_RUN_SELECT)
      .single()
    if (error) throw error
    return mapMarketingWorkflowRun(data)
  },

  async recordUsage(input: Parameters<typeof buildUsageLedgerPayload>[0]) {
    const { data, error } = await supabase
      .from('ai_usage_ledger')
      .insert(buildUsageLedgerPayload(input))
      .select()
      .single()
    if (error) throw error
    return data
  },
}
