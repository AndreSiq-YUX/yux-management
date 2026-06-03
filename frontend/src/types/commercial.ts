export type LeadSourceKind =
  | 'paid_campaign'
  | 'landing_page'
  | 'whatsapp_cta'
  | 'organic'
  | 'referral'
  | 'manual'

export interface AttributionContext {
  campaignId?: string
  landingPageId?: string
  whatsappClickId?: string
  utmSource?: string
  utmMedium?: string
  utmCampaign?: string
  utmContent?: string
  utmTerm?: string
}

export interface NormalizedUtm {
  source?: string
  medium?: string
  campaign?: string
  content?: string
  term?: string
}

export interface RawUtmInput {
  source?: string | null
  medium?: string | null
  campaign?: string | null
  content?: string | null
  term?: string | null
}
