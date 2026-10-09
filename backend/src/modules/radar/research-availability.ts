import type pg from 'pg'
import type { AuthUser } from '../../auth/routes.js'
import { requireRadarScope } from './access.js'
import { findRadarDataSource, evaluateRadarSourceGovernance, isRadarEnabledOrganization } from './repository.js'
import { resolveRadarSearchConfiguration, type RadarResearchPolicy } from './search-configuration.js'

export type ResearchBlocker = { code: string; message: string; sourceType?: string; resolution: string }
type Source = { sourceType: string; enabled: boolean; defaultCostPerUnit: number; remaining?: number }
type Provider = { status: string; hasSecret: boolean; publicConfig: Record<string, unknown> }
export function evaluateRadarResearchAvailability(input: { policy: RadarResearchPolicy; canManage: boolean;
  sources: Source[]; provider?: Provider; localEnabled?: boolean; campaignActive?: boolean }) {
  const reasons: ResearchBlocker[] = []
  const add = (code: string, message: string, sourceType?: string, resolution = 'Admin → Integrações → Fontes do Radar') => reasons.push({ code, message, sourceType, resolution })
  if (!input.canManage) add('research_admin_required', 'A pesquisa paga exige um administrador YUX.')
  if (!input.policy.enabled) add('campaign_research_disabled', 'Aprofundamento automático desativado nesta campanha.', undefined, 'Campanha → Editar configuração → Aprofundamento automático')
  if (input.campaignActive === false) add('campaign_inactive', 'Campanha arquivada, concluída ou pausada.', undefined, 'Campanha → Configuração')
  const wanted = [...(input.localEnabled ? ['brave_place_search'] : []), ...(input.policy.webSearchEnabled ? ['brave_web_search'] : [])]
  if (!wanted.length) add('search_not_selected', 'Selecione pelo menos uma busca para descobrir a presença pública.', undefined, 'Campanha → Editar configuração')
  if (wanted.length) {
    if (input.provider?.status !== 'active') add('provider_inactive', 'A conexão Brave não está ativa.')
    if (!input.provider?.hasSecret) add('provider_secret_missing', 'Chave Brave não cadastrada.')
    if (input.provider?.publicConfig.retentionLicensed !== true || input.provider.publicConfig.credentialPurpose !== 'licensed_retention') add('retention_license_required', 'Retenção dos resultados Brave não confirmada.')
    if (input.policy.webSearchEnabled && input.provider?.publicConfig.webSearchLicensed !== true) add('web_license_required', 'Confirme que a chave e o plano permitem busca web com retenção.')
  }
  const estimates = wanted.map(sourceType => {
    const source = input.sources.find(item => item.sourceType === sourceType)
    if (!source?.enabled) add('source_disabled', `Fonte ${sourceType} desativada no catálogo.`, sourceType)
    if (!source || source.defaultCostPerUnit <= 0) add('source_cost_required', `Custo aprovado não definido para ${sourceType}.`, sourceType)
    if (source?.remaining !== undefined && source.remaining < 1) add('source_limit_exceeded', `Quota diária esgotada para ${sourceType}.`, sourceType)
    return { sourceType, costPerQuery: source?.defaultCostPerUnit ?? 0, maximumQueries: input.policy.maxSearchQueriesPerCandidate }
  })
  return { allowed: reasons.length === 0, reasons, estimates, maxQueriesPerCandidate: input.policy.maxSearchQueriesPerCandidate,
    maximumCostPerCandidate: Math.max(0, ...estimates.map(item => item.costPerQuery)) * input.policy.maxSearchQueriesPerCandidate,
    semanticQualificationEnabled: input.policy.semanticQualificationEnabled }
}

export async function getRadarResearchAvailability(pool: pg.Pool, user: AuthUser, organizationId: string, campaignId: string) {
  await requireRadarScope(pool, user, { organizationId, campaignId })
  const campaign = await pool.query<{ search_configuration: unknown; status: string }>(
    'SELECT search_configuration, status FROM public.radar_campaigns WHERE id = $1 AND organization_id = $2', [campaignId, organizationId])
  if (!campaign.rows[0]) throw Object.assign(new Error('radar_campaign_not_found'), { statusCode: 404 })
  const configuration = resolveRadarSearchConfiguration(campaign.rows[0].search_configuration)
  const provider = await pool.query<{ status: string; secret_reference: string | null; public_config: Record<string, unknown> }>(
    `SELECT status, secret_reference, public_config FROM public.platform_provider_connections
     WHERE provider_key = 'brave_place' AND environment = 'production' ORDER BY is_default DESC, updated_at DESC LIMIT 1`)
  const sources = await Promise.all(['brave_place_search', 'brave_web_search'].map(async key => {
    const source = await findRadarDataSource(pool, organizationId, key)
    const governance = await evaluateRadarSourceGovernance(pool, organizationId, campaignId, source, 1)
    return { source, governance }
  }))
  const result = evaluateRadarResearchAvailability({ policy: configuration.research,
    canManage: user.role === 'yux_admin' && await isRadarEnabledOrganization(pool, organizationId),
    campaignActive: !['paused','archived','completed'].includes(campaign.rows[0].status),
    localEnabled: configuration.sources.enrichWithBrave,
    provider: provider.rows[0] ? { status: provider.rows[0].status, hasSecret: !!provider.rows[0].secret_reference, publicConfig: provider.rows[0].public_config ?? {} } : undefined,
    sources: sources.flatMap(item => item.source ? [item.source] : []) })
  for (const { source, governance } of sources) {
    if (!result.estimates.some(item => item.sourceType === source?.sourceType)) continue
    for (const issue of governance.issues.filter(item => item.code !== 'source_disabled')) result.reasons.push({ ...issue, resolution: 'Admin → Integrações → Limites e orçamento' })
  }
  result.allowed = result.reasons.length === 0
  return result
}
