import { REVENUE_RECOVERY_PACK_V0 } from './packs/revenue-recovery-v0.js'
import { FUNNEL_NURTURE_PACK_V1 } from './packs/funnel-nurture-v1.js'
import { CAMPAIGN_LAUNCH_PACK_V1 } from './packs/campaign-launch-v1.js'
import type { CapabilityRegistry } from './capability-registry.js'
import type { Queryable } from './repository.js'
import type { MissionMode } from './types.js'

export type ReadinessCheck = {
  status: 'pass' | 'warn' | 'block'
  code: string
  message: string
  fixHref?: string
  capabilityKey?: string
}

export type MissionReadinessReport = {
  ready: boolean
  checks: ReadinessCheck[]
  availableChannels: Array<'human_task' | 'email' | 'whatsapp'>
}

export async function evaluateCapabilityReadiness(
  registry: CapabilityRegistry,
  input: {
    organizationId: string
    missionId: string
    mode: MissionMode
    allowedModules: string[]
    capabilityKey: string
    capabilityVersion: number
    capabilityInput: unknown
    healthyConnections: string[]
  },
): Promise<ReadinessCheck[]> {
  let capability
  try {
    capability = registry.get(input.capabilityKey, input.capabilityVersion)
  } catch {
    return [{ status: 'block', code: 'capability_not_registered', message: 'A capability solicitada não está disponível.' }]
  }
  const blockers: ReadinessCheck[] = []
  const supportedModes = capability.supportsModes ?? ['shadow','prepare','assisted','autonomous']
  if (!supportedModes.includes(input.mode)) {
    blockers.push({ status: 'block', code: 'capability_mode_unsupported', message: `A capability não suporta o modo ${input.mode}.` })
  }
  const modules = new Set(input.allowedModules)
  for (const moduleKey of capability.requiredModules) {
    if (!modules.has(moduleKey)) blockers.push({
      status: 'block', code: 'capability_module_unavailable', capabilityKey: capability.key,
      message: `O módulo ${moduleKey} é necessário para esta ação.`, fixHref: '/platform/contracts',
    })
  }
  const connections = new Set(input.healthyConnections)
  for (const connection of capability.requiredConnections) {
    if (!connections.has(connection)) blockers.push({
      status: 'block', code: 'capability_connection_unavailable', capabilityKey: capability.key,
      message: `A conexão ${connection} precisa estar ativa.`, fixHref: '/integrations',
    })
  }
  if (capability.readiness && blockers.length === 0) {
    const parsed = capability.inputSchema.safeParse(input.capabilityInput)
    if (!parsed.success) return [{ status: 'block', code: 'capability_input_invalid', message: 'Os parâmetros da ação são inválidos.' }]
    const custom = await capability.readiness({
      organizationId: input.organizationId, missionId: input.missionId,
      mode: input.mode, allowedModules: input.allowedModules,
    }, parsed.data)
    blockers.push(...custom.blockers.map((item) => ({ status: 'block' as const, ...item, capabilityKey: capability.key })))
  }
  return blockers.length > 0
    ? blockers
    : [{ status: 'pass', code: 'capability_ready', message: 'Capability disponível para o modo e contexto atuais.', capabilityKey: capability.key }]
}

