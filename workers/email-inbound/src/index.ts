import PostalMime from 'postal-mime'
import { buildPayload, hmacHex, sha256Hex } from './payload.js'

export interface Env {
  /** https://hub.yux.com.br/api/webhooks/email-inbound */
  WEBHOOK_URL: string
  /** Same value as EMAIL_INBOUND_SECRET in the API (wrangler secret). */
  INBOUND_SECRET: string
  /** Optional verified Email Routing destination for replies the API cannot accept. */
  FALLBACK_TO?: string
}

const MAX_RAW_BYTES = 10 * 1024 * 1024

async function deliver(env: Env, body: string) {
  const timestamp = Math.floor(Date.now() / 1000).toString()
  const signature = await hmacHex(env.INBOUND_SECRET, `${timestamp}.${body}`)
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(env.WEBHOOK_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-yux-timestamp': timestamp, 'x-yux-signature': signature },
        body,
      })
      if (response.status >= 500) throw new Error(`webhook_${response.status}`)
      if (!response.ok) return { ok: false, matched: false, status: response.status }
      const result = await response.json<{ matched?: boolean }>().catch(() => ({ matched: false }))
      return { ok: true, matched: result.matched === true, status: response.status }
    } catch {
      await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)))
    }
  }
  return { ok: false, matched: false, status: 0 }
}

export default {
  async email(message: ForwardableEmailMessage, env: Env): Promise<void> {
    if (message.rawSize > MAX_RAW_BYTES) {
      if (env.FALLBACK_TO) return void (await message.forward(env.FALLBACK_TO))
      return message.setReject('Mensagem grande demais para este endereço de resposta.')
    }
    const raw = await new Response(message.raw).arrayBuffer()
    const parsed = await PostalMime.parse(raw, { attachmentEncoding: 'arraybuffer' })
    const payload = buildPayload({
      envelopeTo: message.to,
      envelopeFrom: message.from,
      parsed,
      headers: message.headers,
      // Deterministic fallback keeps redelivery idempotent when Message-ID is missing.
      fallbackMessageId: `<${await sha256Hex(raw)}@inbound.yux>`,
    })
    const result = await deliver(env, JSON.stringify(payload))
    if (result.ok && result.matched) return
    // Unknown address or API unavailable: never lose the message silently.
    if (env.FALLBACK_TO) {
      await message.forward(env.FALLBACK_TO, new Headers({ 'X-YUX-Inbound-Status': result.ok ? 'unmatched' : `delivery_failed_${result.status}` }))
      return
    }
    if (!result.ok) throw new Error('yux_inbound_delivery_failed')
    message.setReject('Endereço de resposta desconhecido.')
  },
}
