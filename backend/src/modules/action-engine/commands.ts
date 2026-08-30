import { createHash } from 'node:crypto'
import { enrollLeadInSequence } from '../crm/scheduler.js'
import { recordDomainEvent } from '../events/repository.js'
import type { CapabilityContext } from './capability-registry.js'
import type { Connectable, Queryable } from './repository.js'
import { acquireMissionOwnership } from './execution-ownership.js'
import { archiveMissionPipeline, createPipelineDraft, discardPipelineDraft, publishPipelineDraft } from '../crm/mission-commands.js'
import { createEmailTemplateDraft as createMissionEmailTemplateDraft, publishEmailTemplateVersion } from '../emailTemplates/mission-commands.js'
import {
  createAutomationFlowDraft as createMissionAutomationFlowDraft,
  createSequenceDraft as createMissionSequenceDraft,
  publishAutomationFlowDraft, publishSequenceDraft,
  simulateAutomationFlowDraft, simulateSequenceDraft,
  type AutomationFlowDraft,
} from '../automations/mission-commands.js'
import {
  activateProviderCampaign, attachAcquisitionAsset, attachCampaignCreativeDraft, createCampaignDraft,
  createProviderCampaignPaused, generateCreativeDraft, inspectCampaignState, pauseProviderCampaign,
} from '../campaigns/commands.js'
import type { CampaignLaunchArtifact } from '../campaigns/repository.js'
import { createLandingPageDraft, createLeadFormDraft } from '../landing-pages/mission-commands.js'

type CommandInput = Record<string, unknown>

export function createActionEngineCommands(pool: Connectable, missionId: string): NonNullable<CapabilityContext['commands']> {
  return {
    createTask: (input) => createLeadTask(pool, missionId, input),
    cancelTask: (input) => cancelLeadTask(pool, missionId, input),
    assignLeadOwner: (input) => assignLeadOwner(pool, missionId, input),
    enrollSequence: (input) => enrollSequence(pool, missionId, input),
    pauseSequenceEnrollment: (input) => pauseSequenceEnrollment(pool, missionId, input),
    createPipelineDraft: (input) => createMissionPipelineDraft(pool, missionId, input),
    publishPipelineDraft: (input) => publishMissionPipelineDraft(pool, missionId, input),
    discardPipelineDraft: (input) => discardMissionPipelineDraft(pool, missionId, input),
    archivePipeline: (input) => archiveMissionManagedPipeline(pool, missionId, input),
    createEmailTemplateDraft: (input) => createMissionEmailTemplate(pool, missionId, input),
    publishEmailTemplate: (input) => publishMissionEmailTemplate(pool, missionId, input),
    createSequenceDraft: (input) => createMissionSequence(pool, missionId, input),
    simulateSequenceDraft: (input) => simulateMissionSequence(pool, missionId, input),
    publishSequence: (input) => publishMissionSequence(pool, missionId, input),
    createAutomationFlowDraft: (input) => createMissionAutomationFlow(pool, missionId, input),
    simulateAutomationFlow: (input) => simulateMissionAutomationFlow(pool, missionId, input),
    publishAutomationFlow: (input) => publishMissionAutomationFlow(pool, missionId, input),
    archiveEmailTemplate: (input) => archiveMissionArtifact(pool, missionId, input, 'email_template'),
    archiveSequence: (input) => archiveMissionArtifact(pool, missionId, input, 'crm_sequence'),
    archiveAutomationFlow: (input) => archiveMissionArtifact(pool, missionId, input, 'automation_flow'),
    inspectCampaignState: (input) => inspectCampaignState(pool, requiredString(input, 'organizationId'), missionId),
    createCampaignDraft: (input) => createMissionCampaignDraft(pool, missionId, input),
    generateCreativeDraft: (input) => createMissionCreativeDraft(pool, missionId, input),
    attachCampaignCreativeDraft: (input) => attachMissionCreativeDraft(pool, missionId, input),
    createLandingPageDraft: (input) => createMissionLandingPageDraft(pool, missionId, input),
    createLeadFormDraft: (input) => createMissionLeadFormDraft(pool, missionId, input),
    attachAcquisitionAsset: (input) => attachMissionAcquisitionAsset(pool, missionId, input),
    createProviderCampaignPaused: (input) => createProviderCampaignPaused(pool, missionCommandContext(missionId, input), { versionId: requiredString(input,'versionId'), expectedContentHash: requiredString(input,'expectedContentHash'), approvedSubjectHash: requiredString(input,'approvedSubjectHash'), maxTotalBudgetBrl: requiredString(input,'maxTotalBudgetBrl') }),
    activateProviderCampaign: (input) => activateProviderCampaign(pool, missionCommandContext(missionId, input), { versionId: requiredString(input,'versionId'), expectedContentHash: requiredString(input,'expectedContentHash'), approvedSubjectHash: requiredString(input,'approvedSubjectHash') }),
    pauseProviderCampaign: (input) => pauseProviderCampaign(pool, missionCommandContext(missionId, input), { versionId: requiredString(input,'versionId'), expectedContentHash: requiredString(input,'expectedContentHash'), approvedSubjectHash: requiredString(input,'approvedSubjectHash') }),
  }
}

