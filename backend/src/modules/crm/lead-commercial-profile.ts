import { z } from 'zod'
import {
  radarCommercialFactsSchemaForCompany,
  radarCommercialUrl,
} from '../radar/commercial-view.js'

/** Business-only projection: unknown keys are stripped at every nested boundary. */
export function projectLeadCommercialProfile(value: unknown) {
  const data =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {}
  const identities = [data.legalName, data.tradeName].filter(
    (name): name is string => typeof name === 'string',
  )
  const facts = radarCommercialFactsSchemaForCompany(identities).parse(data)
  return {
    ...facts,
    contacts: (facts.contacts ?? []).filter(
      (contact) =>
        contact.association === 'confirmed' &&
        contact.scope !== 'unresolved' &&
        [
          'email',
          'phone',
          'whatsapp',
          'social',
          'contact_form',
          'business_person',
        ].includes(contact.kind ?? '') &&
        typeof contact.value === 'string' &&
        (!['social', 'contact_form'].includes(contact.kind ?? '') ||
          !!radarCommercialUrl(contact.value)),
    ),
  }
}
export type LeadCommercialProfile = ReturnType<
  typeof projectLeadCommercialProfile
>
export const leadCommercialProfileSchema = z
  .unknown()
  .transform(projectLeadCommercialProfile)

/** Attribution is also returned to clients, including leads imported before this schema. */
export function projectLeadAttribution(
  value: unknown,
  identities: string[] = [],
) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return undefined
  const scalar = z.string().max(2000).optional().catch(undefined)
  const facts = radarCommercialFactsSchemaForCompany(identities).shape
  return z
    .object({
      campaignId: scalar,
      landingPageId: scalar,
      whatsappClickId: scalar,
      utmSource: scalar,
      utmMedium: scalar,
      utmCampaign: scalar,
      utmContent: scalar,
      utmTerm: scalar,
      radarCandidateId: scalar,
      radarCampaignId: scalar,
      radarOpportunityId: scalar,
      radarCompanyRecordId: scalar,
      radarCnpj: facts.cnpj,
      recommendedOffer: scalar,
      source: scalar,
      sourceUrl: facts.websiteUrl,
      websiteUrl: facts.websiteUrl,
      registryPhone: facts.registryPhone,
      contacts: facts.contacts,
      companyProfile: facts.profile,
      sizeAssessment: facts.sizeAssessment,
      activity: facts.activity,
      triageReasons: facts.reasons,
      targetStatus: z
        .enum(['confirmed', 'review', 'not_target', 'insufficient'])
        .optional()
        .catch(undefined),
      productFit: z
        .enum(['high', 'possible', 'low', 'unknown'])
        .optional()
        .catch(undefined),
      collectionRevision: z
        .number()
        .int()
        .positive()
        .optional()
        .catch(undefined),
      acquisitionKind: scalar,
      consent: scalar,
      outreach: scalar,
    })
    .strip()
    .parse(value)
}
export const commercialUrlInput = z
  .string()
  .trim()
  .max(2048)
  .refine(
    (value) => value === '' || !!radarCommercialUrl(value),
    'Informe uma URL pública http ou https.',
  )
  .nullable()
  .optional()
