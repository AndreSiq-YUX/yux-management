import { z } from 'zod'
import { noEffectRecovery, type CapabilityDefinition } from '../capability-registry.js'

const readinessInput = z.object({
  contractId: z.string().uuid().optional(),
  requiredModules: z.array(z.string().min(1)).default([]),
  requiredConnections: z.array(z.string().min(1)).default([]),
})

const readinessOutput = z.object({
  ready: z.boolean(),
  checks: z.array(z.object({ key: z.string(), status: z.enum(['ready', 'missing', 'degraded']), detail: z.string() })),
})

export const systemReadinessCheck: CapabilityDefinition<z.infer<typeof readinessInput>, z.infer<typeof readinessOutput>> = {
  key: 'system.readiness.check',
  version: 1,
  title: 'Verificar prontidão',
  description: 'Confirma organização, CRM, módulos contratados e conexões exigidas antes do planejamento.',
  risk: 'read_only',
  effect: 'none',
  approval: 'never',
  idempotency: 'none',
  inputSchema: readinessInput,
  outputSchema: readinessOutput,
  requiredModules: [],
  requiredConnections: [],
  recovery: noEffectRecovery(),
  async execute(context, input) {
    const checks: z.infer<typeof readinessOutput>['checks'] = []
    const organization = await context.query<{ id: string }>(
      `SELECT id FROM public.organizations WHERE id = $1 LIMIT 1`,
      [context.organizationId],
    )
    checks.push({ key: 'organization', status: organization.rows[0] ? 'ready' : 'missing', detail: organization.rows[0] ? 'Organização encontrada.' : 'Organização ausente.' })

    if (input.requiredModules.some((moduleKey) => ['crm','automations','funnel_nurture_agent'].includes(moduleKey))) {
      const crm = await context.query<{ id: string }>(
        `SELECT id FROM public.crm_instances WHERE organization_id = $1 AND status = 'active' LIMIT 1`,
        [context.organizationId],
      )
      checks.push({ key: 'crm', status: crm.rows[0] ? 'ready' : 'missing', detail: crm.rows[0] ? 'CRM ativo.' : 'CRM ativo não encontrado.' })
    }

    for (const moduleKey of input.requiredModules) {
      const module = await context.query<{ module_key: string }>(
        `SELECT $2::TEXT AS module_key FROM public.organizations organization
         WHERE organization.id = $1 AND (organization.kind = 'yux' OR EXISTS (
           SELECT 1 FROM public.contract_modules cm JOIN public.contracts contract ON contract.id = cm.contract_id
           WHERE contract.client_id = organization.client_id AND cm.module_key = $2 AND cm.enabled = TRUE
             AND contract.status = 'active' AND ($3::UUID IS NULL OR contract.id = $3)
         )) LIMIT 1`,
        [context.organizationId, moduleKey, input.contractId ?? null],
      )
      checks.push({ key: `module:${moduleKey}`, status: module.rows[0] ? 'ready' : 'missing', detail: module.rows[0] ? 'Módulo habilitado.' : 'Módulo não contratado ou desabilitado.' })
    }

    for (const connectionKey of input.requiredConnections) {
      const connection = connectionKey === 'ads_provider'
        ? await context.query<{ id: string }>(
          `SELECT id FROM public.ad_provider_connections
           WHERE organization_id = $1 AND status = 'connected' LIMIT 1`,
          [context.organizationId],
        )
        : await context.query<{ id: string }>(
          `SELECT id FROM public.channel_connections
           WHERE organization_id = $1 AND channel = $2 AND is_active = TRUE LIMIT 1`,
          [context.organizationId, connectionKey],
        )
      checks.push({ key: `connection:${connectionKey}`, status: connection.rows[0] ? 'ready' : 'missing', detail: connection.rows[0] ? 'Conexão ativa.' : 'Conexão ativa não encontrada.' })
    }
    return { output: { ready: checks.every((check) => check.status === 'ready'), checks }, effectProduced: false }
  },
}

const approvalInput = z.object({ approvalType: z.enum(['plan', 'population', 'canary', 'external_effect', 'replan']), subject: z.record(z.string(), z.unknown()).default({}) })
const approvalOutput = z.object({ awaitingApproval: z.literal(true), approvalType: approvalInput.shape.approvalType })

export const systemApprovalAwait: CapabilityDefinition<z.infer<typeof approvalInput>, z.infer<typeof approvalOutput>> = {
  key: 'system.approval.await', version: 1, title: 'Aguardar aprovação',
  description: 'Checkpoint intrínseco do Action Engine; o executor persiste a aprovação e suspende o passo.',
  risk: 'low', effect: 'internal', approval: 'always', idempotency: 'required', inputSchema: approvalInput, outputSchema: approvalOutput,
  requiredModules: [], requiredConnections: [],
  recovery: noEffectRecovery(),
  async execute(_context, input) {
    return { output: { awaitingApproval: true, approvalType: input.approvalType }, effectProduced: false }
  },
}

const waitInput = z.object({ durationHours: z.number().positive().max(24 * 90).default(24) })
const waitOutput = z.object({ waitUntil: z.string().datetime() })

export const systemSignalWait: CapabilityDefinition<z.infer<typeof waitInput>, z.infer<typeof waitOutput>> = {
  key: 'system.signal.wait', version: 1, title: 'Aguardar sinais', description: 'Calcula o próximo checkpoint durável sem manter processo aberto.',
  risk: 'read_only', effect: 'none', approval: 'never', idempotency: 'none', inputSchema: waitInput, outputSchema: waitOutput,
  requiredModules: [], requiredConnections: [],
  recovery: noEffectRecovery(),
  async execute(_context, input) {
    return { output: { waitUntil: new Date(Date.now() + input.durationHours * 3_600_000).toISOString() }, effectProduced: false }
  },
}

const evaluateInput = z.object({ checkpointKey: z.string().min(1), targetRevenueBrl: z.string().regex(/^\d+(\.\d{1,2})?$/) })
const evaluateOutput = z.object({ evaluationRequested: z.literal(true), checkpointKey: z.string() })

export const systemEvaluationCheckpoint: CapabilityDefinition<z.infer<typeof evaluateInput>, z.infer<typeof evaluateOutput>> = {
  key: 'system.evaluation.checkpoint', version: 1, title: 'Avaliar checkpoint', description: 'Solicita ao avaliador determinístico uma fotografia de outcome e economia.',
  risk: 'read_only', effect: 'none', approval: 'never', idempotency: 'required', inputSchema: evaluateInput, outputSchema: evaluateOutput,
  requiredModules: [], requiredConnections: [],
  recovery: noEffectRecovery(),
  async execute(_context, input) {
    return { output: { evaluationRequested: true, checkpointKey: input.checkpointKey }, effectProduced: false }
  },
}