async function createMissionCampaignDraft(pool:Connectable,missionId:string,input:CommandInput){return transaction(pool,client=>createCampaignDraft(client,missionCommandContext(missionId,input),campaignArtifact(input)))}
async function createMissionCreativeDraft(pool:Connectable,missionId:string,input:CommandInput){return transaction(pool,client=>generateCreativeDraft(client,missionCommandContext(missionId,input),{campaignVersionId:requiredString(input,'campaignVersionId'),position:requiredInteger(input,'position'),creative:creativeInput(input.creative)}))}
async function attachMissionCreativeDraft(pool:Connectable,missionId:string,input:CommandInput){return transaction(pool,client=>attachCampaignCreativeDraft(client,missionCommandContext(missionId,input),{campaignVersionId:requiredString(input,'campaignVersionId'),creativeVersionId:requiredString(input,'creativeVersionId'),expectedContentHash:requiredString(input,'expectedContentHash')}))}
async function createMissionLandingPageDraft(pool:Connectable,missionId:string,input:CommandInput){return transaction(pool,client=>createLandingPageDraft(client,missionCommandContext(missionId,input),{name:requiredString(input,'name'),slug:requiredString(input,'slug'),title:requiredString(input,'title'),primaryCtaType:ctaType(input.primaryCtaType),primaryCtaValue:requiredString(input,'primaryCtaValue'),content:recordInput(input.content,'content'),...(optionalString(input,'campaignId')?{campaignId:optionalString(input,'campaignId')!}:{})}))}
async function createMissionLeadFormDraft(pool:Connectable,missionId:string,input:CommandInput){return transaction(pool,client=>createLeadFormDraft(client,missionCommandContext(missionId,input),{landingPageId:requiredString(input,'landingPageId'),name:requiredString(input,'name'),submitLabel:requiredString(input,'submitLabel'),successMessage:requiredString(input,'successMessage'),consentCode:requiredString(input,'consentCode'),consentVersion:requiredString(input,'consentVersion'),privacyPolicyVersion:requiredString(input,'privacyPolicyVersion'),fields:formFields(input.fields)}))}
async function attachMissionAcquisitionAsset(pool:Connectable,missionId:string,input:CommandInput){return transaction(pool,client=>attachAcquisitionAsset(client,missionCommandContext(missionId,input),{campaignVersionId:requiredString(input,'campaignVersionId'),assetKind:assetKind(input.assetKind),...(optionalString(input,'sourceEntityId')?{sourceEntityId:optionalString(input,'sourceEntityId')!}:{}),payload:recordInput(input.payload,'payload'),validated:input.validated===true}))}

async function createMissionEmailTemplate(pool: Connectable, missionId: string, input: CommandInput) {
  return transaction(pool, async (client) => {
    const context = missionCommandContext(missionId, input)
    const result = await createMissionEmailTemplateDraft(client, context, {
      name: requiredString(input, 'name'), subject: requiredString(input, 'subject'),
      ...(optionalString(input, 'preheader') ? { preheader: optionalString(input, 'preheader')! } : {}),
      bodyHtml: requiredString(input, 'bodyHtml'), bodyText: requiredString(input, 'bodyText'),
      sourceIds: stringArray(input.sourceIds, 'sourceIds'), complianceNotes: stringArray(input.complianceNotes, 'complianceNotes'),
    })
    await own(client, context.organizationId, missionId, 'email_template', result.entityId, 'nurture_copy', ['email.template.publish'])
    if (result.versionId) await own(client, context.organizationId, missionId, 'email_template_version', result.versionId, 'pinned_copy_version', [])
    return result
  })
}

