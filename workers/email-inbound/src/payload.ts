/** Pure helpers shared by the Worker and its tests (no Cloudflare runtime APIs). */

export type ParsedEmail = {
  from?: { address?: string; name?: string } | null
  subject?: string | null
  messageId?: string | null
  inReplyTo?: string | null
  text?: string | null
  html?: string | null
  attachments?: Array<{ filename?: string | null; mimeType?: string | null; content?: ArrayBuffer | string | Uint8Array }>
}

export type InboundPayload = {
  to: string
  from: string
  fromName: string | null
  subject: string | null
  text: string
  messageId: string
  inReplyTo: string | null
  receivedAt: string
  autoSubmitted: boolean
  attachments: Array<{ filename: string | null; mimeType: string | null; size: number }>
}

const MAX_TEXT = 200_000

export function normalizeMessageId(value: string | null | undefined) {
  const id = (value ?? '').trim().split(/\s+/)[0] ?? ''
  if (!id) return null
  const bare = id.replace(/^<|>$/g, '')
  return /^[^<>\s@]+@[^<>\s@]+$/.test(bare) ? `<${bare}>` : null
}

export function htmlToText(html: string | null | undefined) {
  if (!html) return ''
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** RFC 3834 Auto-Submitted plus the de facto headers and subjects used by out-of-office replies. */
export function isAutoReply(headers: { get(name: string): string | null }, subject: string | null | undefined) {
  const autoSubmitted = (headers.get('auto-submitted') ?? '').trim().toLowerCase()
  if (autoSubmitted && autoSubmitted !== 'no') return true
  if (headers.get('x-autoreply') || headers.get('x-autorespond') || headers.get('x-autoreply-from')) return true
  const precedence = (headers.get('precedence') ?? '').toLowerCase()
  if (['auto_reply', 'bulk', 'junk', 'list'].includes(precedence)) return true
  return /^\s*(resposta autom[aá]tica|automatic reply|auto(matic)?[- ]?reply|out of (the )?office|ausente|f[eé]rias)\b/i.test(subject ?? '')
}

function size(content: ArrayBuffer | string | Uint8Array | undefined) {
  if (!content) return 0
  if (typeof content === 'string') return content.length
  return content.byteLength
}

export function buildPayload(input: {
  envelopeTo: string
  envelopeFrom: string
  parsed: ParsedEmail
  headers: { get(name: string): string | null }
  fallbackMessageId: string
  now?: Date
}): InboundPayload {
  const { parsed } = input
  const text = (parsed.text?.trim() || htmlToText(parsed.html)).slice(0, MAX_TEXT)
  return {
    to: input.envelopeTo.trim(),
    from: (parsed.from?.address || input.envelopeFrom).trim().toLowerCase(),
    fromName: parsed.from?.name?.trim() || null,
    subject: parsed.subject?.trim() || null,
    text,
    messageId: normalizeMessageId(parsed.messageId) ?? input.fallbackMessageId,
    inReplyTo: normalizeMessageId(parsed.inReplyTo),
    receivedAt: (input.now ?? new Date()).toISOString(),
    autoSubmitted: isAutoReply(input.headers, parsed.subject),
    attachments: (parsed.attachments ?? []).slice(0, 50).map(attachment => ({
      filename: attachment.filename?.slice(0, 255) || null,
      mimeType: attachment.mimeType?.slice(0, 255) || null,
      size: size(attachment.content),
    })),
  }
}

export async function hmacHex(secret: string, message: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message))
  return [...new Uint8Array(signature)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

export async function sha256Hex(data: ArrayBuffer) {
  const digest = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}