export async function evaluateMissionReadiness(
  client: Queryable,
  input: {
    organizationId: string
    contractId?: string
    targetRevenueBrl: string
    deadlineAt: string
    maxTotalCostBrl: string
    maxHumanHours: string
    humanHourlyRateBrl: string
    agentHarnessHealthy: boolean
    mutationLeaseReady: boolean
    missionId?: string
    packKey?: 'revenue_recovery' | 'funnel_nurture' | 'campaign_launch'
    packKeys?: Array<'revenue_recovery' | 'funnel_nurture' | 'campaign_launch'>
  },
): Promise<MissionReadinessReport> {
  const checks: ReadinessCheck[] = []
  const selectedPackKeys = new Set(input.packKeys ?? (input.packKey ? [input.packKey] : [REVENUE_RECOVERY_PACK_V0.key]))
  const funnelNurture = selectedPackKeys.has(FUNNEL_NURTURE_PACK_V1.key)
  const campaignLaunch = selectedPackKeys.has(CAMPAIGN_LAUNCH_PACK_V1.key)
  const organization = await client.query<{ id: string; kind: string }>(
    `SELECT id, kind FROM public.organizations WHERE id = $1 LIMIT 1`, [input.organizationId],
  )
  checks.push(check(Boolean(organization.rows[0]), 'organization_valid', 'organization_missing', 'Organização válida.', 'Organização não encontrada.', '/platform/organizations'))

  let contractValid = organization.rows[0]?.kind === 'yux' && !input.contractId
  let moduleEnabled = contractValid
  let automationsEnabled = contractValid
  let funnelNurtureEnabled = contractValid
  let campaignsEnabled = contractValid
  let landingPagesEnabled = contractValid
  let campaignLaunchEnabled = contractValid
  if (input.contractId) {
    const contract = await client.query<{ id: string; action_engine_enabled: boolean; automations_enabled: boolean; funnel_nurture_enabled: boolean; campaigns_enabled: boolean; landing_pages_enabled: boolean; campaign_launch_enabled: boolean }>(
      `SELECT contract.id,
              EXISTS (SELECT 1 FROM public.contract_modules module
                      WHERE module.contract_id = contract.id AND module.module_key = 'action_engine' AND module.enabled = TRUE) AS action_engine_enabled
              ,EXISTS (SELECT 1 FROM public.contract_modules module
                      WHERE module.contract_id = contract.id AND module.module_key = 'automations' AND module.enabled = TRUE) AS automations_enabled
              ,EXISTS (SELECT 1 FROM public.contract_modules module
                      WHERE module.contract_id = contract.id AND module.module_key = 'funnel_nurture_agent' AND module.enabled = TRUE) AS funnel_nurture_enabled
              ,EXISTS (SELECT 1 FROM public.contract_modules module
                      WHERE module.contract_id = contract.id AND module.module_key = 'campaigns' AND module.enabled = TRUE) AS campaigns_enabled
              ,EXISTS (SELECT 1 FROM public.contract_modules module
                      WHERE module.contract_id = contract.id AND module.module_key = 'landing_pages' AND module.enabled = TRUE) AS landing_pages_enabled
              ,EXISTS (SELECT 1 FROM public.contract_modules module
                      WHERE module.contract_id = contract.id AND module.module_key = 'campaign_launch_agent' AND module.enabled = TRUE) AS campaign_launch_enabled
       FROM public.contracts contract
       JOIN public.organizations organization ON organization.client_id = contract.client_id
       WHERE contract.id = $1 AND organization.id = $2 AND contract.status = 'active' LIMIT 1`,
      [input.contractId, input.organizationId],
    )
    contractValid = Boolean(contract.rows[0])
    moduleEnabled = contract.rows[0]?.action_engine_enabled ?? false
    automationsEnabled = contract.rows[0]?.automations_enabled ?? false
    funnelNurtureEnabled = contract.rows[0]?.funnel_nurture_enabled ?? false
    campaignsEnabled = contract.rows[0]?.campaigns_enabled ?? false
    landingPagesEnabled = contract.rows[0]?.landing_pages_enabled ?? false
    campaignLaunchEnabled = contract.rows[0]?.campaign_launch_enabled ?? false
  }
  checks.push(check(contractValid, 'contract_valid', 'contract_invalid', 'Contrato ativo e compatível.', 'Contrato ativo não encontrado para a organização.', '/platform/contracts'))
  checks.push(check(moduleEnabled, 'action_engine_enabled', 'action_engine_disabled', 'Action Engine habilitado.', 'Módulo Action Engine não habilitado no contrato.', '/platform/contracts'))
  if (funnelNurture) {
    checks.push(check(automationsEnabled, 'automations_enabled', 'automations_disabled', 'Automações habilitadas.', 'Módulo Automações não habilitado no contrato.', '/platform/contracts'))
    checks.push(check(funnelNurtureEnabled, 'funnel_nurture_entitled', 'funnel_nurture_not_entitled', 'Agente Funil + Nutrição habilitado.', 'Agente Funil + Nutrição não habilitado no contrato.', '/platform/contracts'))
  }
  if (campaignLaunch) {
    checks.push(check(campaignsEnabled, 'campaigns_enabled', 'campaigns_disabled', 'Campanhas habilitadas.', 'Módulo Campanhas não habilitado no contrato.', '/platform/contracts'))
    checks.push(check(landingPagesEnabled, 'landing_pages_enabled', 'landing_pages_disabled', 'Landing Pages habilitadas.', 'Módulo Landing Pages não habilitado no contrato.', '/platform/contracts'))
    checks.push(check(campaignLaunchEnabled, 'campaign_launch_entitled', 'campaign_launch_not_entitled', 'Agente de Campanhas habilitado.', 'Agente de Campanhas não habilitado no contrato.', '/platform/contracts'))
  }

  const crm = await client.query<{ id: string }>(
    `SELECT id FROM public.crm_instances WHERE organization_id = $1 AND status = 'active' LIMIT 1`, [input.organizationId],
  )
  if (funnelNurture || !campaignLaunch) checks.push(check(Boolean(crm.rows[0]), 'crm_available', 'crm_unavailable', 'CRM ativo.', 'Nenhuma instância CRM ativa.', '/crm/settings'))

  const claimTargets = [
    ...(funnelNurture ? [{ resourceKey: 'crm.funnel_nurture_configuration', scope: 'organization_funnel_nurture' }] : []),
    ...(campaignLaunch ? [{ resourceKey: 'campaign.provider_account', scope: 'organization_campaign_launch' }] : []),
    ...(!funnelNurture && !campaignLaunch ? [{ resourceKey: 'crm.lead_population', scope: 'inactive_revenue_recovery' }] : []),
  ]
  for (const claimTarget of claimTargets) {
    const claim = await client.query<{ mission_id: string; mission_label: string; lease_expires_at: string | Date }>(
      `SELECT mission_id, mission_label, lease_expires_at
       FROM public.action_resource_claims
       WHERE organization_id = $1 AND ($2::UUID IS NULL OR mission_id <> $2) AND resource_key = $3
         AND active = TRUE AND lease_expires_at > NOW()
       ORDER BY CASE mode WHEN 'exclusive' THEN 0 ELSE 1 END, acquired_at LIMIT 1`,
      [input.organizationId, input.missionId ?? null, claimTarget.resourceKey],
    )
    checks.push(resourceClaimReadinessCheck(claim.rows[0] ? {
      missionId: claim.rows[0].mission_id,
      missionLabel: claim.rows[0].mission_label,
      leaseExpiresAt: claim.rows[0].lease_expires_at instanceof Date
        ? claim.rows[0].lease_expires_at.toISOString()
        : new Date(claim.rows[0].lease_expires_at).toISOString(),
    } : null))
  }

  if (!funnelNurture && !campaignLaunch) {
    const eligible = await client.query<{ count: number | string }>(
    `SELECT COUNT(*)::INT AS count FROM public.leads
     WHERE organization_id = $1 AND COALESCE(last_activity_at, updated_at, created_at) < NOW() - INTERVAL '7 days'`,
    [input.organizationId],
  )
    const eligibleCount = Number(eligible.rows[0]?.count ?? 0)
    checks.push({ status: eligibleCount > 0 ? 'pass' : 'warn', code: eligibleCount > 0 ? 'eligible_population_found' : 'eligible_population_empty', message: eligibleCount > 0 ? `${eligibleCount} oportunidades potencialmente elegíveis.` : 'Nenhuma oportunidade inativa encontrada; o planner poderá propor apenas preparação.' })

    const revenue = await client.query<{ count: number | string }>(
    `SELECT COUNT(*)::INT AS count FROM public.leads WHERE organization_id = $1 AND value IS NOT NULL`, [input.organizationId],
  )
    checks.push(check(Number(revenue.rows[0]?.count ?? 0) > 0, 'revenue_source_available', 'revenue_source_missing', 'Fonte de receita disponível.', 'Não há fonte confiável para medir receita recuperada.', '/crm'))
  }

  const owner = await client.query<{ id: string }>(
    `SELECT membership.user_id AS id FROM public.memberships membership
     WHERE membership.organization_id = $1 LIMIT 1`, [input.organizationId],
  )
  checks.push(check(Boolean(owner.rows[0]), 'mission_owner_available', 'mission_owner_missing', 'Responsável disponível.', 'A organização não possui responsável elegível.', '/platform/users'))

  const validEconomics = positiveDecimal(input.targetRevenueBrl)
    && positiveDecimal(input.maxTotalCostBrl)
    && positiveDecimal(input.maxHumanHours)
    && positiveDecimal(input.humanHourlyRateBrl)
    && Number.isFinite(Date.parse(input.deadlineAt))
    && Date.parse(input.deadlineAt) > Date.now()
  checks.push(check(validEconomics, 'mission_parameters_valid', 'mission_parameters_invalid', 'Target, prazo e budgets válidos.', 'Target, prazo futuro e parâmetros econômicos positivos são obrigatórios.'))

  const connections = await client.query<{ channel: string }>(
    `SELECT channel FROM public.channel_connections WHERE organization_id = $1 AND is_active = TRUE AND channel IN ('email','whatsapp')`,
    [input.organizationId],
  )
  const connected = new Set(connections.rows.map((row) => row.channel))
  if (campaignLaunch) {
    const provider = await client.query<{ provider: string }>(
      `SELECT provider FROM public.ad_provider_connections
       WHERE organization_id=$1 AND status='connected' ORDER BY updated_at DESC LIMIT 1`, [input.organizationId],
    )
    checks.push(check(Boolean(provider.rows[0]), 'ads_provider_connected', 'ads_provider_unavailable', 'Provedor de mídia conectado.', 'Conecte Meta Ads ou Google Ads antes de preparar a campanha.', '/integrations'))
  }
  if (funnelNurture) {
    checks.push(check(connected.has('email'), 'email_connected', 'email_unavailable', 'Conexão de e-mail ativa.', 'Conecte um provedor de e-mail antes de preparar a nutrição.', '/omnichannel/settings'))
  } else if (!campaignLaunch) {
    checks.push(channelCheck(connected.has('email'), 'email', '/omnichannel/settings'))
    checks.push(channelCheck(connected.has('whatsapp'), 'whatsapp', '/omnichannel/settings'))
  }

  const permissionTables = await client.query<{ available: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'lead_channel_permissions') AS available`,
  )
  checks.push(check(Boolean(permissionTables.rows[0]?.available), 'permission_evidence_ready', 'permission_evidence_missing', 'Evidência de permissão e suppression disponível.', 'Ledger de permissão/suppression indisponível.', '/prospecting/policy'))

  checks.push(check(input.agentHarnessHealthy, 'agent_harness_healthy', 'agent_harness_unavailable', 'Agent Harness disponível para planejamento.', 'Agent Harness indisponível; a missão não pode ser planejada.'))
  checks.push(check(input.mutationLeaseReady, 'mutation_lease_ready', 'mutation_lease_unavailable', 'Assinatura de mutações configurada.', 'A chave isolada de autorização de mutações não está configurada.'))

  const definitions = [REVENUE_RECOVERY_PACK_V0, FUNNEL_NURTURE_PACK_V1, CAMPAIGN_LAUNCH_PACK_V1]
  for (const expectedPack of definitions.filter((item) => selectedPackKeys.has(item.key))) {
    const pack = await client.query<{ content_hash: string }>(
      `SELECT version.content_hash FROM public.action_pack_versions version
       JOIN public.action_packs pack ON pack.id = version.pack_id
       WHERE pack.key = $1 AND version.semantic_version = $2
         AND version.status IN ('published_for_internal_pilot','published') LIMIT 1`,
      [expectedPack.key, expectedPack.semanticVersion],
    )
    checks.push(check(pack.rows[0]?.content_hash === expectedPack.contentHash, `${expectedPack.key}_pack_ready`, `${expectedPack.key}_pack_missing_or_changed`, 'Action Pack publicado com hash esperado.', 'Pack publicado ausente ou com hash divergente.'))
  }

  const availableChannels: MissionReadinessReport['availableChannels'] = campaignLaunch ? [] : funnelNurture ? ['email'] : ['human_task']
  return { ready: checks.every((item) => item.status !== 'block'), checks, availableChannels }
}

export function resourceClaimReadinessCheck(conflict: {
  missionId: string; missionLabel: string; leaseExpiresAt: string
} | null): ReadinessCheck {
  if (!conflict) {
    return { status: 'pass', code: 'resource_claim_available', message: 'Escopo operacional disponível para a missão.' }
  }
  return {
    status: 'block',
    code: 'resource_claim_conflict',
    message: `O recurso está reservado pela missão “${conflict.missionLabel}” até ${conflict.leaseExpiresAt}.`,
    fixHref: `/missions/${encodeURIComponent(conflict.missionId)}`,
  }
}

const FIX_ROUTE_AREAS = [
  ['/platform/', 'platform'], ['/integrations', 'integrations'], ['/omnichannel/', 'omnichannel'],
  ['/crm', 'crm'], ['/prospecting/', 'crm'], ['/missions/', 'missions'],
] as const

export function filterReadinessCorrectionLinks(checks: ReadinessCheck[], allowedAreas: readonly string[]): ReadinessCheck[] {
  const allowed = new Set(allowedAreas)
  return checks.map(item => {
    if (!item.fixHref) return item
    const area = FIX_ROUTE_AREAS.find(([prefix]) => item.fixHref!.startsWith(prefix))?.[1]
    if (!area || !allowed.has(area)) { const { fixHref: _hidden, ...safe } = item; return safe }
    return item
  })
}

function positiveDecimal(value: string): boolean {
  return /^\d+(\.\d{1,6})?$/.test(value) && Number(value) > 0
}

function check(passes: boolean, passCode: string, failCode: string, passMessage: string, failMessage: string, fixHref?: string): ReadinessCheck {
  return passes
    ? { status: 'pass', code: passCode, message: passMessage }
    : { status: 'block', code: failCode, message: failMessage, ...(fixHref ? { fixHref } : {}) }
}

function channelCheck(available: boolean, channel: 'email' | 'whatsapp', fixHref: string): ReadinessCheck {
  return available
    ? { status: 'warn', code: `${channel}_connected_adapter_pending`, message: `${channel === 'email' ? 'E-mail' : 'WhatsApp'} conectado; o adaptador do Action Engine permanece desabilitado neste piloto.`, capabilityKey: `${channel}.message.queue` }
    : { status: 'warn', code: `${channel}_unavailable`, message: `${channel === 'email' ? 'E-mail' : 'WhatsApp'} indisponível; o caminho humano permanece disponível.`, fixHref, capabilityKey: `${channel}.message.queue` }
}
