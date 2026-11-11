import { describe, expect, it } from 'vitest'
import { buildPayload, hmacHex, htmlToText, isAutoReply, normalizeMessageId } from './payload.js'

const headers = (values: Record<string, string> = {}) => ({ get: (name: string) => values[name.toLowerCase()] ?? null })

describe('inbound payload', () => {
  it('builds the API payload from a parsed reply', () => {
    const payload = buildPayload({
      envelopeTo: 'r+abcdefghijklmnopqrstuv@respostas.yux.com.br',
      envelopeFrom: 'bounce@empresa.test',
      parsed: {
        from: { address: 'Compras@Empresa.test', name: 'Maria Compras' },
        subject: 'Re: Proposta',
        messageId: 'abc123@mail.empresa.test',
        inReplyTo: '<orig@smtp2go>',
        html: '<p>Tenho interesse.<br>Podemos falar?</p><style>p{}</style>',
        attachments: [{ filename: 'pedido.pdf', mimeType: 'application/pdf', content: new Uint8Array(42) }],
      },
      headers: headers(),
      fallbackMessageId: '<fallback@inbound.yux>',
      now: new Date('2026-11-12T10:00:00Z'),
    })
    expect(payload).toEqual({
      to: 'r+abcdefghijklmnopqrstuv@respostas.yux.com.br',
      from: 'compras@empresa.test',
      fromName: 'Maria Compras',
      subject: 'Re: Proposta',
      text: 'Tenho interesse.\nPodemos falar?',
      messageId: '<abc123@mail.empresa.test>',
      inReplyTo: '<orig@smtp2go>',
      receivedAt: '2026-11-12T10:00:00.000Z',
      autoSubmitted: false,
      attachments: [{ filename: 'pedido.pdf', mimeType: 'application/pdf', size: 42 }],
    })
  })

  it('uses the deterministic fallback when the Message-ID is missing or malformed', () => {
    const payload = buildPayload({
      envelopeTo: 'r+x@d', envelopeFrom: 'a@b.test', parsed: { text: 'ok', messageId: '<bad id>' },
      headers: headers(), fallbackMessageId: '<hash@inbound.yux>',
    })
    expect(payload.messageId).toBe('<hash@inbound.yux>')
    expect(normalizeMessageId(' <a@b> <c@d>')).toBe('<a@b>')
  })

  it('flags out-of-office answers', () => {
    expect(isAutoReply(headers({ 'auto-submitted': 'auto-replied' }), 'Re: Proposta')).toBe(true)
    expect(isAutoReply(headers({ 'auto-submitted': 'no' }), 'Re: Proposta')).toBe(false)
    expect(isAutoReply(headers(), 'Resposta automática: Ausente')).toBe(true)
    expect(isAutoReply(headers({ precedence: 'bulk' }), 'Oi')).toBe(true)
    expect(isAutoReply(headers(), 'Re: Ausência de estoque')).toBe(false)
  })

  it('strips markup without executing anything', () => {
    expect(htmlToText('<script>alert(1)</script><div>A &amp; B</div>')).toBe('A & B')
  })

  it('signs like the API verifier (hex HMAC-SHA256 of "timestamp.body")', async () => {
    const { createHmac } = await import('node:crypto')
    const expected = createHmac('sha256', 'segredo').update('1700000000.{"a":1}').digest('hex')
    expect(await hmacHex('segredo', '1700000000.{"a":1}')).toBe(expected)
  })
})
