import { z } from 'zod'
import { missionArtifactHash } from '../mission-command.js'
import { validateEmailTemplateDraft } from '../../emailTemplates/mission-commands.js'
import { validateAutomationFlowDraft, validateSequenceDraft } from '../../automations/mission-commands.js'
import { noEffectRecovery, type CapabilityContext, type CapabilityDefinition } from '../capability-registry.js'

const hashSchema = z.string().regex(/^[a-f0-9]{64}$/)
const uuidSchema = z.string().uuid()

const copyInput = z.object({
  name: z.string().trim().min(1).max(160), subject: z.string().trim().min(1).max(240),
  previewText: z.string().trim().min(1).max(300), bodyHtml: z.string().trim().min(1).max(100_000),
  bodyText: z.string().trim().min(1).max(100_000), sourceIds: z.array(uuidSchema).min(1).max(100),
  complianceNotes: z.array(z.string().trim().min(1).max(500)).min(1).max(50),
  forbiddenTerms: z.array(z.string().trim().min(1).max(120)).max(100).default([]),
}).superRefine((value, issue) => {
  if (new Set(value.sourceIds).size !== value.sourceIds.length) issue.addIssue({ code: 'custom', message: 'email_template_citations_duplicate', path: ['sourceIds'] })
  const combined = `${value.subject}\n${value.previewText}\n${value.bodyHtml}\n${value.bodyText}`.toLocaleLowerCase('pt-BR')
  const forbidden = value.forbiddenTerms.find((term) => combined.includes(term.toLocaleLowerCase('pt-BR')))
  if (forbidden) issue.addIssue({ code: 'custom', message: 'email_template_forbidden_vocabulary', path: ['forbiddenTerms'] })
  if (!value.bodyHtml.includes('{{unsubscribe_url}}') || !value.bodyText.includes('{{unsubscribe_url}}')) {
    issue.addIssue({ code: 'custom', message: 'email_template_unsubscribe_required', path: ['bodyHtml'] })
  }
})

const sequenceStep = z.object({
  templateVersionId: uuidSchema, delayMinutes: z.number().int().min(0).max(525_600),
  exitConditions: z.array(z.string().trim().min(1).max(120)).max(20),
})
const sequenceInput = z.object({
  name: z.string().trim().min(1).max(160), description: z.string().trim().max(2000).optional(),
  conversionGoal: z.string().trim().max(500).optional(), steps: z.array(sequenceStep).min(1).max(12),
}).superRefine((value, issue) => {
  if (value.steps.some((step, index) => index > 0 && step.delayMinutes === 0)) issue.addIssue({ code: 'custom', message: 'sequence_delay_invalid', path: ['steps'] })
  if (new Set(value.steps.map((step) => step.templateVersionId)).size !== value.steps.length) issue.addIssue({ code: 'custom', message: 'sequence_template_duplicate', path: ['steps'] })
})

const conditionSchema = z.object({
  field: z.string().trim().min(1).max(120),
  operator: z.enum(['equals', 'not_equals', 'contains', 'greater_than', 'less_than', 'exists']), value: z.unknown().optional(),
})
const triggerSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('lead.created') }),
  z.object({ type: z.literal('lead.stage_changed'), pipelineId: uuidSchema, stageId: uuidSchema }),
  z.object({ type: z.literal('lead.field_changed'), field: z.string().trim().min(1).max(120) }),
])
const flowInput = z.object({
  name: z.string().trim().min(1).max(160), description: z.string().trim().max(2000).optional(), trigger: triggerSchema,
  eligibilityConditions: z.array(conditionSchema).max(30), sequenceVersionId: uuidSchema,
  exitConditions: z.array(z.string().trim().min(1).max(120)).min(1).max(20),
  consentPolicy: z.literal('require_granted'), suppressionPolicy: z.literal('check_before_enrollment'),
  dailyRunLimit: z.number().int().min(1).max(10_000),
})

const draftOutput = z.object({
  preview: z.boolean(), entityId: uuidSchema.optional(), templateId: uuidSchema.optional(), sequenceId: uuidSchema.optional(), flowId: uuidSchema.optional(), versionId: uuidSchema.optional(), contentHash: hashSchema,
  status: z.literal('draft').optional(), activated: z.literal(false), existingEnrollments: z.number().int().min(0).optional(),
})
const publishOutput = z.object({
  preview: z.boolean(), entityId: uuidSchema.optional(), templateId: uuidSchema.optional(), sequenceId: uuidSchema.optional(), flowId: uuidSchema.optional(), versionId: uuidSchema.optional(), contentHash: hashSchema,
  status: z.literal('published').optional(), activated: z.boolean(), existingEnrollments: z.number().int().min(0).optional(),
})
const exactVersionInput = z.object({ entityId: uuidSchema, versionId: uuidSchema.optional(), expectedContentHash: hashSchema })
const templateExactInput = z.object({ templateId: uuidSchema, expectedContentHash: hashSchema })

