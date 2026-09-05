import type { Job } from 'bullmq'
import type pg from 'pg'
import type { AppEnv } from '../config/env.js'
import { runWithDatabaseRequestContext } from '../db/request-context.js'
import type { AppJobQueue } from '../server.js'
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
import { handleProviderFunction } from './handlers/providers.js'
import { handleRadarOpportunityAnalysis } from './handlers/radar.js'
import { handleStrategyAdminChat } from './handlers/strategy.js'
import { isJobName, type QueueJobData } from './queue.js'

export type WorkerResult = { ok: true }

export type JobProcessorDependencies = {
  pool: pg.Pool
  env: AppEnv
  maintenanceQueue: AppJobQueue
}

/**
 * Builds the dispatcher used by both the production worker and the persistent
 * integration rig. Keeping composition here prevents tests from silently
 * replacing a missing production dependency with a permissive fake.
 */
export function createJobProcessor(dependencies: JobProcessorDependencies) {
  const { pool, env, maintenanceQueue } = dependencies

  return async function processJob(job: Job<QueueJobData, WorkerResult, string>): Promise<WorkerResult> {
    if (!isJobName(job.name)) throw new Error(`Unknown job name: ${job.name}`)
    const organizationId = organizationIdFromJob(job.data)
    return runWithDatabaseRequestContext({
      role: organizationId ? 'client_member' : 'yux_operator',
      organizationIds: organizationId ? [organizationId] : [],
      serviceRole: 'worker',
    }, async () => {

      if (job.name === 'crm.sequence.dispatchDue') {
        await runCrmSequenceScheduler(pool, {
          crmWebhookUrl: env.N8N_CRM_WEBHOOK_URL,
          crmWebhookSecret: env.N8N_WEBHOOK_SECRET,
        })
        return { ok: true }
      }

      if (job.name === 'crm.sequence.processExecution') {
        const executionId = job.data.executionId
        if (typeof executionId !== 'string') throw new Error('executionId is required')
        await processSequenceExecution(pool, executionId, {
          crmWebhookUrl: env.N8N_CRM_WEBHOOK_URL,
          crmWebhookSecret: env.N8N_WEBHOOK_SECRET,
          emailJobQueue: maintenanceQueue,
          whatsappJobQueue: maintenanceQueue,
        })
        return { ok: true }
      }

      if (job.name === 'proposal.convert') { await handleProposalConversion(pool, job.data.proposalId); return { ok: true } }
      if (job.name === 'automation.dispatch') { await handleAutomationDispatch(pool, env, job.data); return { ok: true } }
      if (job.name === 'events.dispatchPending') { await handleDomainEventDispatch(pool, maintenanceQueue, job.data); return { ok: true } }
      if (job.name === 'action-engine.planMission') { await handleActionEnginePlanMission(pool, env, job.data, maintenanceQueue); return { ok: true } }
      if (job.name === 'action-engine.processMissionConversation') { await handleActionEngineProcessMissionConversation(pool, env, job.data); return { ok: true } }
      if (job.name === 'action-engine.scheduleReadyActions') { await handleActionEngineSchedule(pool, maintenanceQueue, job.data); return { ok: true } }
      if (job.name === 'action-engine.executeAction') { await handleActionEngineExecute(pool, maintenanceQueue, job.data, `worker:${job.id ?? 'unknown'}`, env.ACTION_ENGINE_MUTATION_LEASE_SECRET); return { ok: true } }
      if (job.name === 'action-engine.reconcileProviderEffect') { await handleActionEngineReconcileProviderEffect(pool, maintenanceQueue, job.data); return { ok: true } }
      if (job.name === 'action-engine.evaluateMission') { await handleActionEngineEvaluation(pool, job.data, maintenanceQueue); return { ok: true } }
      if (job.name === 'action-engine.deliverDecisionNotification') { await handleActionEngineDecisionNotification(pool, maintenanceQueue, job.data, env.MISSION_DECISION_NOTIFICATIONS_ENABLED !== false); return { ok: true } }
      if (job.name === 'action-engine.dispatchDecisionNotifications') { await handleActionEngineDecisionNotificationDispatch(pool, maintenanceQueue, job.data, env.MISSION_DECISION_NOTIFICATIONS_ENABLED !== false); return { ok: true } }
      if (job.name === 'action-engine.expireWaits') { await handleActionEngineExpireWaits(pool, maintenanceQueue, job.data); return { ok: true } }
      if (job.name === 'action-engine.collectMetrics') { await handleActionEngineCollectMetrics(pool, maintenanceQueue, job.data); return { ok: true } }
      if (job.name === 'action-engine.campaignOptimizationCheckpoint') { await handleCampaignOptimizationCheckpoints(pool, job.data); return { ok: true } }
      if (job.name === 'action-engine.generateLearning') { await handleActionEngineLearning(pool, job.data); return { ok: true } }
      if (job.name === 'action-engine.enforceRetention') { await handleActionEngineRetention(pool); return { ok: true } }
      if (job.name === 'events.consume.automation' || job.name === 'events.consume.scoring' || job.name === 'events.consume.missionObserver') {
        await handleDomainEventDelivery(pool, env, job.data, maintenanceQueue)
        return { ok: true }
      }
      if (job.name === 'automation.executeRun') { await handleAutomationRun(pool, env, job.data); return { ok: true } }
      if (job.name === 'email.send') { await handleEmailSend(pool, job.data); return { ok: true } }
      if (job.name === 'provider.functionInvoke') { await handleProviderFunction(pool, job.data); return { ok: true } }
      if (job.name === 'omnichannel.processMessage') { await handleInboundMessage(pool, env, job.data, maintenanceQueue); return { ok: true } }
      if (job.name === 'omnichannel.dispatchOutbound' || job.name === 'omnichannel.retryOutbound') { await handleOutboundMessage(pool, job.data); return { ok: true } }
      if (job.name === 'strategy.adminChat') { await handleStrategyAdminChat(pool, env, job.data); return { ok: true } }
      if (job.name === 'radar.analyzeOpportunity') { await handleRadarOpportunityAnalysis(pool, env, job.data); return { ok: true } }
      if (job.name === 'company-intelligence.indexKnowledge') { await handleKnowledgeIndexing(pool, env, job.data); return { ok: true } }
      if (job.name === 'company-intelligence.discoverWebsite') { await handleWebsiteOnboarding(pool, env, job.data); return { ok: true } }
      if (job.name === 'maintenance.purgeExpiredTraces') { await purgeExpiredTraces(pool); return { ok: true } }
      if (job.name === 'maintenance.refreshGoogleTokens') { await refreshExpiringGoogleTokens(pool, env); return { ok: true } }

      throw new Error(`No handler registered for ${job.name}`)
    })
  }
}

function organizationIdFromJob(data: QueueJobData) {
  const value = data.organizationId ?? data.organization_id
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error('invalid_job_organization_context')
  }
  return value.toLowerCase()
}
