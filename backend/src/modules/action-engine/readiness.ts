import { REVENUE_RECOVERY_PACK_V0 } from './packs/revenue-recovery-v0.js'
import type { Queryable } from './repository.js'

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
  },
): Promise<MissionReadinessReport> {
  const checks: ReadinessCheck[] = []
  const organization = await client.query<{ id: string; kind: string }>(
    `SELECT id, kind FROM public.organizations WHERE id = $1 LIMIT 1`, [input.organizationId],
  )
  checks.push(check(Boolean(organization.rows[0]), 'organization_valid', 'organization_missing', 'Organização válida.', 'Organização não encontrada.', '/platform/organizations'))

  let contractValid = organization.rows[0]?.kind === 'yux' && !input.contractId
  let moduleEnabled = contractValid
  if (input.contractId) {
    const contract = await client.query<{ id: string; action_engine_enabled: boolean }>(
      `SELECT contract.id,
              EXISTS (SELECT 1 FROM public.contract_modules module
                      WHERE module.contract_id = contract.id AND module.module_key = 'action_engine' AND module.enabled = TRUE) AS action_engine_enabled
       FROM public.contracts contract
       JOIN public.organizations organization ON organization.client_id = contract.client_id
       WHERE contract.id = $1 AND organization.id = $2 AND contract.status = 'active' LIMIT 1`,
      [input.contractId, input.organizationId],
    )
    contractValid = Boolean(contract.rows[0])
    moduleEnabled = contract.rows[0]?.action_engine_enabled ?? false
  }
  checks.push(check(contractValid, 'contract_valid', 'contract_invalid', 'Contrato ativo e compatível.', 'Contrato ativo não encontrado para a organização.', '/platform/contracts'))
  checks.push(check(moduleEnabled, 'action_engine_enabled', 'action_engine_disabled', 'Action Engine habilitado.', 'Módulo Action Engine não habilitado no contrato.', '/platform/contracts'))

  const crm = await client.query<{ id: string }>(
    `SELECT id FROM public.crm_instances WHERE organization_id = $1 AND status = 'active' LIMIT 1`, [input.organizationId],
  )
  checks.push(check(Boolean(crm.rows[0]), 'crm_available', 'crm_unavailable', 'CRM ativo.', 'Nenhuma instância CRM ativa.', '/crm/settings'))

  const claim = await client.query<{ mission_id: string; mission_label: string; lease_expires_at: string | Date }>(
    `SELECT mission_id, mission_label, lease_expires_at
     FROM public.action_resource_claims
     WHERE organization_id = $1 AND resource_key = 'crm.lead_population'
       AND scope = 'inactive_revenue_recovery' AND active = TRUE AND lease_expires_at > NOW()
     ORDER BY CASE mode WHEN 'exclusive' THEN 0 ELSE 1 END, acquired_at LIMIT 1`,
    [input.organizationId],
  )
  checks.push(resourceClaimReadinessCheck(claim.rows[0] ? {
    missionId: claim.rows[0].mission_id,
    missionLabel: claim.rows[0].mission_label,
    leaseExpiresAt: claim.rows[0].lease_expires_at instanceof Date
      ? claim.rows[0].lease_expires_at.toISOString()
      : new Date(claim.rows[0].lease_expires_at).toISOString(),
  } : null))

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
  checks.push(channelCheck(connected.has('email'), 'email', '/omnichannel/settings'))
  checks.push(channelCheck(connected.has('whatsapp'), 'whatsapp', '/omnichannel/settings'))

  const permissionTables = await client.query<{ available: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'lead_channel_permissions') AS available`,
  )
  checks.push(check(Boolean(permissionTables.rows[0]?.available), 'permission_evidence_ready', 'permission_evidence_missing', 'Evidência de permissão e suppression disponível.', 'Ledger de permissão/suppression indisponível.', '/prospecting/policy'))

  checks.push(check(input.agentHarnessHealthy, 'agent_harness_healthy', 'agent_harness_unavailable', 'Agent Harness disponível para planejamento.', 'Agent Harness indisponível; a missão não pode ser planejada.'))

  const pack = await client.query<{ content_hash: string }>(
    `SELECT version.content_hash FROM public.action_pack_versions version
     JOIN public.action_packs pack ON pack.id = version.pack_id
     WHERE pack.key = 'revenue_recovery' AND version.semantic_version = '0.2.0'
       AND version.status IN ('published_for_internal_pilot','published') LIMIT 1`,
  )
  checks.push(check(pack.rows[0]?.content_hash === REVENUE_RECOVERY_PACK_V0.contentHash, 'revenue_recovery_pack_ready', 'revenue_recovery_pack_missing_or_changed', 'Revenue Recovery Pack v0 publicado com hash esperado.', 'Pack publicado ausente ou com hash divergente.'))

  const availableChannels: MissionReadinessReport['availableChannels'] = ['human_task']
  // The first pilot deliberately exposes only the human path. Provider
  // connections are still diagnosed above, but they are not advertised as an
  // executable Mission channel until their Action Engine adapters are enabled.
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