async function publishMissionEmailTemplate(pool: Connectable, missionId: string, input: CommandInput) {
  return transaction(pool, async (client) => {
    const context = missionCommandContext(missionId, input)
    const result = await publishEmailTemplateVersion(client, context, { templateId: requiredString(input, 'templateId'), expectedContentHash: requiredString(input, 'expectedContentHash') })
    await own(client, context.organizationId, missionId, 'email_template', result.entityId, 'published_nurture_copy', ['email.template.publish'])
    if (result.versionId) await own(client, context.organizationId, missionId, 'email_template_version', result.versionId, 'pinned_copy_version', [])
    return result
  })
}

async function createMissionSequence(pool: Connectable, missionId: string, input: CommandInput) {
  return transaction(pool, async (client) => {
    const context = missionCommandContext(missionId, input)
    const result = await createMissionSequenceDraft(client, context, {
      name: requiredString(input, 'name'), ...(optionalString(input, 'description') ? { description: optionalString(input, 'description')! } : {}),
      ...(optionalString(input, 'conversionGoal') ? { conversionGoal: optionalString(input, 'conversionGoal')! } : {}),
      steps: sequenceSteps(input.steps),
    })
    await own(client, context.organizationId, missionId, 'crm_sequence', result.entityId, 'nurture_sequence', ['crm.sequence.publish'])
    await own(client, context.organizationId, missionId, 'crm_sequence_version', result.versionId, 'nurture_sequence_version', [])
    return result
  })
}

async function simulateMissionSequence(pool: Connectable, missionId: string, input: CommandInput) {
  return simulateSequenceDraft(pool, missionCommandContext(missionId, input), {
    sequenceId: requiredString(input, 'sequenceId'), expectedContentHash: requiredString(input, 'expectedContentHash'),
  })
}

async function publishMissionSequence(pool: Connectable, missionId: string, input: CommandInput) {
  return transaction(pool, async (client) => publishSequenceDraft(client, missionCommandContext(missionId, input), {
    sequenceId: requiredString(input, 'sequenceId'), versionId: requiredString(input, 'versionId'), expectedContentHash: requiredString(input, 'expectedContentHash'),
  }))
}

async function createMissionAutomationFlow(pool: Connectable, missionId: string, input: CommandInput) {
  return transaction(pool, async (client) => {
    const context = missionCommandContext(missionId, input)
    const result = await createMissionAutomationFlowDraft(client, context, automationFlowInput(input))
    await own(client, context.organizationId, missionId, 'automation_flow', result.entityId, 'nurture_entry_flow', ['automation.flow.publish'])
    await own(client, context.organizationId, missionId, 'automation_flow_version', result.versionId, 'nurture_entry_flow_version', [])
    return result
  })
}

async function simulateMissionAutomationFlow(pool: Connectable, missionId: string, input: CommandInput) {
  return simulateAutomationFlowDraft(pool, missionCommandContext(missionId, input), {
    flowId: requiredString(input, 'flowId'), versionId: requiredString(input, 'versionId'), expectedContentHash: requiredString(input, 'expectedContentHash'),
  })
}

async function publishMissionAutomationFlow(pool: Connectable, missionId: string, input: CommandInput) {
  return transaction(pool, async (client) => publishAutomationFlowDraft(client, missionCommandContext(missionId, input), {
    flowId: requiredString(input, 'flowId'), versionId: requiredString(input, 'versionId'), expectedContentHash: requiredString(input, 'expectedContentHash'),
  }))
}

async function archiveMissionArtifact(pool: Connectable, missionId: string, input: CommandInput, kind: 'email_template' | 'crm_sequence' | 'automation_flow') {
  const entityId = requiredString(input, 'entityId'); const context = missionCommandContext(missionId, input)
  return transaction(pool, async (client) => {
    if (kind === 'email_template') await client.query(`UPDATE public.email_templates SET status='archived',updated_at=NOW() WHERE id=$1 AND organization_id=$2 AND mission_id=$3`, [entityId, context.organizationId, missionId])
    if (kind === 'crm_sequence') {
      await client.query(`UPDATE public.crm_sequences SET status='archived',is_active=FALSE,updated_at=NOW() WHERE id=$1 AND organization_id=$2 AND mission_id=$3`, [entityId, context.organizationId, missionId])
      await client.query(`UPDATE public.crm_sequence_versions SET status='archived' WHERE sequence_id=$1 AND organization_id=$2 AND mission_id=$3`, [entityId, context.organizationId, missionId])
    }
    if (kind === 'automation_flow') {
      await client.query(`UPDATE public.automation_flows SET status='archived',is_enabled=FALSE,updated_at=NOW() WHERE id=$1 AND organization_id=$2 AND mission_id=$3`, [entityId, context.organizationId, missionId])
      await client.query(`UPDATE public.automation_flow_versions SET status='archived' WHERE flow_id=$1 AND mission_id=$2`, [entityId, missionId])
    }
    return { entityId, status: 'archived' }
  })
}