type MissionResult = { entityId: string; versionId?: string; status: string; contentHash: string; evidence: Record<string, unknown> }

const common = {
  requiredConnections: [] as string[], supportsModes: ['shadow', 'prepare', 'assisted', 'autonomous'] as const,
  readiness: async () => ({ ready: true, blockers: [] }),
}

export const emailTemplatesInspect: CapabilityDefinition = {
  key: 'email.templates.inspect', version: 1, title: 'Inspecionar templates de e-mail',
  description: 'Lista templates e versões publicadas disponíveis para a organização.', risk: 'read_only', effect: 'none',
  approval: 'never', idempotency: 'none', inputSchema: z.object({ limit: z.number().int().min(1).max(200).default(50) }),
  outputSchema: z.object({ templates: z.array(z.object({ id: uuidSchema, name: z.string(), status: z.string(), contentHash: hashSchema.nullable(), publishedVersionId: uuidSchema.nullable() })) }),
  requiredModules: ['crm', 'automations'], domain: 'email', requiredPermissions: ['email.read'], ...common, recovery: noEffectRecovery(),
  async execute(context, input) {
    const result = await context.query<{ id: string; name: string; status: string; content_hash: string | null; published_version_id: string | null }>(
      `SELECT id,name,status,content_hash,published_version_id FROM public.email_templates
        WHERE organization_id=$1 AND scope='organization' ORDER BY updated_at DESC LIMIT $2`,
      [context.organizationId, (input as { limit: number }).limit],
    )
    return { output: { templates: result.rows.map(row => ({ id: row.id, name: row.name, status: row.status, contentHash: row.content_hash, publishedVersionId: row.published_version_id })) }, effectProduced: false }
  },
}

export const emailTemplateCreateDraft: CapabilityDefinition = {
  key: 'email.template.create_draft', version: 1, title: 'Criar rascunho de e-mail',
  description: 'Persiste copy citada e validada sem publicá-la.', risk: 'low', effect: 'draft', approval: 'never', idempotency: 'required',
  inputSchema: copyInput, outputSchema: draftOutput, requiredModules: ['crm', 'automations'], domain: 'email', requiredPermissions: ['email.write'], ...common,
  recovery: draftRecovery('archiveEmailTemplate', 'email_template'),
  async execute(context, raw) {
    const input = raw as z.infer<typeof copyInput>; const artifact = normalizedCopy(input); const contentHash = missionArtifactHash(artifact)
    if (context.dryRun) return { output: { preview: true, contentHash, activated: false }, effectProduced: false }
    const result = await invokeCommand(context, 'createEmailTemplateDraft', artifact)
    return { output: { preview: false, entityId: result.entityId, templateId: result.entityId, contentHash: result.contentHash, status: 'draft', activated: false }, effectProduced: true, sourceRecords: [{ type: 'email_template', id: result.entityId }] }
  },
}

export const emailTemplatePublish: CapabilityDefinition = publication({
  key: 'email.template.publish', title: 'Publicar template de e-mail', domain: 'email', modules: ['crm', 'automations'], permission: 'email.write',
  inputSchema: templateExactInput, command: 'publishEmailTemplate', entityType: 'email_template', inputMap: (input) => input, containCommand: 'archiveEmailTemplate',
})

export const crmSequenceCreateDraft: CapabilityDefinition = {
  key: 'crm.sequence.create_draft', version: 1, title: 'Criar rascunho de sequência',
  description: 'Cria uma sequência que referencia versões imutáveis dos templates.', risk: 'low', effect: 'draft', approval: 'never', idempotency: 'required',
  inputSchema: sequenceInput, outputSchema: draftOutput, requiredModules: ['crm', 'automations'], domain: 'crm', requiredPermissions: ['automation.write'], ...common,
  recovery: draftRecovery('archiveSequence', 'crm_sequence'),
  async execute(context, raw) {
    const artifact = validateSequenceDraft(raw as z.infer<typeof sequenceInput>); const contentHash = missionArtifactHash(artifact)
    if (context.dryRun) return { output: { preview: true, contentHash, activated: false, existingEnrollments: 0 }, effectProduced: false }
    const result = await invokeCommand(context, 'createSequenceDraft', artifact)
    return { output: { preview: false, entityId: result.entityId, sequenceId: result.entityId, versionId: result.versionId, contentHash: result.contentHash, status: 'draft', activated: false, existingEnrollments: 0 }, effectProduced: true, sourceRecords: [{ type: 'crm_sequence', id: result.entityId }, { type: 'crm_sequence_version', id: result.versionId! }] }
  },
}

