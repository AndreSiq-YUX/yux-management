const HEX_PATTERN = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i

/** Aceita "#RGB" ou "#RRGGBB" (com ou sem "#" ao digitar). */
export function normalizeHex(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  const withHash = trimmed.startsWith('#') ? trimmed : `#${trimmed}`
  return HEX_PATTERN.test(withHash) ? withHash.toLowerCase() : null
}

export function isValidHex(value: string): boolean {
  return normalizeHex(value) !== null
}

/** Valor aceito por `<input type="color">` (sempre "#rrggbb"). */
export function toColorInputValue(value: string): string {
  const hex = normalizeHex(value)
  if (!hex) return '#000000'
  if (hex.length === 4) return `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`
  return hex
}

/** `font-family` seguro para amostras de tipografia (não carrega fontes externas). */
export function fontFamilyFor(name: string): string {
  const safe = name.replace(/["';{}<>]/g, '').trim()
  return safe ? `"${safe}", system-ui, sans-serif` : 'system-ui, sans-serif'
}

export interface SampleMessageInput {
  brandName?: string
  toneOfVoice?: string
  persona?: string // reservado: o público aparece no cartão, não na mensagem
  brandVoiceSummary?: string
  vocabularyDo?: string[]
}

const endSentence = (text: string) => (/[.!?…]$/.test(text) ? text : `${text}.`)

/**
 * Mensagem de exemplo montada a partir dos campos de tom de voz (sem IA):
 * mostra ao cliente como o que ele escreveu aparece em uma saudação.
 * Devolve `null` quando não há nada definido.
 */
export function composeSampleMessage(input: SampleMessageInput): string | null {
  const tone = input.toneOfVoice?.trim()
  const summary = input.brandVoiceSummary?.trim()
  const words = (input.vocabularyDo ?? []).map(word => word.trim()).filter(Boolean).slice(0, 2)
  if (!tone && !summary && !words.length) return null

  const parts: string[] = [input.brandName?.trim() ? `Olá! Aqui é a ${input.brandName.trim()}.` : 'Olá! Que bom falar com você.']
  if (summary) parts.push(endSentence(summary))
  if (tone) parts.push(endSentence(`Nosso jeito de conversar é ${tone.charAt(0).toLocaleLowerCase('pt-BR')}${tone.slice(1)}`))
  if (words.length) parts.push(`Conte com a gente: ${words.join(' e ')}.`)
  return parts.join(' ')
}