async function createMissionPipelineDraft(pool: Connectable, missionId: string, input: CommandInput) {
  return transaction(pool, async (client) => {
    const context = missionCommandContext(missionId, input)
    const result = await createPipelineDraft(client, context, {
      name: requiredString(input, 'name'),
      ...(optionalString(input, 'description') ? { description: optionalString(input, 'description')! } : {}),
      stages: funnelStages(input.stages),
    })
    await acquireMissionOwnership(client, {
      organizationId: context.organizationId, missionId, entityType: 'crm_pipeline_version', entityId: result.versionId,
      role: 'funnel_draft', mode: 'exclusive', conflictPolicy: 'mission_wins', allowedActionKeys: ['crm.pipeline.publish'],
    })
    return result
  })
}

async function publishMissionPipelineDraft(pool: Connectable, missionId: string, input: CommandInput) {
  return transaction(pool, async (client) => {
    const context = missionCommandContext(missionId, input)
    const result = await publishPipelineDraft(client, context, {
      versionId: requiredString(input, 'versionId'), expectedContentHash: requiredString(input, 'expectedContentHash'),
    })
    await acquireMissionOwnership(client, {
      organizationId: context.organizationId, missionId, entityType: 'crm_pipeline', entityId: result.entityId,
      role: 'managed_funnel', mode: 'exclusive', conflictPolicy: 'mission_wins', allowedActionKeys: ['crm.pipeline.publish'],
    })
    return result
  })
}

async function discardMissionPipelineDraft(pool: Connectable, missionId: string, input: CommandInput) {
  return transaction(pool, async (client) => discardPipelineDraft(client, missionCommandContext(missionId, input), { versionId: requiredString(input, 'versionId') }))
}

async function archiveMissionManagedPipeline(pool: Connectable, missionId: string, input: CommandInput) {
  return transaction(pool, async (client) => archiveMissionPipeline(client, missionCommandContext(missionId, input), { pipelineId: requiredString(input, 'pipelineId') }))
}

async function createLeadTask(pool: Connectable, missionId: string, input: CommandInput) {
  const organizationId = requiredString(input, 'organizationId')
  const leadId = requiredString(input, 'leadId')
  const idempotencyKey = requiredString(input, 'idempotencyKey')
  const taskId = deterministicUuid(`action-engine-task:${organizationId}:${idempotencyKey}`)
  return transaction(pool, async (client) => {
    const result = await client.query<{ id: string }>(
      `INSERT INTO public.lead_tasks (
         id, organization_id, lead_id, title, description, due_at, assigned_to, priority, metadata
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (id) DO NOTHING
       RETURNING id`,
      [taskId, organizationId, leadId, requiredString(input, 'title'), optionalString(input, 'description'),
        requiredString(input, 'dueAt'), optionalString(input, 'assignedTo'), optionalString(input, 'priority') ?? 'medium',
        { source: 'action_engine', missionId, idempotencyKey }],
    )
    if (result.rows[0]) {
      await recordDomainEvent(client, {
        eventType: 'lead.task_created', organizationId, aggregateType: 'task', aggregateId: taskId, leadId,
        actor: { type: 'system' }, payload: { missionId, taskId, title: requiredString(input, 'title') },
      })
    } else {
      const existing = await client.query<{ id: string }>(
        `SELECT id FROM public.lead_tasks WHERE id = $1 AND organization_id = $2 AND lead_id = $3`,
        [taskId, organizationId, leadId],
      )
      if (!existing.rows[0]) throw new Error('action_engine_task_idempotency_conflict')
    }
    return { id: taskId }
  })
}

