import { z } from 'zod'
import type { CapabilityDefinition } from '../capability-registry.js'

const draftInput = z.object({ leadId: z.string().uuid(), channel: z.enum(['email','whatsapp']), objective: z.string().min(3).max(1000), evidenceIds: z.array(z.string()).max(50).default([]) })
const draftOutput = z.object({ preview: z.boolean(), draftId: z.string().uuid().optional(), channel: z.enum(['email','whatsapp']) })

export const omnichannelMessageDraft: CapabilityDefinition<z.infer<typeof draftInput>, z.infer<typeof draftOutput>> = {
  key: 'omnichannel.message.draft', version: 1, title: 'Preparar mensagem', description: 'Cria um artefato interno revisável sem enviar a mensagem.',
  risk: 'low', effect: 'internal', approval: 'risk_based', idempotency: 'required', inputSchema: draftInput, outputSchema: draftOutput,
  requiredModules: ['omnichannel'], requiredConnections: [],
  recovery: {
    kind: 'compensatable',
    async compensate(context, result) {
      if (!result.draftId) return { output: { recovered: true, reason: 'preview_only' }, effectProduced: false }
      const updated = await context.query<{ id: string }>(
        `UPDATE public.action_observations
         SET payload = payload || '{"status":"discarded"}'::jsonb
         WHERE id = $1 AND organization_id = $2 AND mission_id = $3
           AND observation_type = 'message_draft' RETURNING id`,
        [result.draftId, context.organizationId, context.missionId],
      )
      if (!updated.rows[0]) throw new Error('message_draft_recovery_target_not_found')
      return { output: { recovered: true, draftId: result.draftId }, effectProduced: true, sourceRecords: [{ type: 'message_draft', id: result.draftId }] }
    },
  },
  async execute(context, input) {
    if (context.dryRun) return { output: { preview: true, channel: input.channel }, effectProduced: false }
    const result = await context.query<{ id: string }>(
      `INSERT INTO public.action_observations (
         organization_id, mission_id, observation_type, idempotency_key, source_type, source_record_id, payload
       ) VALUES ($1,$2,'message_draft',$3,'lead',$4,$5)
       ON CONFLICT (idempotency_key) DO UPDATE SET idempotency_key = EXCLUDED.idempotency_key RETURNING id`,
      [context.organizationId, context.missionId, context.idempotencyKey, input.leadId,
        { leadId: input.leadId, evidenceIds: input.evidenceIds, objective: input.objective, channel: input.channel, status: 'draft' }],
    )
    if (!result.rows[0]) throw new Error('message_draft_not_created')
    return { output: { preview: false, draftId: result.rows[0].id, channel: input.channel }, effectProduced: true, sourceRecords: [{ type: 'message_draft', id: result.rows[0].id }] }
  },
}

const sequenceInput = z.object({ leadId: z.string().uuid(), sequenceId: z.string().uuid(), existingEnrollment: z.enum(['skip','resume','restart']).default('skip') })
const sequenceOutput = z.object({ preview: z.boolean(), enrollmentId: z.string().uuid().optional() })

export const crmSequenceEnroll: CapabilityDefinition<z.infer<typeof sequenceInput>, z.infer<typeof sequenceOutput>> = {
  key: 'crm.sequence.enroll', version: 1, title: 'Inscrever em cadência', description: 'Agenda uma cadência publicada usando o command idempotente do CRM.',
  risk: 'high', effect: 'external', approval: 'always', idempotency: 'required', inputSchema: sequenceInput, outputSchema: sequenceOutput,
  requiredModules: ['crm','automations'], requiredConnections: [],
  recovery: {
    kind: 'pausable',
    async contain(context, result) {
      if (!result.enrollmentId) return { output: { contained: true, reason: 'preview_only' }, effectProduced: false }
      if (!context.commands?.pauseSequenceEnrollment) throw new Error('capability_recovery_command_unavailable')
      await context.commands.pauseSequenceEnrollment({ enrollmentId: result.enrollmentId, organizationId: context.organizationId, missionId: context.missionId })
      return { output: { contained: true, enrollmentId: result.enrollmentId }, effectProduced: true, sourceRecords: [{ type: 'sequence_enrollment', id: result.enrollmentId }] }
    },
  },
  async execute(context, input) {
    if (context.dryRun) return { output: { preview: true }, effectProduced: false }
    if (!context.commands?.enrollSequence) throw new Error('capability_command_unavailable')
    const result = await context.commands.enrollSequence({ ...input, organizationId: context.organizationId, missionId: context.missionId, idempotencyKey: context.idempotencyKey }) as { enrollmentId?: string }
    if (!result.enrollmentId) throw new Error('capability_command_result_invalid')
    return { output: { preview: false, enrollmentId: result.enrollmentId }, effectProduced: true, sourceRecords: [{ type: 'sequence_enrollment', id: result.enrollmentId }] }
  },
}

