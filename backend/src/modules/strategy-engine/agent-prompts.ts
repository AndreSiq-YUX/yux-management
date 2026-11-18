import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { requireAdminRole } from '../../http/guards.js'
import { ApiError } from '../../http/errors.js'
import { invokeAgentRuntime } from '../../lib/agent-runtime-client.js'
import { buildMissionTurnRequest } from '../action-engine/mission-turn-request.js'
import { getMission, type Queryable } from '../action-engine/repository.js'
import { buildMissionPlanningCatalog, buildMissionPlanningContext, buildMissionPlanRequest, getMissionPlanningLimits } from '../action-engine/mission-plan-request.js'
import { toMissionPlanWire } from '../action-engine/planner.js'
import { changeMissionPromptVersion, intakePromptScope, listMissionPromptVersions, missionPromptConfiguration,
  missionPromptPilotEnabled, missionPromptScopeSchema, missionPromptStageSchema,
  type MissionPromptVersion } from '../action-engine/mission-prompt-versions.js'
import { strategyAdminChatRequestSchema } from './admin-chat.js'
import { changePromptVersion, listPromptVersions, presalesPilotEnabled, promptInstructionSchema, promptSettings,
  stageKeySchema, strategistModeSchema } from './prompt-versions.js'
import { listPresalesLeads, loadCommercialCatalog } from './presales-context.js'

const inventory = [
  { key: 'strategist', name: 'Estrategista, Diagnóstico 48h e proposta consultiva', owner: 'Estratégia YUX', audience: 'Admin', state: 'Prévia disponível', instructions: 'Perfil, instruções globais e especialistas da especificação publicada' },
  { key: 'mission-intake', name: 'Action Engine · conversa da missão', owner: 'Operações YUX', audience: 'Portal e admin', state: 'Prévia disponível', instructions: 'Perfil Growth Strategist, contrato de conversa e contexto operacional' },
  { key: 'mission-supervisor', name: 'Action Engine · supervisor e planejamento', owner: 'Operações YUX', audience: 'Portal e admin', state: 'Prévia disponível', instructions: 'Instruções protegidas do supervisor e contexto do planejamento aprovado' },
  { key: 'omnichannel', name: 'Omnichannel · SDR, closer, suporte e retenção', owner: 'Atendimento', audience: 'Comprador', state: 'Herdado', instructions: 'Perfil por rota do assistente e prompt nas regras de segurança' },
  { key: 'radar', name: 'Radar · avaliação comercial', owner: 'Produto', audience: 'Admin', state: 'A migrar', instructions: 'Especificação e contrato do Radar no runtime' },
  { key: 'studio', name: 'Marketing Studio · pesquisa, escrita e curadoria', owner: 'Marketing', audience: 'Portal e admin', state: 'Herdado', instructions: 'Prompt global do Studio e instruções de cada etapa' },
  { key: 'automation', name: 'Automações · classificação, mensagem e proposta', owner: 'Operações YUX', audience: 'Operador ou comprador', state: 'A migrar', instructions: 'Prompt da automação e saída conforme a tarefa' },
  { key: 'proposal', name: 'CRM · montagem de documento comercial', owner: 'Comercial YUX', audience: 'Admin', state: 'Determinístico', instructions: 'Modelo, itens, condições e preços do CRM' },
]

