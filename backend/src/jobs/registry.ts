import { z } from 'zod'
import type pg from 'pg'
import type { AppEnv } from '../config/env.js'
import { processSequenceExecution, runCrmSequenceScheduler } from '../modules/crm/scheduler.js'
import { handleAutomationDispatch, handleAutomationRun } from './handlers/automation.js'
import {
  handleActionEngineCollectMetrics,
  handleActionEngineDecisionNotification,
  handleActionEngineDecisionNotificationDispatch,
  handleActionEngineEvaluation,
  handleActionEngineExecute,
  handleActionEngineExpireWaits,
  handleActionEngineLearning,
  handleActionEnginePlanMission,
  handleActionEngineProcessMissionConversation,
  handleActionEngineReconcileProviderEffect,
  handleActionEngineRetention,
  handleActionEngineSchedule,
  handleCampaignOptimizationCheckpoints,
} from './handlers/action-engine.js'
import { handleKnowledgeIndexing, handleWebsiteOnboarding } from './handlers/company-intelligence.js'
import { handleDomainEventDelivery, handleDomainEventDispatch } from './handlers/domain-events.js'
import { handleEmailSend } from './handlers/email.js'
import { refreshExpiringGoogleTokens } from './handlers/google-token-refresh.js'
import { purgeExpiredTraces } from './handlers/maintenance.js'
import { handleInboundMessage, handleOutboundMessage } from './handlers/omnichannel.js'
import { handleProposalConversion } from './handlers/proposals.js'
import {
  handleOmnichannelSchedulingFallback,
  handleProviderFunction,
  handleProviderMetricsSync,
  handleSandboxChannelSimulation,
} from './handlers/providers.js'
import { handleRadarOpportunityAnalysis } from './handlers/radar.js'
import { handleStrategyAdminChat } from './handlers/strategy.js'
import { handleStrategyIndexKnowledge } from '../modules/strategy-engine/ingestion.js'
import { createIdempotencyKey, type JobName, type JobQueueClass, type QueueJobData } from './queue.js'

export type RegisteredJobQueue = {
  add(name: JobName, data: QueueJobData, options?: { delay?: number; jobId?: string }): Promise<{ id?: string | number | undefined }>
  close(): Promise<void>
}

export type JobHandlerContext = {
  pool: pg.Pool
  env: AppEnv
  queue: RegisteredJobQueue
  jobId: string
  signal: AbortSignal
}

export type JobRegistration = {
  schema: z.ZodType<QueueJobData>
  handler: (context: JobHandlerContext, data: QueueJobData) => Promise<unknown>
  queueClass: JobQueueClass
  timeoutMs: number
  sandboxOnly: boolean
}

const payload = z.record(z.string(), z.unknown())
const uuid = z.string().uuid()
const providerSyncPayload = z.object({
  organizationId: uuid,
  requestedBy: z.string().min(1),
  functionName: z.literal('sync-ad-metrics'),
  body: z.object({
    campaignId: uuid,
    sourceTimestamp: z.string().datetime().optional(),
  }).passthrough(),
}).passthrough()
const schedulingPayload = z.object({
  schedulingRequestId: uuid.optional(),
  conversationId: uuid.optional(),
  organizationId: uuid.optional(),
  requestedBy: z.string().min(1).optional(),
}).passthrough().refine(
  (value) => Boolean(value.schedulingRequestId || value.conversationId),
  'scheduling request identity is required',
)
const simulationPayload = z.object({
  organizationId: uuid,
  requestedBy: z.string().min(1),
  body: z.object({
    organizationId: uuid,
    channel: z.enum(['webchat', 'whatsapp', 'instagram', 'messenger']),
    eventType: z.string().min(1).max(120),
    payload: z.record(z.string(), z.unknown()).optional(),
  }).passthrough(),
}).passthrough()
const providerFunctionPayload = z.object({
  organizationId: uuid,
  requestedBy: z.string().min(1),
  functionName: z.enum(['execute-ad-provider-mutation', 'execute-wordpress-publishing', 'execute-marketing-publishing']),
  body: payload,
}).passthrough().superRefine((value, context) => {
  if (value.functionName !== 'execute-ad-provider-mutation') return
  const action = z.enum(['create_campaign', 'activate_campaign', 'update_budget', 'pause_campaign']).safeParse(value.body.action)
  if (!action.success) context.addIssue({ code: 'custom', message: 'valid provider mutation action is required', path: ['body', 'action'] })
  for (const field of ['campaignId', 'providerConnectionId', 'intentId'] as const) {
    if (!uuid.safeParse(value.body[field]).success) context.addIssue({ code: 'custom', message: `${field} must be a UUID`, path: ['body', field] })
  }
  if (action.success && ['create_campaign', 'activate_campaign', 'update_budget'].includes(action.data)
    && !uuid.safeParse(value.body.approvalId).success) {
    context.addIssue({ code: 'custom', message: 'approvalId must be a UUID for this provider mutation', path: ['body', 'approvalId'] })
  }
})

