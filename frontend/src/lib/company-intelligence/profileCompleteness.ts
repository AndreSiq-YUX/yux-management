import type { CompanyProfileInput } from '@/types/companyIntelligence'

export const BUSINESS_DAYS = [
  { key: 'monday', label: 'Segunda-feira' },
  { key: 'tuesday', label: 'Terça-feira' },
  { key: 'wednesday', label: 'Quarta-feira' },
  { key: 'thursday', label: 'Quinta-feira' },
  { key: 'friday', label: 'Sexta-feira' },
  { key: 'saturday', label: 'Sábado' },
  { key: 'sunday', label: 'Domingo' },
] as const

export interface ProfileCompletenessItem {
  key: string
  label: string
  /** Id do campo do formulário que recebe o foco quando a pessoa clica no item faltante. */
  fieldId: string
  complete: boolean
}

export interface ProfileCompleteness {
  percent: number
  items: ProfileCompletenessItem[]
  missing: ProfileCompletenessItem[]
}

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

const filled = (value: unknown) => typeof value === 'string' && value.trim().length > 0

/** Algum dia da semana com horário de atendimento definido. */
export function hasBusinessHours(hours: unknown): boolean {
  const record = asRecord(hours)
  return BUSINESS_DAYS.some(({ key }) => {
    const day = asRecord(record[key])
    return filled(day.open) && filled(day.close) && day.closed !== true
  })
}

type CompletenessInput = Pick<
  CompanyProfileInput,
  | 'legalName' | 'tradeName' | 'description' | 'websiteUrl' | 'industry' | 'positioning' | 'differentiators'
  | 'emails' | 'phones' | 'address' | 'businessHours' | 'serviceRegions' | 'socialLinks'
>

/** Medidor "Perfil X% completo": cada item pesa igual. */
export function computeProfileCompleteness(profile: CompletenessInput): ProfileCompleteness {
  const address = asRecord(profile.address)
  const social = asRecord(profile.socialLinks)
  const firstEmptyAddress = (['street', 'city', 'state'] as const).find(key => !filled(address[key])) ?? 'street'
  const items: ProfileCompletenessItem[] = [
    { key: 'tradeName', label: 'Nome da marca', fieldId: 'trade-name', complete: filled(profile.tradeName) },
    { key: 'legalName', label: 'Razão social', fieldId: 'legal-name', complete: filled(profile.legalName) },
    { key: 'industry', label: 'Segmento', fieldId: 'industry', complete: filled(profile.industry) },
    { key: 'emails', label: 'E-mail público', fieldId: 'company-emails', complete: profile.emails.length > 0 },
    { key: 'phones', label: 'Telefone', fieldId: 'company-phones', complete: profile.phones.length > 0 },
    { key: 'websiteUrl', label: 'Site', fieldId: 'website', complete: filled(profile.websiteUrl) },
    {
      key: 'social',
      label: 'Redes sociais',
      fieldId: 'instagram',
      complete: filled(social.instagram) || filled(social.linkedin) || filled(social.facebook),
    },
    { key: 'description', label: 'Descrição institucional', fieldId: 'company-description', complete: filled(profile.description) },
    { key: 'positioning', label: 'Posicionamento', fieldId: 'positioning', complete: filled(profile.positioning) },
    { key: 'differentiators', label: 'Diferenciais', fieldId: 'differentiators', complete: profile.differentiators.length > 0 },
    { key: 'serviceRegions', label: 'Regiões atendidas', fieldId: 'service-regions', complete: profile.serviceRegions.length > 0 },
    {
      key: 'address',
      label: 'Endereço',
      fieldId: `address-${firstEmptyAddress}`,
      complete: filled(address.street) && filled(address.city) && filled(address.state),
    },
    { key: 'businessHours', label: 'Horário de atendimento', fieldId: 'hours-monday-enabled', complete: hasBusinessHours(profile.businessHours) },
  ]
  const missing = items.filter(item => !item.complete)
  return { percent: Math.round(((items.length - missing.length) / items.length) * 100), items, missing }
}

/** Perfil "vazio": quase nada preenchido (usado para abrir o cartão "Preencher com o site"). */
export function isProfileEmpty(profile: CompletenessInput): boolean {
  return computeProfileCompleteness(profile).percent < 25
}
