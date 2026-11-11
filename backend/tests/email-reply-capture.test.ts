import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { parseReplyToken, replyAddress, stripQuotedReply, verifyInboundSignature } from '../src/email/reply-capture.js'

const token = 'abcdefghijklmnopqrstuvwx'
const domain = 'respostas.yux.com.br'

describe('reply capture helpers', () => {
  it('round-trips the routed address and rejects anything else', () => {
    expect(replyAddress(token, domain)).toBe(`r+${token}@${domain}`)
    expect(parseReplyToken(`r+${token}@${domain}`, domain)).toBe(token)
    expect(parseReplyToken(`R+${token}@RESPOSTAS.YUX.COM.BR`, domain)).toBe(token)
    expect(parseReplyToken(`x+${token}@${domain}`, domain)).toBeNull()
    expect(parseReplyToken(`r+${token}@outro.com.br`, domain)).toBeNull()
    expect(parseReplyToken(`r+curto@${domain}`, domain)).toBeNull()
    expect(parseReplyToken(`r@${domain}`, domain)).toBeNull()
  })

  it('accepts only fresh, correctly signed deliveries', () => {
    const rawBody = Buffer.from('{"a":1}')
    const now = 1_700_000_000_000
    const timestamp = String(now / 1000)
    const signature = createHmac('sha256', 'secret').update(`${timestamp}.{"a":1}`).digest('hex')
    expect(verifyInboundSignature({ secret: 'secret', timestamp, signature, rawBody, now })).toBe(true)
    expect(verifyInboundSignature({ secret: 'secret', timestamp, signature: `sha256=${signature}`, rawBody, now })).toBe(true)
    expect(verifyInboundSignature({ secret: 'other', timestamp, signature, rawBody, now })).toBe(false)
    expect(verifyInboundSignature({ secret: 'secret', timestamp, signature, rawBody: Buffer.from('{"a":2}'), now })).toBe(false)
    expect(verifyInboundSignature({ secret: 'secret', timestamp, signature, rawBody, now: now + 301_000 })).toBe(false)
    expect(verifyInboundSignature({ secret: 'secret', timestamp: undefined, signature, rawBody, now })).toBe(false)
  })

  it('keeps the new text and drops the quoted thread', () => {
    expect(stripQuotedReply('Tenho interesse.\n\nEm seg., 10 de nov. de 2026 às 09:00, Villeman <v@x.com> escreveu:\n> Olá')).toBe('Tenho interesse.')
    expect(stripQuotedReply('Ok!\nOn Mon, Nov 10, 2026 at 9:00 AM Villeman wrote:\n> hi')).toBe('Ok!')
    expect(stripQuotedReply('Sim\n\nDe: Villeman\nEnviado: segunda\nPara: mim\nAssunto: x')).toBe('Sim')
    expect(stripQuotedReply('> só citação')).toBe('> só citação')
  })
})
