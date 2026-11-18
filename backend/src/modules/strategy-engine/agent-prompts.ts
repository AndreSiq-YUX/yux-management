import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { requireAdminRole } from '../../http/guards.js'
import { ApiError } from '../../http/errors.js'
import { invokeAgentRuntime } from '../../lib/agent-runtime-client.js'
import { buildMissionTurnRequest } from '../action-engine/mission-turn-request.js'
import type { Queryable } from '../action-engine/repository.js'
import { strategyAdminChatRequestSchema } from './admin-chat.js'
import { changePromptVersion, listPromptVersions, presalesPilotEnabled } from './prompt-versions.js'
import { listPresalesLeads, loadCommercialCatalog } from './presales-context.js'

const inventory = [
  { key: 'strategist', name: 'Estrategista, Diagnóstico 48h e proposta consultiva', owner: 'Estratégia YUX', audience: 'Admin', state: 'Prévia disponível', instructions: 'Perfil, instruções globais e especialistas da especificação publicada' },
  { key: 'mission-intake', name: 'Action Engine · conversa da missão', owner: 'Operações YUX', audience: 'Portal e admin', state: 'Prévia disponível', instructions: 'Perfil Growth Strategist, contrato de conversa e contexto operacional' },
  { key: 'mission-supervisor', name: 'Action Engine · supervisor e planejamento', owner: 'Operações YUX', audience: 'Portal e admin', state: 'A migrar', instructions: 'Instruções protegidas do supervisor. Especialistas de campanha e nutrição têm composição própria.' },
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
const previewRequest = tenantSchema.extend({
  message: z.string().trim().min(1).max(8_000),
}).and(z.discriminatedUnion('flow', [
  z.object({
    flow: z.literal('strategist'),
    mode: strategyAdminChatRequestSchema.shape.mode,
    candidateInstruction: z.string().trim().min(1).max(4_000).optional(),
  }),
  z.object({
    flow: z.literal('mission-intake'),
    audience: z.enum(['internal_operator', 'client_user']),
  }),
]))
const versionChange = z.object({
  organizationId: z.uuid(),
  expectedVersion: z.number().int().nonnegative(),
  reason: z.string().trim().min(1).max(1000),
}).and(z.discriminatedUnion('operation', [
  z.object({
    operation: z.literal('publish'),
    instruction: z.string().trim().min(1).max(4000),
    message: z.string().trim().min(1).max(8000),
    contractId: z.uuid().optional(),
    mode: strategyAdminChatRequestSchema.shape.mode,
  }),
  z.object({ operation: z.literal('restore'), restoreVersion: z.number().int().nonnegative() }),
]))

type StrategistPreview = {
  candidate: { requests: Array<{ fingerprint: string; providerFingerprint?: string }> }
}

export async function loadAgentPromptScope(pool: Queryable, organizationId: string) {
  const { rows } = await pool.query<{
    client_id: string | null
    contracts: Array<{ id: string; name: string }>
  }>(
    `SELECT o.client_id, COALESCE(
       (SELECT jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name) ORDER BY c.name, c.id)
        FROM public.contracts c WHERE c.client_id = o.client_id AND c.status = 'active'),
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
    const query = tenantSchema.pick({ organizationId: true }).safeParse(request.query)
    if (!query.success) throw new ApiError(400, 'invalid_agent_prompt_scope')
    const { organizationId } = query.data
    const [scope, versions, catalog] = await Promise.all([
      loadAgentPromptScope(app.pg, organizationId),
      listPromptVersions(app.pg, organizationId),
      app.pg.query<{ id: string; label: string; approved: boolean }>(
        `SELECT t.id, p.name || ' · ' || t.name AS label, t.presales_sellable AS approved
           FROM public.proposal_templates t JOIN public.organizations o ON o.id = t.organization_id
           JOIN public.packages p ON p.id = t.package_id
          WHERE t.organization_id = $1 AND t.is_active AND o.kind = 'yux' AND p.key <> 'yux_internal_growth'
            AND EXISTS (SELECT 1 FROM public.proposal_price_rules r
              WHERE r.organization_id = t.organization_id AND r.package_id = t.package_id AND r.item_key = 'base')
          ORDER BY label, t.id`,
        [organizationId],
      ),
    ])
    reply.header('Cache-Control', 'no-store')
    return { contracts: scope.contracts, versions, pilotEnabled: presalesPilotEnabled(app.config, organizationId), catalog: catalog.rows }
  })

  app.get('/agent-prompts/opportunities', async (request, reply) => {
    requireAdminRole(request)
    const parsed = tenantSchema.safeParse(request.query)
    if (!parsed.success) throw new ApiError(400, 'invalid_presales_opportunity_scope')
    const { organizationId, contractId } = parsed.data
    const [scope, versions] = await Promise.all([
      loadAgentPromptScope(app.pg, organizationId),
      presalesPilotEnabled(app.config, organizationId) ? listPromptVersions(app.pg, organizationId, 1) : [],
    ])
    if (contractId && !scope.contracts.some(contract => contract.id === contractId)) {
      throw new ApiError(409, 'agent_prompt_contract_out_of_scope')
    }
    const enabled = Boolean(versions[0]?.instruction)
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
         WHERE t.organization_id = $1 AND t.id = $2 AND o.id = t.organization_id AND o.kind = 'yux'
           AND p.id = t.package_id AND p.key <> 'yux_internal_growth' AND t.is_active
           AND EXISTS (SELECT 1 FROM public.proposal_price_rules r
             WHERE r.organization_id = t.organization_id AND r.package_id = t.package_id AND r.item_key = 'base')`,
        [organizationId, templateId, approved],
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
    const result = await invokeAgentRuntime<StrategistPreview>(app.config, '/instructions/preview/strategist', {
      organization_id: input.organizationId,
      client_id: scope.client_id,
      contract_id: input.contractId,
      message: input.message,
      mode: input.mode,
      candidate_instruction: input.instruction,
      commercial_catalog: await loadCommercialCatalog(app.pg, input.organizationId),
    })
    const fingerprints = result.candidate.requests.map(stage => stage.providerFingerprint ?? stage.fingerprint)
    if (!fingerprints.length || fingerprints.some(hash => !/^[0-9a-f]{64}$/.test(hash))) {
      throw new ApiError(409, 'agent_prompt_simulation_required')
    }
    return changePromptVersion(app.pg, { ...shared, instruction: input.instruction, fingerprints })
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
      return invokeAgentRuntime(app.config, '/instructions/preview/strategist', {
        organization_id: input.organizationId,
        client_id: scope.client_id,
        contract_id: input.contractId,
        message: input.message,
        mode: input.mode,
        candidate_instruction: input.candidateInstruction,
        commercial_catalog: await loadCommercialCatalog(app.pg, input.organizationId),
      })
    }
    const { request: turn } = await buildMissionTurnRequest(app.pg, app.config, {
      actorId: actor.userId,
      preview: true,
      conversationId: 'preview',
      organizationId: input.organizationId,
      contractId: input.contractId,
      audience: input.audience,
      message: input.message,
      currentBrief: {},
      messages: [{ actorType: 'user', content: input.message }],
    })
    return invokeAgentRuntime(app.config, '/instructions/preview/mission-intake', { ...turn })
  })
}
