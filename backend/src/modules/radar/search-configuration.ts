import { createHash } from 'node:crypto'
import { z } from 'zod'

export const RADAR_BRAZIL_STATES = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'] as const
export const radarStateSchema = z.enum(RADAR_BRAZIL_STATES)
export const RADAR_EXPORT_FIELDS = ['name','legalName','cnpj','city','state','address','registrationStatus','cnaes',
  'websiteUrl','websiteStatus','phone','email','instagramUrl','rating','reviewCount','targetStatus','productFit',
  'evidenceUrl','checkedAt','verificationMethod','reviewNote','registryPhone','publicPhones','publicEmails','whatsappPublished','socialUrls','activityStatus','contactSources'] as const
const terms = z.array(z.string().trim().min(1).max(160)).max(50)

export const radarResearchPolicySchema = z.object({
  enabled: z.boolean().default(false), webSearchEnabled: z.boolean().default(false),
  maxSearchQueriesPerCandidate: z.number().int().min(1).max(5).default(3),
  maxPagesPerCandidate: z.number().int().min(1).max(10).default(4),
  freshnessDays: z.number().int().min(1).max(30).default(7),
  semanticQualificationEnabled: z.boolean().default(false),
}).strict()
export type RadarResearchPolicy = z.infer<typeof radarResearchPolicySchema>

export const radarSearchConfigurationSchema = z.object({
  research: radarResearchPolicySchema.default(() => radarResearchPolicySchema.parse({})),
  cities: z.array(z.object({ city: z.string().trim().min(1).max(100), state: radarStateSchema }).strict()).max(200).default([]),
  activityScope: z.enum(['main','main_or_secondary']).default('main_or_secondary'),
  excludedNameTerms: terms.default([]),
  registrationStatusIds: z.array(z.number().int().min(1).max(8)).min(1).max(8).default([2]),
  openingFrom: z.iso.date().optional(),
  openingTo: z.iso.date().optional(),
  braveQueryTemplate: z.string().trim().min(1).max(160).refine(value => value.includes('{name}'),
    'brave_query_requires_name').default('{name}'),
  sources: z.object({ enrichWithBrave: z.boolean().default(true), inspectWebsite: z.boolean().default(true) })
    .strict().default({ enrichWithBrave: true, inspectWebsite: true }),
  qualification: z.object({
    includeAnyTerms: terms.default([]), includeAllTerms: terms.default([]), excludeTerms: terms.default([]),
    requireCnaeMatch: z.boolean().default(false),
    missingWebsite: z.enum(['review','insufficient']).default('review'),
    productTerms: terms.default([]), productMatch: z.enum(['any','all']).default('any'),
  }).strict().default({ includeAnyTerms: [], includeAllTerms: [], excludeTerms: [], requireCnaeMatch: false,
    missingWebsite: 'review', productTerms: [], productMatch: 'any' }),
  batch: z.object({ pageSize: z.number().int().min(1).max(10).default(10),
    maxPagesPerScope: z.number().int().min(1).max(10).default(1),
    maxQueriesPerBatch: z.number().int().min(1).max(100).default(10),
    verificationLimit: z.number().int().min(1).max(25).default(10) }).strict()
    .default({ pageSize: 10, maxPagesPerScope: 1, maxQueriesPerBatch: 10, verificationLimit: 10 }),
  exportFields: z.array(z.enum(RADAR_EXPORT_FIELDS)).min(1).max(RADAR_EXPORT_FIELDS.length)
    .default([...RADAR_EXPORT_FIELDS]),
}).strict().superRefine((config, context) => {
  if (config.openingFrom && config.openingTo && config.openingFrom > config.openingTo) {
    context.addIssue({ code: 'custom', message: 'opening_date_range_invalid' })
  }
  if (new Set(config.exportFields).size !== config.exportFields.length) {
    context.addIssue({ code: 'custom', message: 'duplicate_export_field' })
  }
  const cities = config.cities.map(item => `${item.state}:${normalizeRadarText(item.city)}`)
  if (new Set(cities).size !== cities.length) context.addIssue({ code: 'custom', message: 'duplicate_city' })
})

export type RadarSearchConfiguration = z.infer<typeof radarSearchConfigurationSchema>
export type RadarExportField = typeof RADAR_EXPORT_FIELDS[number]
export type RadarDiscoveryScope = { key: string; state: string; city?: string; label: string }

export function resolveRadarSearchConfiguration(value?: unknown): RadarSearchConfiguration {
  return radarSearchConfigurationSchema.parse(value ?? {})
}

export function normalizeRadarText(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()
}

export function buildRadarDiscoveryScopes(campaign: {
  targetStates: string[]; searchConfiguration?: unknown; configurationRevision?: number;
}): RadarDiscoveryScope[] {
  const configuration = resolveRadarSearchConfiguration(campaign.searchConfiguration)
  const revision = campaign.configurationRevision ?? 1
  const locations = configuration.cities.length ? configuration.cities : campaign.targetStates.map(state => ({ state, city: undefined }))
  return locations.map(location => ({ state: location.state, city: location.city,
    label: location.city ? `${location.city}/${location.state}` : location.state,
    key: `v${revision}:${location.state}:${location.city
      ? createHash('sha256').update(normalizeRadarText(location.city)).digest('hex').slice(0, 16) : 'all'}` }))
}

export function buildRadarBraveQuery(template: string, context: { name: string; segment: string; terms: string[] }) {
  return template.replaceAll('{name}', context.name).replaceAll('{segment}', context.segment)
    .replaceAll('{terms}', context.terms.join(' ')).replace(/\s+/g, ' ').trim().slice(0, 160)
}
