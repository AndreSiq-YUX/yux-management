import type { PlatformContext } from '@/types/platform'
import type { RadarCampaignStatus, RadarCompanyRecord, RadarOpportunity, RadarOpportunityStatus, RadarPolicyDecision } from '@/types/radar'

const radarInternalRoleKeys = new Set(['yux_admin', 'yux_operator'])

const campaignStatusLabels: Record<RadarCampaignStatus, string> = {
  draft: 'Rascunho',
  active: 'Ativa',
  paused: 'Pausada',
  completed: 'Concluida',
  archived: 'Arquivada',
}

const opportunityStatusLabels: Record<RadarOpportunityStatus, string> = {
  raw: 'Bruta',
  enriching: 'Enriquecendo',
  enriched: 'Enriquecida',
  diagnosing: 'Analisando',
  diagnosed: 'Analise gerada',
  message_drafted: 'Mensagem criada',
  review_pending: 'Revisao pendente',
  approved: 'Aprovada',
  rejected: 'Rejeitada',
  discarded: 'Descartada',
  opted_out: 'Opt-out',
  converted: 'Convertida',
}

export function canShowRadarNavigation(context: PlatformContext) {
  const role = context.role

  return (
    context.mode === 'client_workspace'
    && context.organization?.isInternalGrowthWorkspace === true
    && Boolean(role && (
      role.scope === 'internal'
      && (radarInternalRoleKeys.has(role.key) || role.permissions.includes('radar:manage') || role.permissions.includes('platform.manage'))
    ))
  )
}

export function buildRadarDedupeKey(input: Pick<RadarCompanyRecord, 'cnpj' | 'websiteUrl' | 'phoneRaw' | 'tradeName' | 'legalName' | 'city' | 'state'>) {
  if (input.cnpj) return `cnpj:${onlyDigits(input.cnpj)}`
  if (input.websiteUrl) return `domain:${normalizeDomain(input.websiteUrl)}`
  if (input.phoneRaw) return `phone:${onlyDigits(input.phoneRaw)}`

  return `name_city:${normalizeToken(input.tradeName || input.legalName || 'empresa')}:${normalizeToken(input.city || '')}:${normalizeToken(input.state || '')}`
}

export function defaultRadarPolicyDecision(canConvertToLead = true): RadarPolicyDecision {
  return {
    status: 'requires_human_approval',
    canSendAutomatically: false,
    canConvertToLead,
    blockedReasons: [],
    requiredReviewFields: ['message', 'evidence', 'risk_flags'],
  }
}

export function canConvertRadarOpportunity(opportunity: Pick<RadarOpportunity, 'status' | 'latestMessageSuggestion' | 'convertedLeadId'>) {
  return (
    opportunity.status === 'approved'
    && !opportunity.convertedLeadId
    && opportunity.latestMessageSuggestion?.status === 'approved'
    && opportunity.latestMessageSuggestion.policyDecision.canSendAutomatically === false
    && opportunity.latestMessageSuggestion.policyDecision.canConvertToLead === true
  )
}

export function getRadarCampaignStatusLabel(status: RadarCampaignStatus) {
  return campaignStatusLabels[status]
}

export function getRadarOpportunityStatusLabel(status: RadarOpportunityStatus) {
  return opportunityStatusLabels[status]
}

export function getRadarCompanyDisplayName(company?: Pick<RadarCompanyRecord, 'tradeName' | 'legalName' | 'websiteUrl'>) {
  return company?.tradeName || company?.legalName || company?.websiteUrl || 'Empresa sem nome'
}

export function getRadarScoreTone(score?: number) {
  if (score === undefined) return 'unknown'
  if (score >= 75) return 'high'
  if (score >= 50) return 'medium'
  return 'low'
}

function onlyDigits(value: string) {
  return value.replace(/\D/g, '')
}

function normalizeDomain(value: string) {
  try {
    const url = value.startsWith('http') ? new URL(value) : new URL(`https://${value}`)
    return url.hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return normalizeToken(value)
  }
}

function normalizeToken(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