const emailInput = z.object({
  leadId: z.string().uuid(), templateId: z.string().uuid(), to: z.string().email(),
  variables: z.record(z.string(), z.string()).default({}), consentEvidenceId: z.string().uuid(), suppressionCheckedAt: z.string().datetime(),
})
const emailOutput = z.object({ preview: z.boolean(), requestId: z.string().uuid().optional(), deepLink: z.string().optional() })

export const emailMessageQueue: CapabilityDefinition<z.infer<typeof emailInput>, z.infer<typeof emailOutput>> = {
  key: 'email.message.queue', version: 1, title: 'Enfileirar e-mail aprovado', description: 'Enfileira mensagem externa após consentimento, suppression e template publicado.',
  risk: 'high', effect: 'external', approval: 'always', idempotency: 'required', inputSchema: emailInput, outputSchema: emailOutput,
  requiredModules: ['crm','email'], requiredConnections: ['email'],
  recovery: { kind: 'irreversible', incidentType: 'email_dispatch_accepted' },
  async execute(context, input) {
    if (context.dryRun) return { output: { preview: true }, effectProduced: false }
    if (!context.commands?.queueEmail) throw new Error('capability_command_unavailable')
    const result = await context.commands.queueEmail({ ...input, organizationId: context.organizationId, missionId: context.missionId, idempotencyKey: context.idempotencyKey }) as { requestId?: string }
    if (!result.requestId) throw new Error('capability_command_result_invalid')
    return { output: { preview: false, requestId: result.requestId, deepLink: `/crm/leads/${input.leadId}` }, effectProduced: true,
      sourceRecords: [{ type: 'email_request', id: result.requestId }], costHints: [{ category: 'provider', amount: '0', currency: 'BRL' }] }
  },
}

const whatsappInput = z.object({
  leadId: z.string().uuid(), connectionId: z.string().uuid(), templateName: z.string().min(1), templateLanguage: z.string().min(2),
  to: z.string().regex(/^\d{10,15}$/), components: z.array(z.record(z.string(), z.unknown())).default([]),
  consentEvidenceId: z.string().uuid(), suppressionCheckedAt: z.string().datetime(), templateApproved: z.literal(true),
})
const whatsappOutput = z.object({ preview: z.boolean(), messageId: z.string().uuid().optional(), deepLink: z.string().optional() })

export const whatsappTemplateQueue: CapabilityDefinition<z.infer<typeof whatsappInput>, z.infer<typeof whatsappOutput>> = {
  key: 'whatsapp.template.queue', version: 1, title: 'Enfileirar template WhatsApp', description: 'Enfileira somente template aprovado e com evidência de permissão.',
  risk: 'high', effect: 'external', approval: 'always', idempotency: 'required', inputSchema: whatsappInput, outputSchema: whatsappOutput,
  requiredModules: ['omnichannel'], requiredConnections: ['whatsapp'],
  recovery: { kind: 'irreversible', incidentType: 'whatsapp_dispatch_accepted' },
  async execute(context, input) {
    if (context.dryRun) return { output: { preview: true }, effectProduced: false }
    if (!context.commands?.queueWhatsapp) throw new Error('capability_command_unavailable')
    const result = await context.commands.queueWhatsapp({ ...input, organizationId: context.organizationId, missionId: context.missionId, idempotencyKey: context.idempotencyKey }) as { messageId?: string }
    if (!result.messageId) throw new Error('capability_command_result_invalid')
    return { output: { preview: false, messageId: result.messageId, deepLink: `/crm/leads/${input.leadId}` }, effectProduced: true,
      sourceRecords: [{ type: 'message', id: result.messageId }], costHints: [{ category: 'provider', amount: '0', currency: 'BRL' }] }
  },
}