async function assignLeadOwner(pool: Connectable, missionId: string, input: CommandInput) {
  const organizationId = requiredString(input, 'organizationId')
  const leadId = requiredString(input, 'leadId')
  const ownerId = requiredString(input, 'ownerId')
  return transaction(pool, async (client) => {
    const result = await client.query<{ id: string }>(
      `UPDATE public.leads SET owner_id = $3, assigned_to = $3, updated_at = NOW()
       WHERE id = $1 AND organization_id = $2 AND owner_id IS DISTINCT FROM $3 RETURNING id`,
      [leadId, organizationId, ownerId],
    )
    if (result.rows[0]) {
      await recordDomainEvent(client, {
        eventType: 'lead.owner_changed', organizationId, aggregateType: 'lead', aggregateId: leadId, leadId,
        actor: { type: 'system' }, payload: { missionId, ownerId },
      })
    } else {
      const existing = await client.query<{ id: string }>(
        `SELECT id FROM public.leads WHERE id = $1 AND organization_id = $2 AND owner_id = $3`,
        [leadId, organizationId, ownerId],
      )
      if (!existing.rows[0]) throw new Error('action_engine_lead_not_found')
    }
    return { leadId, ownerId }
  })
}

async function cancelLeadTask(pool: Connectable, missionId: string, input: CommandInput) {
  const organizationId = requiredString(input, 'organizationId')
  const taskId = requiredString(input, 'taskId')
  return transaction(pool, async (client) => {
    const result = await client.query<{ id: string; lead_id: string }>(
      `UPDATE public.lead_tasks
       SET status = 'cancelled', cancelled_at = NOW(), completed_at = NULL,
           metadata = metadata || $3::jsonb, updated_at = NOW()
       WHERE id = $1 AND organization_id = $2 AND status = 'pending'
       RETURNING id, lead_id`,
      [taskId, organizationId, { recovery: 'mission_compensation', missionId }],
    )
    if (result.rows[0]) {
      await recordDomainEvent(client, {
        eventType: 'lead.task_cancelled', organizationId, aggregateType: 'task', aggregateId: taskId,
        leadId: result.rows[0].lead_id, actor: { type: 'system' }, payload: { missionId, taskId },
      })
      return { id: taskId, status: 'cancelled' }
    }
    const existing = await client.query<{ id: string }>(
      `SELECT id FROM public.lead_tasks WHERE id = $1 AND organization_id = $2 AND status = 'cancelled'`,
      [taskId, organizationId],
    )
    if (!existing.rows[0]) throw new Error('action_engine_task_recovery_not_available')
    return { id: taskId, status: 'cancelled', duplicate: true }
  })
}

async function enrollSequence(pool: Connectable, missionId: string, input: CommandInput) {
  return enrollLeadInSequence(pool as never, {
    organizationId: requiredString(input, 'organizationId'), leadId: requiredString(input, 'leadId'),
    sequenceId: requiredString(input, 'sequenceId'), existingEnrollment: sequenceMode(input.existingEnrollment),
    correlationId: missionId,
  })
}

async function pauseSequenceEnrollment(pool: Connectable, missionId: string, input: CommandInput) {
  const organizationId = requiredString(input, 'organizationId')
  const enrollmentId = requiredString(input, 'enrollmentId')
  return transaction(pool, async (client) => {
    const result = await client.query<{ id: string; lead_id: string; sequence_id: string }>(
      `UPDATE public.crm_sequence_enrollments
       SET status = 'paused', next_execution_at = NULL, updated_at = NOW()
       WHERE id = $1 AND organization_id = $2 AND status = 'active'
       RETURNING id, lead_id, sequence_id`,
      [enrollmentId, organizationId],
    )
    if (result.rows[0]) {
      await recordDomainEvent(client, {
        eventType: 'lead.sequence_paused', organizationId, aggregateType: 'sequence_enrollment',
        aggregateId: enrollmentId, leadId: result.rows[0].lead_id, actor: { type: 'system' },
        payload: { missionId, enrollmentId, sequenceId: result.rows[0].sequence_id },
      })
      return { enrollmentId, status: 'paused' }
    }
    const existing = await client.query<{ id: string }>(
      `SELECT id FROM public.crm_sequence_enrollments WHERE id = $1 AND organization_id = $2 AND status = 'paused'`,
      [enrollmentId, organizationId],
    )
    if (!existing.rows[0]) throw new Error('action_engine_sequence_recovery_not_available')
    return { enrollmentId, status: 'paused', duplicate: true }
  })
}

