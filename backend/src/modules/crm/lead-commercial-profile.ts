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

export function projectLeadNotes(value: unknown, identities: string[] = []) {
  if (typeof value !== 'string') return undefined
  return value
    .split('\n')
    .flatMap((line) => {
      const legacy =
        /^(Perfil e fontes|Atividade e evidências):\s*(\{.*\})\s*$/.exec(line)
      if (!legacy) return [line]
      try {
        const parsed: unknown = JSON.parse(legacy[2])
        const facts = projectLeadCommercialProfile({
          legalName: identities[0],
          tradeName: identities[1],
          ...(legacy[1] === 'Perfil e fontes'
            ? { profile: parsed }
            : { activity: parsed }),
        })
        const claim = (item: { value?: string; sourceUrl?: string }) =>
          item.value
            ? `${item.value}${item.sourceUrl ? ` (${item.sourceUrl})` : ''}`
            : undefined
        const result =
          legacy[1] === 'Perfil e fontes'
            ? [
                ...(facts.profile?.summary ? [facts.profile.summary] : []),
                ...(facts.profile?.services ?? []),
                ...(facts.profile?.customerSegments ?? []),
                ...(facts.profile?.operatingRegions ?? []),
                ...(facts.profile?.scaleSignals ?? []),
              ].map(claim)
            : (facts.activity?.signals?.map((item) =>
                claim({ value: item.excerpt, sourceUrl: item.sourceUrl }),
              ) ?? [])
        const readable = result.filter((item): item is string => !!item)
        return readable.length
          ? readable
          : ['Informações da pesquisa disponíveis nos dados comerciais.']
      } catch {
        return [line]
      }
    })
    .join('\n')
}
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