const sequenceExactInput = z.object({ sequenceId: uuidSchema, versionId: uuidSchema, expectedContentHash: hashSchema })
const simulationOutput = z.object({
  entityId: uuidSchema, versionId: uuidSchema.optional(), contentHash: hashSchema, ready: z.boolean(), providerReady: z.boolean(),
  consentPolicyReady: z.boolean().optional(), suppressionPolicyReady: z.boolean().optional(), existingEnrollments: z.literal(0),
  activationPerformed: z.literal(false), blockers: z.array(z.string()),
})

export const crmSequenceSimulate: CapabilityDefinition = {
  key: 'crm.sequence.simulate', version: 1, title: 'Simular sequência de nutrição', description: 'Valida provider e estrutura sem inscrever leads.',
  risk: 'read_only', effect: 'none', approval: 'never', idempotency: 'none', inputSchema: sequenceExactInput, outputSchema: simulationOutput,
  requiredModules: ['crm', 'automations'], domain: 'crm', requiredPermissions: ['automation.read'], ...common, recovery: noEffectRecovery(),
  async execute(context, input) {
    const result = await invokeCommand(context, 'simulateSequenceDraft', input as Record<string, unknown>, false)
    const providerReady = result.evidence.providerReady === true; const blockers = providerReady ? [] : ['email_provider_unavailable']
    return { output: { entityId: result.entityId, versionId: (input as { versionId: string }).versionId, contentHash: result.contentHash, ready: providerReady, providerReady, existingEnrollments: 0, activationPerformed: false, blockers }, effectProduced: false }
  },
}

export const crmSequencePublish: CapabilityDefinition = publication({
  key: 'crm.sequence.publish', title: 'Publicar sequência de nutrição', domain: 'crm', modules: ['crm', 'automations'], permission: 'automation.write',
  inputSchema: sequenceExactInput, command: 'publishSequence', entityType: 'crm_sequence', inputMap: (input) => input, containCommand: 'archiveSequence',
})

export const automationFlowCreateDraft: CapabilityDefinition = {
  key: 'automation.flow.create_draft', version: 1, title: 'Criar gatilho de entrada na nutrição',
  description: 'Prepara um fluxo futuro com consentimento e suppression obrigatórios.', risk: 'low', effect: 'draft', approval: 'never', idempotency: 'required',
  inputSchema: flowInput, outputSchema: draftOutput, requiredModules: ['crm', 'automations'], domain: 'automation', requiredPermissions: ['automation.write'], ...common,
  recovery: draftRecovery('archiveAutomationFlow', 'automation_flow'),
  async execute(context, raw) {
    const artifact = validateAutomationFlowDraft(raw as z.infer<typeof flowInput>); const contentHash = missionArtifactHash(artifact)
    if (context.dryRun) return { output: { preview: true, contentHash, activated: false, existingEnrollments: 0 }, effectProduced: false }
    const result = await invokeCommand(context, 'createAutomationFlowDraft', artifact)
    return { output: { preview: false, entityId: result.entityId, flowId: result.entityId, versionId: result.versionId, contentHash: result.contentHash, status: 'draft', activated: false, existingEnrollments: 0 }, effectProduced: true, sourceRecords: [{ type: 'automation_flow', id: result.entityId }, { type: 'automation_flow_version', id: result.versionId! }] }
  },
}

const flowExactInput = z.object({ flowId: uuidSchema, versionId: uuidSchema, expectedContentHash: hashSchema })
export const automationFlowSimulate: CapabilityDefinition = {
  key: 'automation.flow.simulate', version: 1, title: 'Simular gatilho de nutrição', description: 'Executa preflight de provider, consentimento e suppression sem ativar nem inscrever.',
  risk: 'read_only', effect: 'none', approval: 'never', idempotency: 'none', inputSchema: flowExactInput, outputSchema: simulationOutput,
  requiredModules: ['crm', 'automations'], domain: 'automation', requiredPermissions: ['automation.read'], ...common, recovery: noEffectRecovery(),
  async execute(context, input) {
    const result = await invokeCommand(context, 'simulateAutomationFlow', input as Record<string, unknown>, false)
    const evidence = result.evidence; const blockers = Array.isArray(evidence.blockers) ? evidence.blockers.filter((item): item is string => typeof item === 'string') : []
    return { output: { entityId: result.entityId, versionId: result.versionId, contentHash: result.contentHash, ready: blockers.length === 0,
      providerReady: evidence.providerReady === true, consentPolicyReady: evidence.consentPolicyReady === true,
      suppressionPolicyReady: evidence.suppressionPolicyReady === true, existingEnrollments: 0, activationPerformed: false, blockers }, effectProduced: false }
  },
}