function registered(
  queueClass: JobQueueClass,
  timeoutMs: number,
  handler: JobRegistration['handler'],
  schema: z.ZodType<QueueJobData> = payload,
  sandboxOnly = false,
): JobRegistration {
  return { schema, handler, queueClass, timeoutMs, sandboxOnly }
}

const crmOptions = (env: AppEnv) => ({
  crmWebhookUrl: env.N8N_CRM_WEBHOOK_URL,
  crmWebhookSecret: env.N8N_WEBHOOK_SECRET,
})

export const jobRegistry = {
  'automation.dispatch': registered('interactive', 60_000, ({ pool, env }, data) => handleAutomationDispatch(pool, env, data)),
  'automation.executeRun': registered('external', 120_000, ({ pool, env }, data) => handleAutomationRun(pool, env, data)),
  'events.dispatchPending': registered('interactive', 30_000, ({ pool, queue }, data) => handleDomainEventDispatch(pool, queue, data)),
  'events.consume.automation': registered('interactive', 120_000, ({ pool, env, queue }, data) => handleDomainEventDelivery(pool, env, data, queue)),
  'events.consume.scoring': registered('interactive', 120_000, ({ pool, env, queue }, data) => handleDomainEventDelivery(pool, env, data, queue)),
  'events.consume.missionObserver': registered('interactive', 120_000, ({ pool, env, queue }, data) => handleDomainEventDelivery(pool, env, data, queue)),
  'events.consume.omnichannel': registered('interactive', 120_000, ({ pool, env, queue }, data) => handleDomainEventDelivery(pool, env, data, queue)),
  'events.consume.crmDispatch': registered('interactive', 120_000, ({ pool, env, queue }, data) => handleDomainEventDelivery(pool, env, data, queue)),
  'events.consume.strategyIngestion': registered('interactive', 120_000, ({ pool, env, queue }, data) => handleDomainEventDelivery(pool, env, data, queue)),
  'action-engine.planMission': registered('interactive', 180_000, ({ pool, env, queue }, data) => handleActionEnginePlanMission(pool, env, data, queue)),
  'action-engine.processMissionConversation': registered('interactive', 180_000, ({ pool, env }, data) => handleActionEngineProcessMissionConversation(pool, env, data)),
  'action-engine.scheduleReadyActions': registered('interactive', 60_000, ({ pool, queue }, data) => handleActionEngineSchedule(pool, queue, data)),
  'action-engine.executeAction': registered('external', 180_000, ({ pool, env, queue, jobId }, data) => handleActionEngineExecute(pool, queue, data, `worker:${jobId}`, env.ACTION_ENGINE_MUTATION_LEASE_SECRET)),
  'action-engine.reconcileProviderEffect': registered('external', 120_000, ({ pool, queue }, data) => handleActionEngineReconcileProviderEffect(pool, queue, data)),
  'action-engine.expireWaits': registered('maintenance', 60_000, ({ pool, queue }, data) => handleActionEngineExpireWaits(pool, queue, data)),
  'action-engine.collectMetrics': registered('maintenance', 180_000, ({ pool, queue }, data) => handleActionEngineCollectMetrics(pool, queue, data)),
  'action-engine.campaignOptimizationCheckpoint': registered('maintenance', 180_000, ({ pool }, data) => handleCampaignOptimizationCheckpoints(pool, data)),
  'action-engine.generateLearning': registered('maintenance', 180_000, ({ pool }, data) => handleActionEngineLearning(pool, data)),
  'action-engine.enforceRetention': registered('maintenance', 180_000, ({ pool }) => handleActionEngineRetention(pool)),
  'action-engine.evaluateMission': registered('interactive', 120_000, ({ pool, queue }, data) => handleActionEngineEvaluation(pool, data, queue)),
  'action-engine.deliverDecisionNotification': registered('external', 120_000, ({ pool, env, queue }, data) => handleActionEngineDecisionNotification(pool, queue, data, env.MISSION_DECISION_NOTIFICATIONS_ENABLED !== false)),
  'action-engine.dispatchDecisionNotifications': registered('maintenance', 120_000, ({ pool, env, queue }, data) => handleActionEngineDecisionNotificationDispatch(pool, queue, data, env.MISSION_DECISION_NOTIFICATIONS_ENABLED !== false)),
  'crm.sequence.dispatchDue': registered('maintenance', 120_000, ({ pool, env }) => runCrmSequenceScheduler(pool, crmOptions(env))),
  'crm.sequence.processExecution': registered('interactive', 120_000, ({ pool, env, queue }, data) => {
    const executionId = data.executionId
    if (typeof executionId !== 'string') throw new Error('executionId is required')
    return processSequenceExecution(pool, executionId, { ...crmOptions(env), emailJobQueue: queue, whatsappJobQueue: queue })
  }),
  'omnichannel.processMessage': registered('interactive', 180_000, ({ pool, env, queue }, data) => handleInboundMessage(pool, env, data, queue)),
  'omnichannel.dispatchOutbound': registered('external', 120_000, ({ pool, env }, data) => handleOutboundMessage(pool, data, { graphBaseUrl: env.META_GRAPH_BASE_URL, providerSecretEncryptionKey: env.PROVIDER_SECRET_ENCRYPTION_KEY_B64 })),
  'omnichannel.retryOutbound': registered('external', 120_000, ({ pool, env }, data) => handleOutboundMessage(pool, data, { graphBaseUrl: env.META_GRAPH_BASE_URL, providerSecretEncryptionKey: env.PROVIDER_SECRET_ENCRYPTION_KEY_B64 })),
  'omnichannel.requestScheduling': registered('interactive', 30_000, ({ pool }, data) => handleOmnichannelSchedulingFallback(pool, data), schedulingPayload),
  'omnichannel.simulateChannelEvent': registered('interactive', 30_000, ({ pool }, data) => handleSandboxChannelSimulation(pool, data), simulationPayload, true),
  'provider.functionInvoke': registered('external', 180_000, ({ pool, env, signal }, data) => handleProviderFunction(pool, data, {
    encryptionKey: env.PROVIDER_SECRET_ENCRYPTION_KEY_B64,
    graphBaseUrl: env.META_GRAPH_BASE_URL,
    fetcher: fetchWithSignal(signal),
  }), providerFunctionPayload),
  'provider.syncMetrics': registered('external', 180_000, ({ pool, env, signal }, data) => handleProviderMetricsSync(pool, data, {
    encryptionKey: env.PROVIDER_SECRET_ENCRYPTION_KEY_B64,
    graphBaseUrl: env.META_GRAPH_BASE_URL,
    fetcher: fetchWithSignal(signal),
  }), providerSyncPayload),
  'email.send': registered('external', 120_000, ({ pool }, data) => handleEmailSend(pool, data)),
  'strategy.adminChat': registered('interactive', 180_000, ({ pool, env }, data) => handleStrategyAdminChat(pool, env, data)),
  'strategy.indexKnowledge': registered('ingestion', 1_800_000, ({ pool, env, signal }, data) => handleStrategyIndexKnowledge(pool, env, data, { storageRoot: env.KNOWLEDGE_STORAGE_DIR, signal }), z.object({
    ingestionId: uuid,
    documentId: uuid,
    organizationId: uuid,
  }).passthrough()),
  'radar.analyzeOpportunity': registered('ingestion', 180_000, ({ pool, env }, data) => handleRadarOpportunityAnalysis(pool, env, data)),
  'company-intelligence.indexKnowledge': registered('ingestion', 300_000, ({ pool, env, signal }, data) => handleKnowledgeIndexing(pool, env, data, { signal })),
  'company-intelligence.discoverWebsite': registered('ingestion', 300_000, ({ pool, env, signal }, data) => handleWebsiteOnboarding(pool, env, data, { signal })),
  'proposal.convert': registered('interactive', 120_000, ({ pool }, data) => handleProposalConversion(pool, data.proposalId)),
  'maintenance.purgeExpiredTraces': registered('maintenance', 180_000, ({ pool }) => purgeExpiredTraces(pool)),
  'maintenance.refreshGoogleTokens': registered('maintenance', 180_000, ({ pool, env }) => refreshExpiringGoogleTokens(pool, env)),
} satisfies Record<JobName, JobRegistration>

export function parseRegisteredJobData(name: JobName, data: QueueJobData) {
  const parsed = jobRegistry[name].schema.safeParse(data)
  if (!parsed.success) throw new Error(`invalid_job_payload:${name}`)
  return parsed.data
}

export function enqueueRegisteredJob(
  queue: { add(name: string, data: QueueJobData, options?: { delay?: number; jobId?: string }): Promise<{ id?: string | number | undefined }> },
  name: JobName,
  data: QueueJobData,
  options?: { delay?: number; jobId?: string },
) {
  const parsed = parseRegisteredJobData(name, data)
  return queue.add(name, parsed, {
    jobId: options?.jobId ?? createIdempotencyKey(name, parsed),
    ...(options?.delay !== undefined ? { delay: options.delay } : {}),
  })
}

function fetchWithSignal(signal: AbortSignal): typeof fetch {
  return (resource, init = {}) => fetch(resource, { ...init, signal })
}
