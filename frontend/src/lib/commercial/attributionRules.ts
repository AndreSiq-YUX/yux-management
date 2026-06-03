import type { AttributionContext, LeadSourceKind, NormalizedUtm, RawUtmInput } from '@/types/commercial'

const PAID_SOURCES = new Set([
  'adwords',
  'facebook',
  'google',
  'google_ads',
  'instagram',
  'linkedin',
  'meta',
  'meta_ads',
  'tiktok',
])

const PAID_MEDIUMS = new Set([
  'cpc',
  'paid',
  'paid_search',
  'paid_social',
  'ppc',
  'social_paid',
])

const ORGANIC_MEDIUMS = new Set([
  'organic',
  'seo',
  'social',
])

const REFERRAL_MEDIUMS = new Set([
  'partner',
  'referral',
])

const normalizeToken = (value?: string | null): string | undefined => {
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

export const normalizeUtm = (utm: RawUtmInput): NormalizedUtm => {
  const normalized: NormalizedUtm = {}
  const source = normalizeToken(utm.source)
  const medium = normalizeToken(utm.medium)
  const campaign = normalizeToken(utm.campaign)
  const content = normalizeToken(utm.content)
  const term = normalizeToken(utm.term)

  if (source) normalized.source = source
  if (medium) normalized.medium = medium
  if (campaign) normalized.campaign = campaign
  if (content) normalized.content = content
  if (term) normalized.term = term

  return normalized
}

export const isPaidAttribution = (context: AttributionContext): boolean => {
  const source = normalizeToken(context.utmSource)
  const medium = normalizeToken(context.utmMedium)

  return Boolean(
    context.campaignId
    || (source && PAID_SOURCES.has(source))
    || (medium && PAID_MEDIUMS.has(medium)),
  )
}

export const classifyLeadSource = (context: AttributionContext): LeadSourceKind => {
  const medium = normalizeToken(context.utmMedium)

  if (context.whatsappClickId) {
    return 'whatsapp_cta'
  }

  if (isPaidAttribution(context)) {
    return 'paid_campaign'
  }

  if (context.landingPageId) {
    return 'landing_page'
  }

  if (medium && ORGANIC_MEDIUMS.has(medium)) {
    return 'organic'
  }

  if (medium && REFERRAL_MEDIUMS.has(medium)) {
    return 'referral'
  }

  if (context.utmSource) {
    return 'referral'
  }

  return 'manual'
}