function requiredString(input: CommandInput, key: string): string {
  const value = input[key]
  if (typeof value !== 'string' || !value.trim()) throw new Error(`action_engine_command_${key}_required`)
  return value
}

function optionalString(input: CommandInput, key: string): string | null {
  const value = input[key]
  return typeof value === 'string' && value.trim() ? value : null
}

function sequenceMode(value: unknown): 'skip' | 'resume' | 'restart' {
  return value === 'resume' || value === 'restart' ? value : 'skip'
}

function missionCommandContext(missionId: string, input: CommandInput) {
  const inputMissionId = requiredString(input, 'missionId')
  if (inputMissionId !== missionId) throw new Error('action_engine_command_mission_mismatch')
  return {
    organizationId: requiredString(input, 'organizationId'), missionId,
    actionRunId: requiredString(input, 'actionRunId'), actorId: requiredString(input, 'actorId'),
    idempotencyKey: requiredString(input, 'idempotencyKey'),
  }
}

function funnelStages(value: unknown) {
  if (!Array.isArray(value)) throw new Error('action_engine_command_stages_required')
  return value.map((stage) => {
    if (!stage || typeof stage !== 'object') throw new Error('action_engine_command_stage_invalid')
    const item = stage as Record<string, unknown>
    if (!Array.isArray(item.exitCriteria) || item.exitCriteria.some((entry) => typeof entry !== 'string')) throw new Error('action_engine_command_stage_exit_criteria_invalid')
    return {
      key: requiredString(item, 'key'), name: requiredString(item, 'name'),
      ...(optionalString(item, 'color') ? { color: optionalString(item, 'color')! } : {}),
      exitCriteria: item.exitCriteria as string[], isWon: item.isWon === true, isLost: item.isLost === true,
    }
  })
}

function stringArray(value: unknown, key: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) throw new Error(`action_engine_command_${key}_invalid`)
  return value as string[]
}

function sequenceSteps(value: unknown) {
  if (!Array.isArray(value)) throw new Error('action_engine_command_steps_required')
  return value.map((step) => {
    if (!step || typeof step !== 'object') throw new Error('action_engine_command_sequence_step_invalid')
    const item = step as Record<string, unknown>
    const delayMinutes = Number(item.delayMinutes)
    if (!Number.isInteger(delayMinutes)) throw new Error('action_engine_command_sequence_delay_invalid')
    return { templateVersionId: requiredString(item, 'templateVersionId'), delayMinutes, exitConditions: stringArray(item.exitConditions, 'exitConditions') }
  })
}

function requiredInteger(input:CommandInput,key:string){const value=Number(input[key]);if(!Number.isInteger(value)||value<0)throw new Error(`action_engine_command_${key}_invalid`);return value}
function recordInput(value:unknown,key:string):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value))throw new Error(`action_engine_command_${key}_invalid`);return value as Record<string,unknown>}
function ctaType(value:unknown):'form'|'whatsapp'|'phone'|'external_url'{if(value==='form'||value==='whatsapp'||value==='phone'||value==='external_url')return value;throw new Error('action_engine_command_primaryCtaType_invalid')}
function assetKind(value:unknown):'landing_page'|'lead_form'|'tracking'{if(value==='landing_page'||value==='lead_form'||value==='tracking')return value;throw new Error('action_engine_command_assetKind_invalid')}
function creativeInput(value:unknown):CampaignLaunchArtifact['creatives'][number]{const item=recordInput(value,'creative');const format=requiredString(item,'format');if(!['image','video','carousel','text'].includes(format))throw new Error('action_engine_command_creative_format_invalid');return{format:format as CampaignLaunchArtifact['creatives'][number]['format'],headline:requiredString(item,'headline'),body:requiredString(item,'body'),sourceIds:stringArray(item.sourceIds,'sourceIds')}}
function campaignArtifact(input:CommandInput):CampaignLaunchArtifact{
  const platform=requiredString(input,'platform');if(platform!=='meta'&&platform!=='google')throw new Error('action_engine_command_platform_invalid')
  const objective=requiredString(input,'objective');if(!['lead_generation','traffic','conversions','awareness'].includes(objective))throw new Error('action_engine_command_objective_invalid')
  if(!Array.isArray(input.creatives))throw new Error('action_engine_command_creatives_invalid')
  return{name:requiredString(input,'name'),objective:objective as CampaignLaunchArtifact['objective'],offer:requiredString(input,'offer'),audience:recordInput(input.audience,'audience'),platform,providerConnectionId:requiredString(input,'providerConnectionId'),dailyBudgetBrl:requiredString(input,'dailyBudgetBrl'),totalBudgetBrl:requiredString(input,'totalBudgetBrl'),startsAt:requiredString(input,'startsAt'),...(optionalString(input,'endsAt')?{endsAt:optionalString(input,'endsAt')!}:{}),creatives:input.creatives.map(creativeInput),...(optionalString(input,'landingPageId')?{landingPageId:optionalString(input,'landingPageId')!}:{}),...(optionalString(input,'leadFormId')?{leadFormId:optionalString(input,'leadFormId')!}:{}),trackingPlan:Object.fromEntries(Object.entries(recordInput(input.trackingPlan,'trackingPlan')).map(([key,value])=>[key,String(value)])),sourceIds:stringArray(input.sourceIds,'sourceIds')}
}
function formFields(value:unknown){if(!Array.isArray(value))throw new Error('action_engine_command_fields_invalid');return value.map(raw=>{const item=recordInput(raw,'field');return{fieldName:requiredString(item,'fieldName'),crmFieldKey:requiredString(item,'crmFieldKey'),required:item.required===true}})}