const tenantSchema = z.object({
  organizationId: z.uuid(),
  contractId: z.uuid().optional(),
})
const scenarioMessage = z.string().trim().min(1).max(8_000)
const missionScenario = z.discriminatedUnion('flow', [
  z.object({
    flow: z.literal('mission-intake'), message: scenarioMessage,
    audience: z.enum(['internal_operator', 'client_user']),
    candidateStage: missionPromptStageSchema.optional(), candidateInstruction: promptInstructionSchema.optional(),
  }),
  z.object({
    flow: z.literal('mission-supervisor'), missionId: z.uuid(),
    candidateStage: missionPromptStageSchema.optional(), candidateInstruction: promptInstructionSchema.optional(),
  }),
])
type MissionScenario = z.infer<typeof missionScenario> & z.infer<typeof tenantSchema>
const previewRequest = tenantSchema.and(z.discriminatedUnion('flow', [
  z.object({
    flow: z.literal('strategist'),
    message: scenarioMessage,
    mode: strategyAdminChatRequestSchema.shape.mode,
    candidateInstruction: promptInstructionSchema.optional(),
    candidateStage: stageKeySchema.optional(),
  }),
  ...missionScenario.options,
]))
const versionMetadata = z.object({
  organizationId: z.uuid(),
  expectedVersion: z.number().int().nonnegative(),
  reason: z.string().trim().min(1).max(1000),
})
const versionChange = versionMetadata.and(z.object({
  flow: z.literal('strategist').optional(),
  promptScope: z.never().optional(),
})).and(z.discriminatedUnion('operation', [
  z.object({
    operation: z.literal('publish'),
    instruction: promptInstructionSchema,
    message: scenarioMessage,
    stage: stageKeySchema.optional(),
    contractId: z.uuid().optional(),
    mode: strategyAdminChatRequestSchema.shape.mode,
  }),
  z.object({ operation: z.literal('restore'), restoreVersion: z.number().int().nonnegative() }),
]))
const missionPublication = versionMetadata.and(tenantSchema).and(missionScenario).and(z.object({
  operation: z.literal('publish'), stage: missionPromptStageSchema, instruction: promptInstructionSchema,
}))
const missionRestore = versionMetadata.extend({
  operation: z.literal('restore'), promptScope: missionPromptScopeSchema, restoreVersion: z.number().int().nonnegative(),
})
const missionVersionChange = z.union([missionPublication, missionRestore])

type StrategistPreview = {
  candidate: { requests: Array<{ stage?: string; stageInstructionApplied?: boolean; fingerprint: string; providerFingerprint?: string }> }
}
type MissionPreview = { baseline: unknown; candidate?: StrategistPreview['candidate'] }

function missionScenarioScope(input: MissionScenario) {
  return input.flow === 'mission-supervisor' ? 'mission-planning' : intakePromptScope(input.audience)
}

async function previewMission(
  app: FastifyInstance, input: MissionScenario, actorId: string, version?: MissionPromptVersion,
) {
  if (input.candidateStage && ((input.flow === 'mission-intake') !== (input.candidateStage === 'synthesizer'))) {
    throw new ApiError(409, 'agent_prompt_stage_out_of_scope')
  }
  const publishedVersion = version?.version ?? 0
  const adjustments = {
    mission_prompt: missionPromptConfiguration(version),
    ...(input.candidateStage && input.candidateInstruction ? { candidate_adjustment: {
      stage: input.candidateStage, instruction: input.candidateInstruction, version: publishedVersion + 1,
    } } : {}),
  }
  let result: MissionPreview
  if (input.flow === 'mission-supervisor') {
    const mission = await getMission(app.pg, input.missionId, input.organizationId)
    if (!mission || (mission.contractId ?? null) !== (input.contractId ?? null)) {
      throw new ApiError(404, 'mission_preview_not_found')
    }
    const catalog = await buildMissionPlanningCatalog(app.pg, app.config, mission)
    const { planningContext } = await buildMissionPlanningContext(app.pg, mission, catalog, true)
    const payload = await buildMissionPlanRequest(
      app.pg, mission, catalog, planningContext, mission.status === 'pending_replan_approval', getMissionPlanningLimits(mission),
    )
    result = await invokeAgentRuntime<MissionPreview>(app.config, '/instructions/preview/mission-supervisor',
      { ...toMissionPlanWire(payload), ...adjustments })
  } else {
    const { request } = await buildMissionTurnRequest(app.pg, app.config, {
      actorId, preview: true, conversationId: 'preview', organizationId: input.organizationId,
      contractId: input.contractId, audience: input.audience, message: input.message, currentBrief: {},
      messages: [{ actorType: 'user', content: input.message }],
    })
    result = await invokeAgentRuntime<MissionPreview>(app.config, '/instructions/preview/mission-intake',
      { ...request, ...adjustments })
  }
  return { ...result, publishedVersion }
}

