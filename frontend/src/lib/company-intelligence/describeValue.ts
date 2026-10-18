const KEY_LABELS: Record<string, string> = {
  monday: 'Segunda',
  tuesday: 'Terça',
  wednesday: 'Quarta',
  thursday: 'Quinta',
  friday: 'Sexta',
  saturday: 'Sábado',
  sunday: 'Domingo',
  weekdays: 'Segunda a sexta',
  weekend: 'Fim de semana',
  weekends: 'Fim de semana',
  holidays: 'Feriados',
  everyday: 'Todos os dias',
  street: 'Rua',
  number: 'Número',
  complement: 'Complemento',
  district: 'Bairro',
  neighborhood: 'Bairro',
  city: 'Cidade',
  state: 'Estado',
  zip: 'CEP',
  postalCode: 'CEP',
  instagram: 'Instagram',
  linkedin: 'LinkedIn',
  facebook: 'Facebook',
  youtube: 'YouTube',
  tiktok: 'TikTok',
  twitter: 'X (Twitter)',
  whatsapp: 'WhatsApp',
  open: 'Abre',
  close: 'Fecha',
  closed: 'Fechado',
  notes: 'Observações',
}

/** Rótulo em português de uma chave de objeto estruturado (endereço, horários, redes sociais…). */
export function keyLabel(key: string): string {
  if (KEY_LABELS[key]) return KEY_LABELS[key]
  const spaced = key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').trim()
  return spaced ? spaced.charAt(0).toUpperCase() + spaced.slice(1) : key
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

/**
 * Texto legível de um valor qualquer (texto, lista, objeto), para exibir ao cliente sem mostrar JSON.
 * Ex.: `{ monday: { open: '09:00', close: '18:00' } }` → "Segunda: 09:00 às 18:00".
 */
export function describeValue(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) {
    return value.map(describeValue).filter(Boolean).join(' · ')
  }
  if (isRecord(value)) {
    if (value.closed === true) return 'Fechado'
    if (typeof value.open === 'string' && typeof value.close === 'string') return `${value.open} às ${value.close}`
    return Object.entries(value)
      .map(([key, entry]) => {
        const text = describeValue(entry)
        return text ? `${keyLabel(key)}: ${text}` : ''
      })
      .filter(Boolean)
      .join('; ')
  }
  return ''
}

/** Objeto de uma camada só, com valores simples (texto/número): pode ser editado campo a campo. */
export function isFlatRecord(value: unknown): value is Record<string, string | number> {
  return (
    isRecord(value) &&
    Object.keys(value).length > 0 &&
    Object.values(value).every(entry => typeof entry === 'string' || typeof entry === 'number')
  )
}