export const automationFlowPublish: CapabilityDefinition = publication({
  key: 'automation.flow.publish', title: 'Publicar gatilho de nutrição', domain: 'automation', modules: ['crm', 'automations'], permission: 'automation.write',
  inputSchema: flowExactInput, command: 'publishAutomationFlow', entityType: 'automation_flow', inputMap: (input) => input, containCommand: 'archiveAutomationFlow',
})

function normalizedCopy(input: z.infer<typeof copyInput>) {
  return validateEmailTemplateDraft({ name: input.name, subject: input.subject, preheader: input.previewText, bodyHtml: input.bodyHtml, bodyText: input.bodyText, sourceIds: input.sourceIds, complianceNotes: input.complianceNotes })
}

function publication(config: {
  key: string; title: string; domain: string; modules: string[]; permission: string; command: keyof NonNullable<CapabilityContext['commands']>;
  entityType: string; inputMap: (input: Record<string, unknown>) => Record<string, unknown>; containCommand: keyof NonNullable<CapabilityContext['commands']>;
  inputSchema?: z.ZodType
}): CapabilityDefinition {
  return {
    key: config.key, version: 1, title: config.title, description: 'Publica somente o artefato e hash exatos aprovados.',
    risk: 'medium', effect: 'internal', approval: 'always', idempotency: 'required', inputSchema: config.inputSchema ?? exactVersionInput,
    outputSchema: publishOutput, requiredModules: config.modules, domain: config.domain, requiredPermissions: [config.permission], ...common,
    recovery: {
      kind: 'pausable', async contain(context, result) {
        const entityId = (result as { entityId?: string }).entityId
        if (!entityId) return { output: { contained: true, reason: 'preview_only' }, effectProduced: false }
        await invokeRawCommand(context, config.containCommand, { entityId })
        return { output: { contained: true, entityId }, effectProduced: true, sourceRecords: [{ type: config.entityType, id: entityId }] }
      },
    },
    async execute(context, raw) {
      const input = raw as Record<string, unknown>
      const requestedId = String(input.entityId ?? input.templateId ?? input.sequenceId ?? input.flowId)
      const namedId = publicationIdentity(config.entityType, requestedId)
      if (context.dryRun) return { output: { preview: true, entityId: requestedId, ...namedId, versionId: typeof input.versionId === 'string' ? input.versionId : undefined, contentHash: String(input.expectedContentHash), activated: false, existingEnrollments: config.entityType === 'email_template' ? undefined : 0 }, effectProduced: false }
      const result = await invokeCommand(context, config.command, config.inputMap(input))
      return { output: { preview: false, entityId: result.entityId, ...publicationIdentity(config.entityType, result.entityId), versionId: result.versionId, contentHash: result.contentHash, status: 'published', activated: true, existingEnrollments: config.entityType === 'email_template' ? undefined : 0 }, effectProduced: true, sourceRecords: [{ type: config.entityType, id: result.entityId }, ...(result.versionId ? [{ type: `${config.entityType}_version`, id: result.versionId }] : [])] }
    },
  }
}

function publicationIdentity(entityType: string, id: string) {
  if (entityType === 'email_template') return { templateId: id }
  if (entityType === 'crm_sequence') return { sequenceId: id }
  return { flowId: id }
}

function draftRecovery(command: keyof NonNullable<CapabilityContext['commands']>, entityType: string) {
  return {
    kind: 'compensatable' as const,
    async compensate(context: CapabilityContext, result: unknown) {
      const entityId = (result as { entityId?: string }).entityId
      if (!entityId) return { output: { recovered: true, reason: 'preview_only' }, effectProduced: false }
      await invokeRawCommand(context, command, { entityId })
      return { output: { recovered: true, entityId }, effectProduced: true, sourceRecords: [{ type: entityType, id: entityId }] }
    },
  }
}

async function invokeCommand(context: CapabilityContext, command: keyof NonNullable<CapabilityContext['commands']>, input: Record<string, unknown>, requireExecutionContext = true): Promise<MissionResult> {
  return await invokeRawCommand(context, command, input, requireExecutionContext) as MissionResult
}

async function invokeRawCommand(context: CapabilityContext, command: keyof NonNullable<CapabilityContext['commands']>, input: Record<string, unknown>, requireExecutionContext = true) {
  const handler = context.commands?.[command]
  if (!handler) throw new Error('capability_command_unavailable')
  const actorId = context.actor.id
  if (requireExecutionContext && !context.actionRunId) throw new Error('capability_action_run_required')
  if (requireExecutionContext && !actorId) throw new Error('capability_actor_required')
  return handler({ ...input, organizationId: context.organizationId, missionId: context.missionId,
    ...(context.actionRunId ? { actionRunId: context.actionRunId } : {}), ...(actorId ? { actorId } : {}), idempotencyKey: context.idempotencyKey })
}