async function strategistPreview(app: FastifyInstance, input: {
  organizationId: string
  clientId: string | null
  contractId?: string
  message: string
  mode: z.infer<typeof strategistModeSchema>
  candidateInstruction?: string
  candidateStage?: string
  version?: Awaited<ReturnType<typeof listPromptVersions>>[number]
}) {
  const published = promptSettings(input.version, input.mode)
  const preview = await invokeAgentRuntime<StrategistPreview>(app.config, '/instructions/preview/strategist', {
    organization_id: input.organizationId,
    client_id: input.clientId,
    contract_id: input.contractId,
    message: input.message,
    mode: input.mode,
    candidate_instruction: input.candidateInstruction,
    candidate_stage: input.candidateStage,
    published_instruction: published.instruction,
    published_stage_instructions: published.stageInstructions,
    published_prompt_version: published.active ? input.version?.version : undefined,
    commercial_catalog: await loadCommercialCatalog(app.pg, input.organizationId),
  })
  return { ...preview, publishedVersion: input.version?.version ?? 0 }
}

export async function loadAgentPromptScope(pool: Queryable, organizationId: string) {
  const { rows } = await pool.query<{
    client_id: string | null
    contracts: Array<{ id: string; name: string }>
  }>(
    `SELECT o.client_id, COALESCE(
       (SELECT jsonb_agg(jsonb_build_object('id', c.id, 'name',
          COALESCE(NULLIF(btrim(c.name), ''), COALESCE(p.name, 'Contrato') || ' · ' || right(c.id::text, 8))
        ) ORDER BY c.name, c.id)
        FROM public.contracts c LEFT JOIN public.packages p ON p.id = c.package_id
        WHERE c.client_id = o.client_id AND c.status = 'active'),
       '[]'::jsonb
     ) AS contracts
     FROM public.organizations o WHERE o.id = $1`,
    [organizationId],
  )
  if (!rows[0]) throw new ApiError(404, 'agent_prompt_organization_not_found')
  return rows[0]
}

