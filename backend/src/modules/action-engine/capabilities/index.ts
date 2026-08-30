import { CapabilityRegistry } from '../capability-registry.js'
import { crmLeadAssignOwner, crmLeadTimelineRead, crmPipelineSnapshot, crmRecoveryCandidatesSearch, crmTaskCreate } from './crm.js'
import { growthSegmentPreview } from './growth.js'
import { humanTaskCreate } from './human.js'
import { reportsRecoveredRevenueSnapshot } from './reports.js'
import { systemApprovalAwait, systemEvaluationCheckpoint, systemReadinessCheck, systemSignalWait } from './system.js'
import { crmSequenceEnroll, emailMessageQueue, omnichannelMessageDraft, whatsappTemplateQueue } from './communications.js'
import { automationFlowExecute } from './automation.js'
import { crmPipelineCreateDraft, crmPipelineInspect, crmPipelinePublish, crmPipelineSimulate } from './crm-funnel.js'
import {
  automationFlowCreateDraft, automationFlowPublish, automationFlowSimulate,
  crmSequenceCreateDraft, crmSequencePublish, crmSequenceSimulate,
  emailTemplateCreateDraft, emailTemplatePublish, emailTemplatesInspect,
} from './email-nurture.js'

export function createActionEngineCapabilityRegistry(): CapabilityRegistry {
  return new CapabilityRegistry()
    .register(systemReadinessCheck)
    .register(systemApprovalAwait)
    .register(systemSignalWait)
    .register(systemEvaluationCheckpoint)
    .register(crmPipelineSnapshot)
    .register(crmPipelineInspect)
    .register(crmPipelineSimulate)
    .register(crmPipelineCreateDraft)
    .register(crmPipelinePublish)
    .register(emailTemplatesInspect)
    .register(emailTemplateCreateDraft)
    .register(emailTemplatePublish)
    .register(crmSequenceCreateDraft)
    .register(crmSequenceSimulate)
    .register(crmSequencePublish)
    .register(automationFlowCreateDraft)
    .register(automationFlowSimulate)
    .register(automationFlowPublish)
    .register(crmRecoveryCandidatesSearch)
    .register(crmLeadTimelineRead)
    .register(growthSegmentPreview)
    .register(humanTaskCreate)
    .register(crmTaskCreate)
    .register(crmLeadAssignOwner)
    .register(reportsRecoveredRevenueSnapshot)
    .register(omnichannelMessageDraft)
    .register(crmSequenceEnroll)
    .register(emailMessageQueue)
    .register(whatsappTemplateQueue)
    .register(automationFlowExecute)
}