function automationFlowInput(input: CommandInput): AutomationFlowDraft {
  const trigger = input.trigger
  if (!trigger || typeof trigger !== 'object') throw new Error('action_engine_command_trigger_required')
  const rawTrigger = trigger as Record<string, unknown>; const type = requiredString(rawTrigger, 'type')
  let normalizedTrigger: AutomationFlowDraft['trigger']
  if (type === 'lead.created') normalizedTrigger = { type }
  else if (type === 'lead.stage_changed') normalizedTrigger = { type, pipelineId: requiredString(rawTrigger, 'pipelineId'), stageId: requiredString(rawTrigger, 'stageId') }
  else if (type === 'lead.field_changed') normalizedTrigger = { type, field: requiredString(rawTrigger, 'field') }
  else throw new Error('action_engine_command_trigger_invalid')
  const conditions = input.eligibilityConditions
  if (!Array.isArray(conditions)) throw new Error('action_engine_command_conditions_required')
  const eligibilityConditions = conditions.map((condition) => {
    if (!condition || typeof condition !== 'object') throw new Error('action_engine_command_condition_invalid')
    const item = condition as Record<string, unknown>; const operator = requiredString(item, 'operator')
    if (!['equals','not_equals','contains','greater_than','less_than','exists'].includes(operator)) throw new Error('action_engine_command_condition_operator_invalid')
    return { field: requiredString(item, 'field'), operator: operator as AutomationFlowDraft['eligibilityConditions'][number]['operator'], ...(item.value !== undefined ? { value: item.value } : {}) }
  })
  return {
    name: requiredString(input, 'name'), ...(optionalString(input, 'description') ? { description: optionalString(input, 'description')! } : {}),
    trigger: normalizedTrigger, eligibilityConditions, sequenceVersionId: requiredString(input, 'sequenceVersionId'),
    exitConditions: stringArray(input.exitConditions, 'exitConditions'), consentPolicy: requiredString(input, 'consentPolicy') as 'require_granted',
    suppressionPolicy: requiredString(input, 'suppressionPolicy') as 'check_before_enrollment', dailyRunLimit: Number(input.dailyRunLimit),
  }
}

async function own(client: Queryable, organizationId: string, missionId: string, entityType: string, entityId: string, role: string, allowedActionKeys: string[]) {
  await acquireMissionOwnership(client, { organizationId, missionId, entityType, entityId, role, mode: 'exclusive', conflictPolicy: 'mission_wins', allowedActionKeys })
}

function deterministicUuid(seed: string): string {
  const hex = createHash('sha256').update(seed).digest('hex').slice(0, 32).split('')
  hex[12] = '4'
  hex[16] = ['8', '9', 'a', 'b'][Number.parseInt(hex[16], 16) % 4]
  const value = hex.join('')
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`
}

async function transaction<T>(pool: Connectable, work: (client: Queryable) => Promise<T>): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await work(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    await client.release()
  }
}
