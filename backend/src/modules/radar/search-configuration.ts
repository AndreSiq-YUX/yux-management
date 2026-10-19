import { createHash } from 'node:crypto'
import { z } from 'zod'
import {RADAR_SEARCH_SOURCES} from './search-capacity.js'

export const RADAR_BRAZIL_STATES = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'] as const
export const radarStateSchema = z.enum(RADAR_BRAZIL_STATES)
export const RADAR_EXPORT_FIELDS = ['name','legalName','cnpj','city','state','address','registrationStatus','cnaes',
  'websiteUrl','websiteStatus','phone','email','instagramUrl','rating','reviewCount','targetStatus','productFit',
  'evidenceUrl','checkedAt','verificationMethod','reviewNote','registryPhone','publicPhones','publicEmails','whatsappPublished','socialUrls','activityStatus','contactSources',
  'companySummary','services','customerSegments','operatingRegions','supplierEmails','sizeScore','sizeCoverage','sizeEvidence'] as const
const terms = z.array(z.string().trim().min(1).max(160)).max(50)
export const radarSizeMetrics = ['employees','units','annualRevenue','annualMeals','capital','yearsActive'] as const
const sizeCriterion = z.object({
  metric:z.enum(radarSizeMetrics),weight:z.number().positive().max(1000),maxAgeDays:z.number().int().min(1).max(3650).default(365),
  bands:z.array(z.object({min:z.number().nonnegative(),points:z.number().min(0).max(100)}).strict()).min(1).max(20),
}).strict().superRefine((value,ctx)=>{
  if(value.bands.some((band,index)=>index>0&&(band.min<=value.bands[index-1].min||band.points<value.bands[index-1].points)))
    ctx.addIssue({code:'custom',message:'size_bands_must_increase'})
})
export const radarSizePolicySchema = z.object({enabled:z.boolean().default(false),direction:z.enum(['larger','smaller']).default('larger'),
  criteria:z.array(sizeCriterion).max(6).default([]),
}).strict().superRefine((value,ctx)=>{
  if(new Set(value.criteria.map(item=>item.metric)).size!==value.criteria.length)ctx.addIssue({code:'custom',message:'duplicate_size_metric'})
})

export const radarResearchPolicySchema = z.object({
  enabled: z.boolean().default(false), webSearchEnabled: z.boolean().default(false),
  localSearchOrder:z.enum(['before_web','after_web_if_needed','disabled']).default('before_web'),
  completion:z.object({enabled:z.boolean().default(false),requireIdentity:z.boolean().default(true),requireSegment:z.boolean().default(false),requireWebsite:z.boolean().default(false),
    contactTypes:z.array(z.enum(['email','phone','whatsapp','contact_form'])).max(4).default(['email','phone','whatsapp','contact_form']),
    contactPurposes:z.array(z.enum(['general','suppliers','sales','finance','recruitment'])).max(5).default([]),
    minimumUsefulContacts:z.number().int().min(0).max(20).default(1)}).strict().superRefine((value,ctx)=>{
      if(new Set(value.contactTypes).size!==value.contactTypes.length||new Set(value.contactPurposes).size!==value.contactPurposes.length)
        ctx.addIssue({code:'custom',message:'duplicate_completion_criterion'})
      if(value.enabled&&value.minimumUsefulContacts>0&&!value.contactTypes.length)ctx.addIssue({code:'custom',message:'completion_contact_type_required'})
    }).default(()=>({enabled:false,requireIdentity:true,requireSegment:false,requireWebsite:false,contactTypes:['email' as const,'phone' as const,'whatsapp' as const,'contact_form' as const],contactPurposes:[],minimumUsefulContacts:1})),
  webSearchProviders:z.array(z.enum(['brave_web_search','serper_web_search'])).min(1).max(2).refine(value=>new Set(value).size===value.length,'duplicate_search_provider').default(['brave_web_search']),
  maxSearchQueriesPerCandidate: z.number().int().positive().safe().default(3),
  maxSearchQueriesBySource:z.partialRecord(z.enum(RADAR_SEARCH_SOURCES),z.number().int().nonnegative().max(2_147_483_647)).default({}),
  maxSearchQueriesTotalPerCandidate:z.number().int().nonnegative().max(2_147_483_647).nullable().default(null),
  maxPagesPerCandidate: z.number().int().positive().safe().default(4),
  freshnessDays: z.number().int().positive().safe().default(7),
  semanticQualificationEnabled: z.boolean().default(false),
  presenceResolutionEnabled:z.boolean().default(false),
  inspectLinkedSocialProfiles:z.boolean().default(false),
  profileEnabled:z.boolean().default(false),
  contactPurpose:z.enum(['general','suppliers','sales','finance','recruitment']).default('general'),
  sizeAssessment:radarSizePolicySchema.default(()=>radarSizePolicySchema.parse({})),
}).strict()
export type RadarResearchPolicy = z.infer<typeof radarResearchPolicySchema>

export const radarSearchConfigurationSchema = z.object({
  crmDestination:z.object({crmInstanceId:z.string().uuid(),pipelineId:z.string().uuid(),stageId:z.string().uuid()}).strict().optional(),
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
  batch: z.object({ pageSize: z.number().int().positive().safe().default(10),
    maxPagesPerScope: z.number().int().positive().safe().default(1),
    maxQueriesPerBatch: z.number().int().positive().safe().default(10),
    verificationLimit: z.number().int().positive().safe().default(10) }).strict()
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
