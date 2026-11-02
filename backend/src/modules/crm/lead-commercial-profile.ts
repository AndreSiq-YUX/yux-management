import { z } from 'zod'
import { radarCommercialFactsSchemaForCompany, radarCommercialUrl } from '../radar/commercial-view.js'

/** Business-only projection: unknown keys are stripped at every nested boundary. */
export function projectLeadCommercialProfile(value: unknown) {
  const data = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
  const identities = [data.legalName, data.tradeName].filter((name): name is string => typeof name === 'string')
  const facts = radarCommercialFactsSchemaForCompany(identities).parse(data)
  return { ...facts, contacts: (facts.contacts ?? []).filter(contact =>
    contact.association === 'confirmed' && contact.scope !== 'unresolved' &&
    ['email','phone','whatsapp','social','contact_form','business_person'].includes(contact.kind ?? '') &&
    typeof contact.value === 'string' &&
    (!['social','contact_form'].includes(contact.kind ?? '') || !!radarCommercialUrl(contact.value))) }
}
export type LeadCommercialProfile = ReturnType<typeof projectLeadCommercialProfile>
export const leadCommercialProfileSchema = z.unknown().transform(projectLeadCommercialProfile)
export const commercialUrlInput = z.string().trim().max(2048).refine(value => value === '' || !!radarCommercialUrl(value), 'Informe uma URL pública http ou https.').nullable().optional()