export async function registerAgentPromptRoutes(app: FastifyInstance) {
  app.get('/agent-prompts', async request => {
    requireAdminRole(request)
    return { consumers: inventory }
  })

  app.get('/agent-prompts/scope', async (request, reply) => {
    requireAdminRole(request)
    const query = tenantSchema.pick({ organizationId: true })
      .extend({ promptScope: missionPromptScopeSchema.optional() }).safeParse(request.query)
    if (!query.success) throw new ApiError(400, 'invalid_agent_prompt_scope')
    const { organizationId, promptScope } = query.data
    reply.header('Cache-Control', 'no-store')
    if (promptScope) {
      const [scope, versions] = await Promise.all([
        loadAgentPromptScope(app.pg, organizationId),
        listMissionPromptVersions(app.pg, organizationId, promptScope),
      ])
      return { contracts: scope.contracts, versions, pilotEnabled: missionPromptPilotEnabled(app.config, organizationId), catalog: [] }
    }
    const pilotEnabled = presalesPilotEnabled(app.config, organizationId)
    const [scope, versions, catalog] = await Promise.all([
      loadAgentPromptScope(app.pg, organizationId),
      listPromptVersions(app.pg, organizationId),
      app.pg.query<{ id: string; label: string; approved: boolean }>(
        `SELECT t.id, p.name || ' · ' || t.name AS label, t.presales_sellable AS approved
           FROM public.proposal_templates t JOIN public.organizations o ON o.id = t.organization_id
           JOIN public.packages p ON p.id = t.package_id
          WHERE t.organization_id = $1 AND t.is_active AND (o.kind = 'yux' OR $2::boolean) AND p.key <> 'yux_internal_growth'
            AND EXISTS (SELECT 1 FROM public.proposal_price_rules r
              WHERE r.organization_id = t.organization_id AND r.package_id = t.package_id AND r.item_key = 'base')
          ORDER BY label, t.id`,
        [organizationId, pilotEnabled],
      ),
    ])
    reply.header('Cache-Control', 'no-store')
    return { contracts: scope.contracts, versions, pilotEnabled, catalog: catalog.rows }
  })

  app.get('/agent-prompts/opportunities', async (request, reply) => {
    requireAdminRole(request)
    const parsed = tenantSchema.extend({ mode: strategistModeSchema.optional() }).safeParse(request.query)
    if (!parsed.success) throw new ApiError(400, 'invalid_presales_opportunity_scope')
    const { organizationId, contractId } = parsed.data
    const [scope, versions] = await Promise.all([
      loadAgentPromptScope(app.pg, organizationId),
      presalesPilotEnabled(app.config, organizationId) ? listPromptVersions(app.pg, organizationId, 1) : [],
    ])
    if (contractId && !scope.contracts.some(contract => contract.id === contractId)) {
      throw new ApiError(409, 'agent_prompt_contract_out_of_scope')
    }
    const enabled = promptSettings(versions[0], parsed.data.mode).active
    reply.header('Cache-Control', 'no-store')
    return { contracts: scope.contracts, enabled, leads: enabled ? await listPresalesLeads(app.pg, organizationId, contractId) : [] }
  })

  app.put('/agent-prompts/catalog', async request => {
    requireAdminRole(request)
    const parsed = z.object({ organizationId: z.uuid(), templateId: z.uuid(), approved: z.boolean() }).safeParse(request.body)
    if (!parsed.success) throw new ApiError(400, 'invalid_presales_catalog')
    const { organizationId, templateId, approved } = parsed.data
    try {
      const result = await app.pg.query(
        `UPDATE public.proposal_templates t SET presales_sellable = $3
         FROM public.packages p, public.organizations o
         WHERE t.organization_id = $1 AND t.id = $2 AND o.id = t.organization_id AND (o.kind = 'yux' OR $4::boolean)
           AND p.id = t.package_id AND p.key <> 'yux_internal_growth' AND t.is_active
           AND EXISTS (SELECT 1 FROM public.proposal_price_rules r
             WHERE r.organization_id = t.organization_id AND r.package_id = t.package_id AND r.item_key = 'base')`,
        [organizationId, templateId, approved, presalesPilotEnabled(app.config, organizationId)],
      )
      if (result.rowCount !== 1) throw new ApiError(409, 'presales_template_ineligible')
      return { approved }
    } catch (error) {
      if ((error as { code?: string }).code === '23505') throw new ApiError(409, 'presales_package_already_approved')
      throw error
    }
  })

  app.post('/agent-prompts/versions', async (request, reply) => {
    const actor = requireAdminRole(request)
    const missionChange = missionVersionChange.safeParse(request.body)
    if (missionChange.success) {
      const input = missionChange.data
      const scope = await loadAgentPromptScope(app.pg, input.organizationId)
      reply.header('Cache-Control', 'no-store')
      const shared = { ...input, authorId: actor.userId }
      if (input.operation === 'restore') {
        return changeMissionPromptVersion(app.pg, { ...shared, scope: input.promptScope, restoreVersion: input.restoreVersion })
      }
      if (input.contractId && !scope.contracts.some(contract => contract.id === input.contractId)) {
        throw new ApiError(409, 'agent_prompt_contract_out_of_scope')
      }
      const promptScope = missionScenarioScope(input)
      const [version] = await listMissionPromptVersions(app.pg, input.organizationId, promptScope, 1)
      if ((version?.version ?? 0) !== input.expectedVersion) throw new ApiError(409, 'agent_prompt_version_conflict')
      const preview = await previewMission(app, {
        ...input, candidateStage: input.stage, candidateInstruction: input.instruction,
      }, actor.userId, version)
      const matches = preview.candidate?.requests.filter(stage => stage.stage === input.stage) ?? []
      const fingerprint = matches[0]?.providerFingerprint
      if (matches.length !== 1 || !matches[0].stageInstructionApplied || !fingerprint || !/^[a-f0-9]{64}$/.test(fingerprint)) {
        throw new ApiError(409, 'agent_prompt_stage_not_simulated')
      }
      return changeMissionPromptVersion(app.pg, { ...shared, scope: promptScope, stage: input.stage,
        instruction: input.instruction, fingerprints: [fingerprint] })
    }
    const parsed = versionChange.safeParse(request.body)
    if (!parsed.success) throw new ApiError(400, 'invalid_agent_prompt_version')
    const input = parsed.data
    const scope = await loadAgentPromptScope(app.pg, input.organizationId)
    const shared = { ...input, authorId: actor.userId }
    reply.header('Cache-Control', 'no-store')
    if (input.operation === 'restore') return changePromptVersion(app.pg, { ...shared, restoreVersion: input.restoreVersion })

    if (input.contractId && !scope.contracts.some(contract => contract.id === input.contractId)) {
      throw new ApiError(409, 'agent_prompt_contract_out_of_scope')
    }
    const [version] = await listPromptVersions(app.pg, input.organizationId, 1)
    if ((version?.version ?? 0) !== input.expectedVersion) throw new ApiError(409, 'agent_prompt_version_conflict')
    const result = await strategistPreview(app, {
      ...input, clientId: scope.client_id, version,
      candidateInstruction: input.instruction, candidateStage: input.stage,
    })
    if (input.stage) {
      const matches = result.candidate.requests.filter(request => request.stage === input.stage)
      if (matches.length !== 1 || !matches[0].stageInstructionApplied) {
        throw new ApiError(409, 'agent_prompt_stage_not_simulated')
      }
    }
    const fingerprints = result.candidate.requests.map(stage => stage.providerFingerprint ?? stage.fingerprint)
    if (!fingerprints.length || fingerprints.some(hash => !/^[0-9a-f]{64}$/.test(hash))) {
      throw new ApiError(409, 'agent_prompt_simulation_required')
    }
    return changePromptVersion(app.pg, { ...shared, instruction: input.instruction, fingerprints,
      target: input.stage ? { mode: input.mode, stage: input.stage } : undefined })
  })

  app.get('/agent-prompts/missions', async (request, reply) => {
    requireAdminRole(request)
    const parsed = tenantSchema.safeParse(request.query)
    if (!parsed.success) throw new ApiError(400, 'invalid_mission_preview_scope')
    const { organizationId, contractId } = parsed.data
    const scope = await loadAgentPromptScope(app.pg, organizationId)
    if (contractId && !scope.contracts.some(contract => contract.id === contractId)) {
      throw new ApiError(409, 'agent_prompt_contract_out_of_scope')
    }
    const { rows } = await app.pg.query<{ id: string; title: string }>(
      `SELECT id, title FROM public.action_missions
       WHERE organization_id = $1 AND contract_id IS NOT DISTINCT FROM $2::uuid
         AND status NOT IN ('cancelled','expired','failed')
       ORDER BY updated_at DESC, id LIMIT 50`,
      [organizationId, contractId ?? null],
    )
    reply.header('Cache-Control', 'no-store')
    return { missions: rows }
  })

  app.post('/agent-prompts/preview', async (request, reply) => {
    const actor = requireAdminRole(request)
    const parsed = previewRequest.safeParse(request.body)
    if (!parsed.success) throw new ApiError(400, 'invalid_agent_prompt_preview')
    const input = parsed.data
    const scope = await loadAgentPromptScope(app.pg, input.organizationId)
    if (input.contractId && !scope.contracts.some(contract => contract.id === input.contractId)) {
      throw new ApiError(409, 'agent_prompt_contract_out_of_scope')
    }
    reply.header('Cache-Control', 'no-store')
    if (input.flow === 'strategist') {
      const [version] = await listPromptVersions(app.pg, input.organizationId, 1)
      return strategistPreview(app, { ...input, clientId: scope.client_id, version })
    }
    const [version] = await listMissionPromptVersions(app.pg, input.organizationId, missionScenarioScope(input), 1)
    return previewMission(app, input, actor.userId, version)
  })
}
