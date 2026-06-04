import type {
  CrmAttributionDashboard,
  CrmAttributionUtm,
  CrmMroiAlert,
  LeadPrimarySourceDerivation,
  LeadSourceKind,
  LeadSourceRollup,
  PortalCrmAttributionDashboard,
  PortalLeadSourceRollup,
} from '@/types/crmAttribution'

const PAID_SOURCES = new Set(['adwords', 'facebook', 'google', 'google_ads', 'instagram', 'linkedin', 'meta', 'meta_ads', 'tiktok'])
const PAID_MEDIUMS = new Set(['cpc', 'paid', 'paid_search', 'paid_social', 'ppc', 'social_paid'])
const ORGANIC_MEDIUMS = new Set(['organic', 'seo', 'social'])
const REFERRAL_MEDIUMS = new Set(['partner', 'referral'])

const round = (value: number, digits = 2) => {
  if (!Number.isFinite(value)) return 0
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

export function normalizeUtmSource(value?: string | null): string | undefined {
  const normalized = value
    ?.trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_')

  return normalized || undefined
}

export function normalizeAttributionUtm(utm?: Partial<CrmAttributionUtm> | null): CrmAttributionUtm | undefined {
  if (!utm) return undefined
  const normalized: CrmAttributionUtm = {}
  const source = normalizeUtmSource(utm.source)
  const medium = normalizeUtmSource(utm.medium)
  const campaign = normalizeUtmSource(utm.campaign)
  const content = normalizeUtmSource(utm.content)
  const term = normalizeUtmSource(utm.term)

  if (source) normalized.source = source
  if (medium) normalized.medium = medium
  if (campaign) normalized.campaign = campaign
  if (content) normalized.content = content
  if (term) normalized.term = term

  return Object.keys(normalized).length ? normalized : undefined
}

export function derivePrimarySource(input: {
  source?: string | null
  campaignId?: string | null
  landingPageId?: string | null
  whatsappClickId?: string | null
  utm?: Partial<CrmAttributionUtm> | null
}): LeadPrimarySourceDerivation {
  const utm = normalizeAttributionUtm(input.utm)
  const source = normalizeUtmSource(input.source)
  const medium = normalizeUtmSource(input.utm?.medium)
  const campaign = normalizeUtmSource(input.utm?.campaign)

  if (input.whatsappClickId || source === 'whatsapp') {
    return { key: 'whatsapp', name: 'WhatsApp', kind: 'whatsapp', confidence: 'high', landingPageId: input.landingPageId || undefined, utm }
  }

  if (input.campaignId || (source && PAID_SOURCES.has(source)) || (medium && PAID_MEDIUMS.has(medium))) {
    const key = campaign || source || input.campaignId || 'paid_campaign'
    return {
      key,
      name: formatSourceName(key),
      kind: 'paid_campaign',
      confidence: input.campaignId ? 'high' : 'medium',
      campaignId: input.campaignId || undefined,
      landingPageId: input.landingPageId || undefined,
      utm,
    }
  }

  if (input.landingPageId) {
    const key = source || input.landingPageId
    return { key, name: formatSourceName(key), kind: 'landing_page', confidence: 'high', landingPageId: input.landingPageId, utm }
  }

  if (medium && ORGANIC_MEDIUMS.has(medium)) {
    const key = source || medium
    return { key, name: formatSourceName(key), kind: 'organic', confidence: 'medium', utm }
  }

  if ((medium && REFERRAL_MEDIUMS.has(medium)) || source) {
    const key = source || medium || 'referral'
    return { key, name: formatSourceName(key), kind: 'referral', confidence: 'medium', utm }
  }

  return { key: 'manual', name: 'Manual', kind: 'manual', confidence: 'low', utm }
}

export function calculateCpl(input: { cost: number; leads: number }) {
  if (input.leads <= 0 || input.cost <= 0) return 0
  return round(input.cost / input.leads)
}

export function calculateSourceConversion(input: { leads: number; sales: number }) {
  if (input.leads <= 0 || input.sales <= 0) return 0
  return round((input.sales / input.leads) * 100, 1)
}

export function calculateMroi(input: { mediaCost?: number; operationalCost?: number; attributedRevenue: number }) {
  const totalCost = Math.max(0, Number(input.mediaCost || 0)) + Math.max(0, Number(input.operationalCost || 0))
  if (totalCost <= 0) return 0
  return round((input.attributedRevenue - totalCost) / totalCost, 1)
}

export function hydrateRollupMetrics(rollup: Omit<LeadSourceRollup, 'cpl' | 'opportunityRate' | 'conversionRate' | 'mroi'>): LeadSourceRollup {
  const totalCost = Math.max(0, rollup.mediaCost) + Math.max(0, rollup.operationalCost)
  return {
    ...rollup,
    cpl: calculateCpl({ cost: rollup.clientVisibleCost || totalCost, leads: rollup.leads }),
    opportunityRate: calculateSourceConversion({ leads: rollup.leads, sales: rollup.opportunities }),
    conversionRate: calculateSourceConversion({ leads: rollup.leads, sales: rollup.sales }),
    mroi: calculateMroi({ mediaCost: rollup.mediaCost, operationalCost: rollup.operationalCost, attributedRevenue: rollup.attributedRevenue }),
  }
}

export function sanitizePortalAttribution(dashboard: CrmAttributionDashboard): PortalCrmAttributionDashboard {
  const sources = dashboard.sources.map(sanitizePortalSourceRollup)
  const clientVisibleCost = sources.reduce((sum, source) => sum + source.clientVisibleCost, 0)
  const leads = sources.reduce((sum, source) => sum + source.leads, 0)
  const sales = sources.reduce((sum, source) => sum + source.sales, 0)
  const attributedRevenue = sources.reduce((sum, source) => sum + source.attributedRevenue, 0)

  return {
    ...dashboard,
    totals: {
      ...dashboard.totals,
      clientVisibleCost,
      attributedRevenue,
      cpl: calculateCpl({ cost: clientVisibleCost, leads }),
      conversionRate: calculateSourceConversion({ leads, sales }),
      mroi: clientVisibleCost > 0 ? round((attributedRevenue - clientVisibleCost) / clientVisibleCost, 1) : 0,
    },
    sources,
    alerts: dashboard.alerts.map(alert => ({
      ...alert,
      description: alert.description.replace(/custo operacional interno/gi, 'custo operacional'),
    })),
  }
}

export function buildMroiAlerts(input: {
  rollups: LeadSourceRollup[]
  highCplThreshold: number
  lowConversionThreshold: number
  highConversionThreshold: number
  negativeMroiThreshold?: number
}): CrmMroiAlert[] {
  const alerts: CrmMroiAlert[] = []
  const negativeMroiThreshold = input.negativeMroiThreshold ?? 0

  for (const rollup of input.rollups) {
    if (rollup.leads > 0 && rollup.cpl > input.highCplThreshold) {
      alerts.push(buildAlert(rollup, 'warning', 'cpl', rollup.cpl, input.highCplThreshold, 'Lead caro', `CPL de ${rollup.sourceName} acima do limite configurado.`))
    }

    if (rollup.leads >= 5 && rollup.conversionRate < input.lowConversionThreshold) {
      alerts.push(buildAlert(rollup, 'critical', 'conversion_rate', rollup.conversionRate, input.lowConversionThreshold, 'Conversao baixa', `${rollup.sourceName} esta convertendo abaixo do esperado.`))
    }

    if (rollup.sales > 0 && rollup.mroi < negativeMroiThreshold) {
      alerts.push(buildAlert(rollup, 'critical', 'mroi', rollup.mroi, negativeMroiThreshold, 'MROI negativo', `${rollup.sourceName} gera receita abaixo do custo total.`))
    }

    if (rollup.leads >= 5 && rollup.conversionRate >= input.highConversionThreshold && rollup.mroi > 0) {
      alerts.push(buildAlert(rollup, 'success', 'conversion_rate', rollup.conversionRate, input.highConversionThreshold, 'Alta conversao', `${rollup.sourceName} tem conversao e MROI positivos.`))
    }
  }

  return alerts
}

function sanitizePortalSourceRollup(rollup: LeadSourceRollup): PortalLeadSourceRollup {
  const {
    mediaCost: _mediaCost,
    operationalCost: _operationalCost,
    ...safeRollup
  } = rollup

  return {
    ...safeRollup,
    cpl: calculateCpl({ cost: rollup.clientVisibleCost, leads: rollup.leads }),
    mroi: rollup.clientVisibleCost > 0 ? round((rollup.attributedRevenue - rollup.clientVisibleCost) / rollup.clientVisibleCost, 1) : 0,
  }
}

function buildAlert(
  rollup: LeadSourceRollup,
  severity: CrmMroiAlert['severity'],
  metricKey: CrmMroiAlert['metricKey'],
  metricValue: number,
  thresholdValue: number,
  title: string,
  description: string,
): CrmMroiAlert {
  return {
    organizationId: rollup.organizationId,
    crmInstanceId: rollup.crmInstanceId,
    sourceId: rollup.sourceId,
    campaignId: rollup.campaignId,
    severity,
    status: 'open',
    title,
    description,
    metricKey,
    metricValue,
    thresholdValue,
  }
}

function formatSourceName(value: string) {
  return value
    .split('_')
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ') || 'Manual'
}
